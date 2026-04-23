import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.browser import browser_manager
from app.config import settings
from app.database import get_db
from app.schemas import CourseResponse, LectureResponse

router = APIRouter(prefix="/courses", tags=["courses"])
logger = logging.getLogger(__name__)


@router.get("/", response_model=list[CourseResponse])
async def list_courses(db: AsyncSession = Depends(get_db)) -> list[CourseResponse]:
    """Fetch course list from E-class main dashboard."""
    page = await browser_manager.get_page()
    await page.goto(
        f"{settings.ECLASS_BASE_URL}/home/mainHome/Form/myPage",
        wait_until="networkidle",
        timeout=30000,
    )

    # Courses are rendered as <a href="javascript:moveClassRoomMain(...)"> links
    # Pattern: moveClassRoomMain('courseCode', 'courseId', 'UNI'|'CO')
    raw_courses = await page.evaluate("""() => {
        const results = [];
        document.querySelectorAll('a[href*="moveClassRoomMain"]').forEach(a => {
            const match = a.href.match(/moveClassRoomMain\\s*\\(\\s*'([^']*)'\\s*,\\s*'([^']*)'\\s*,\\s*'([^']*)'\\s*\\)/);
            if (match) {
                results.push({
                    course_code: match[1],
                    course_id: match[2],
                    course_type: match[3],
                    course_name: a.innerText.trim()
                });
            }
        });
        return results;
    }""")

    courses = []
    seen_ids: set[str] = set()
    for c in raw_courses:
        cid = c["course_id"]
        if not cid or cid in seen_ids:
            continue
        seen_ids.add(cid)
        courses.append(
            CourseResponse(
                course_id=cid,
                course_name=c["course_name"],
                professor="",
                attendance_rate=None,
            )
        )

    logger.info("Fetched %d courses", len(courses))
    return courses


@router.get("/debug/html")
async def debug_courses_html(url: str = "") -> dict[str, Any]:
    """Return raw HTML for selector debugging. Pass ?url= to override target."""
    page = await browser_manager.get_page()
    logged_in = await browser_manager.is_logged_in()

    target = url or f"{settings.ECLASS_BASE_URL}/home/mainHome/Form/main"
    await page.goto(target, wait_until="networkidle", timeout=30000)

    # Collect all links for navigation discovery
    links = await page.evaluate("""() => {
        return Array.from(document.querySelectorAll('a[href]')).map(a => ({
            href: a.href,
            text: a.innerText.trim().substring(0, 100),
            id: a.id || '',
            class: a.className || ''
        })).filter(l => l.text.length > 0).slice(0, 100);
    }""")

    html = await page.content()
    return {
        "logged_in": logged_in,
        "current_url": page.url,
        "html_length": len(html),
        "links": links,
        "html": html[:50000],
    }


@router.get("/{course_id}/lectures", response_model=list[LectureResponse])
async def list_lectures(
    course_id: str,
    db: AsyncSession = Depends(get_db),
) -> list[LectureResponse]:
    """Fetch lecture list for a specific course via browser."""
    page = await browser_manager.get_page()
    await page.goto(
        f"{settings.ECLASS_BASE_URL}/ilos/st/course/online_list_form.acl?KJKEY={course_id}",
        wait_until="networkidle",
        timeout=30000,
    )

    lectures = []

    # NOTE: Row selector needs validation against real site structure
    rows = await page.query_selector_all("tr.lecture-row, .online-lecture-list tr, tbody tr")

    for row in rows:
        # NOTE: These td selectors are estimates; real site may use different class names
        week_el = await row.query_selector("td.week, td:nth-child(1)")
        session_el = await row.query_selector("td.session, td:nth-child(2)")
        title_el = await row.query_selector("td.title a, td.title, td:nth-child(3) a, td:nth-child(3)")
        status_el = await row.query_selector("td.attend-status, td.attendance, td:nth-child(4)")
        deadline_el = await row.query_selector("td.deadline, td:nth-child(5)")

        if not title_el:
            continue

        week_text = await week_el.inner_text() if week_el else "0"
        session_text = await session_el.inner_text() if session_el else "0"
        title_text = await title_el.inner_text()
        status_text = (await status_el.inner_text() if status_el else "").strip()
        deadline_text = (await deadline_el.inner_text() if deadline_el else "").strip()

        # Parse week/session as integers
        try:
            week = int(week_text.strip())
        except ValueError:
            week = 0
        try:
            session = int(session_text.strip())
        except ValueError:
            session = 0

        # Map Korean attendance status strings to internal values
        if status_text in ("출석", "Y"):
            attendance = "completed"
        elif status_text == "부분출석":
            attendance = "partial"
        elif status_text in ("결석", "N"):
            attendance = "absent"
        else:
            attendance = "not_started"

        # Extract lecture_id from data-seq or link href
        lecture_id = f"{course_id}_W{week:02d}_S{session:02d}"
        data_seq = await row.get_attribute("data-seq")
        if data_seq:
            lecture_id = data_seq
        else:
            link_el = await row.query_selector("a[href*='CONTENT_SEQ']")
            if link_el:
                href = await link_el.get_attribute("href") or ""
                if "CONTENT_SEQ=" in href:
                    lecture_id = href.split("CONTENT_SEQ=")[1].split("&")[0]

        # Parse deadline — format is typically "YYYY-MM-DD HH:MM"
        deadline = None
        if deadline_text and deadline_text not in ("-", ""):
            try:
                from datetime import datetime
                deadline = datetime.strptime(deadline_text[:16], "%Y-%m-%d %H:%M")
            except ValueError:
                pass

        lectures.append(
            LectureResponse(
                id=lecture_id.strip(),
                week=week,
                session=session,
                title=title_text.strip(),
                duration_min=None,
                attendance=attendance,
                deadline=deadline,
            )
        )

    logger.info("Fetched %d lectures for course %s", len(lectures), course_id)
    return lectures


@router.get("/{course_id}/attendance")
async def get_attendance_summary(
    course_id: str,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Return attendance summary for a course. Calculates counts from the lectures endpoint."""
    lectures = await list_lectures(course_id, db)

    completed = sum(1 for lec in lectures if lec.attendance == "completed")
    partial = sum(1 for lec in lectures if lec.attendance == "partial")
    absent = sum(1 for lec in lectures if lec.attendance == "absent")
    not_started = sum(1 for lec in lectures if lec.attendance == "not_started")
    total = len(lectures)

    return {
        "course_id": course_id,
        "total": total,
        "completed": completed,
        "partial": partial,
        "absent": absent,
        "not_started": not_started,
    }
