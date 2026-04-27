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
    """Enter a course via moveClassRoomMain and scrape lecture list."""
    page = await browser_manager.get_page()

    # Step 1: Navigate to main dashboard
    await page.goto(
        f"{settings.ECLASS_BASE_URL}/home/mainHome/Form/myPage",
        wait_until="networkidle",
        timeout=30000,
    )

    # Step 2: Find and execute moveClassRoomMain for this course_id
    entered = await page.evaluate("""(courseId) => {
        const link = document.querySelector(`a[href*="moveClassRoomMain"][href*="'${courseId}'"]`);
        if (link) { link.click(); return true; }
        // Fallback: try all moveClassRoomMain links
        const all = document.querySelectorAll('a[href*="moveClassRoomMain"]');
        for (const a of all) {
            if (a.href.includes(courseId)) { a.click(); return true; }
        }
        return false;
    }""", course_id)

    if not entered:
        logger.warning("Could not find course link for %s", course_id)
        return []

    # Step 3: Wait for course page to load
    await page.wait_for_load_state("networkidle", timeout=30000)

    # Step 4: Navigate to online lecture list within the course
    # Try clicking the online lecture menu item
    online_menu = await page.query_selector("a[href*='online_list'], a[href*='online'], .sub-menu a:has-text('온라인'), a:has-text('온라인강의')")
    if online_menu:
        await online_menu.click()
        await page.wait_for_load_state("networkidle", timeout=15000)

    # Step 5: Scrape whatever content is on the page
    lectures_data = await page.evaluate("""() => {
        const results = [];
        // Try various lecture list patterns
        const rows = document.querySelectorAll('.lecture-item, .online-item, tbody tr, .week-item, .lesson-item, [class*="lesson"], [class*="lecture"]');
        rows.forEach((row, idx) => {
            const text = row.innerText.trim();
            if (text.length > 0 && text.length < 500) {
                results.push({
                    index: idx,
                    text: text.substring(0, 200),
                    tag: row.tagName,
                    className: row.className,
                    innerHTML: row.innerHTML.substring(0, 300)
                });
            }
        });
        // Also grab page title and URL for debugging
        return {
            url: window.location.href,
            title: document.title,
            bodyText: document.body.innerText.substring(0, 2000),
            elements: results.slice(0, 30)
        };
    }""")

    logger.info("Lecture page for %s: url=%s, elements=%d",
                course_id, lectures_data.get("url"), len(lectures_data.get("elements", [])))

    # For now, return empty — we need to see the page structure first
    # TODO: Parse actual lectures once we know the selectors
    return []


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
