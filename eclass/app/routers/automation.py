import asyncio
import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.browser import browser_manager
from app.config import settings
from app.database import get_db
from app.models import AutomationLog
from app.schemas import AttendRequest, AutomationStatusResponse

router = APIRouter(prefix="/automation", tags=["automation"])
logger = logging.getLogger(__name__)


class EmailVerificationRequired(Exception):
    """Raised when E-class demands an email verification code mid-session."""


class AutomationState:
    def __init__(self):
        self.state: str = "idle"  # idle, running, email_verification_required, error
        self.current_course: str | None = None
        self.current_lecture: str | None = None
        self.progress: int = 0
        self.message: str = ""
        self._task: asyncio.Task | None = None


automation_state = AutomationState()


async def _do_attend_lecture(course_id: str, lecture_id: str, db: AsyncSession) -> dict[str, Any]:
    """Perform actual lecture attendance via Playwright browser automation."""
    page = await browser_manager.get_page()

    # Navigate to the course lecture list
    # NOTE: URL pattern needs validation against real site
    await page.goto(
        f"{settings.ECLASS_BASE_URL}/ilos/st/course/online_list_form.acl?KJKEY={course_id}",
        wait_until="networkidle",
        timeout=30000,
    )

    # Find and click the play button for this lecture
    # NOTE: data-seq attribute and selector patterns need real site validation
    play_btn = await page.query_selector(
        f'[data-seq="{lecture_id}"] .btn-play, '
        f'[data-seq="{lecture_id}"] .lecture-start-btn, '
        f'tr[data-seq="{lecture_id}"] a.btn-play'
    )
    if play_btn is None:
        # Fallback: try CONTENT_SEQ-based link selector
        # NOTE: Fallback selector also needs site validation
        play_btn = await page.query_selector(
            f'a[href*="CONTENT_SEQ={lecture_id}"], '
            f'button[data-content-seq="{lecture_id}"]'
        )

    if play_btn is None:
        raise HTTPException(
            status_code=404,
            detail=f"Lecture play button not found for lecture_id={lecture_id}",
        )

    # Click play — this opens a popup window
    async with page.expect_popup() as popup_info:
        await play_btn.click()
    popup = await popup_info.value
    await popup.wait_for_load_state("networkidle", timeout=30000)
    logger.info("Lecture popup opened: %s", popup.url)

    # Poll for video completion (check every 30s, up to 2 hours)
    max_polls = 240
    for poll in range(max_polls):
        # Detect email verification modal
        # NOTE: Modal selector needs real site validation
        verify_modal = await popup.query_selector(
            ".email-verify-modal, #verificationCodeInput, .verification-modal"
        )
        if verify_modal:
            logger.warning("Email verification modal detected for lecture %s", lecture_id)
            raise EmailVerificationRequired(
                f"이메일 인증이 필요합니다 (lecture_id={lecture_id})"
            )

        # Handle checkpoint/confirmation buttons that appear during playback
        # NOTE: Checkpoint selector needs real site validation
        checkpoint_btn = await popup.query_selector(
            ".checkpoint-btn, .confirm-btn, .quiz-confirm, #btnCheckpoint"
        )
        if checkpoint_btn:
            logger.info("Checkpoint button detected, clicking")
            await checkpoint_btn.click()
            await asyncio.sleep(1)
            continue

        # Check for completion indicator
        # NOTE: Progress/completion selectors need real site validation
        completed_el = await popup.query_selector(
            ".complete-icon, .study-complete, #studyComplete, .progress-complete"
        )
        if completed_el:
            logger.info("Lecture completion indicator found")
            break

        # Check progress percentage via JS evaluation
        # NOTE: Progress bar selector needs real site validation
        progress_pct: float = await popup.evaluate(
            """() => {
                const bar = document.querySelector('.progress-bar, #progressBar, .study-progress');
                if (!bar) return 0;
                const w = bar.style.width || bar.getAttribute('aria-valuenow') || '0';
                return parseFloat(w);
            }"""
        )
        logger.debug("Lecture %s progress: %s%%", lecture_id, progress_pct)

        if progress_pct >= 100:
            logger.info("Lecture %s reached 100%% progress", lecture_id)
            break

        await asyncio.sleep(30)
    else:
        logger.warning("Lecture %s polling timed out after %d polls", lecture_id, max_polls)

    # Click 학습종료 (end session) button
    # NOTE: End button selector needs real site validation
    end_btn = await popup.query_selector(
        ".btn-end-study, #btnEndStudy, .study-end-btn, a.end-study"
    )
    if end_btn:
        logger.info("Clicking 학습종료 button for lecture %s", lecture_id)
        await end_btn.click()
        try:
            await popup.wait_for_close(timeout=10000)
        except Exception:
            pass  # Popup may redirect instead of closing
    else:
        logger.warning("학습종료 button not found for lecture %s; closing popup manually", lecture_id)
        try:
            await popup.close()
        except Exception:
            pass

    return {
        "course_id": course_id,
        "lecture_id": lecture_id,
        "status": "success",
        "message": "출석 완료",
    }


async def _attend_all_task(db: AsyncSession) -> None:
    """Background async task: iterate all courses and attend all incomplete lectures."""
    from app.routers.courses import list_courses, list_lectures

    automation_state.state = "running"
    automation_state.progress = 0
    automation_state.message = "자동 출석 시작..."

    try:
        automation_state.message = "강좌 목록 조회 중..."
        courses = await list_courses(db)
        logger.info("Found %d courses for auto-attend", len(courses))

        # Collect all incomplete lectures across all courses
        all_pending: list[tuple[str, str]] = []
        for course in courses:
            automation_state.message = f"강좌 강의 목록 조회 중: {course.course_name}"
            lectures = await list_lectures(course.course_id, db)
            for lec in lectures:
                if lec.attendance != "completed":
                    all_pending.append((course.course_id, lec.id))

        total = len(all_pending)
        logger.info("Total incomplete lectures: %d", total)

        for idx, (course_id, lecture_id) in enumerate(all_pending):
            automation_state.current_course = course_id
            automation_state.current_lecture = lecture_id
            automation_state.message = f"출석 중: {course_id} / {lecture_id}"

            try:
                result = await _do_attend_lecture(course_id, lecture_id, db)
                status = result["status"]
                message = result.get("message", "")
            except EmailVerificationRequired as exc:
                automation_state.state = "email_verification_required"
                automation_state.message = "이메일 인증이 필요합니다. 인증 코드를 입력해주세요."
                logger.warning("Email verification required: %s", exc)

                # Wait until state is changed externally (user provides code)
                while automation_state.state == "email_verification_required":
                    await asyncio.sleep(5)

                # After verification, retry this lecture
                try:
                    result = await _do_attend_lecture(course_id, lecture_id, db)
                    status = result["status"]
                    message = result.get("message", "")
                except Exception as retry_exc:
                    status = "error"
                    message = str(retry_exc)
            except Exception as exc:
                logger.error("Error attending lecture %s/%s: %s", course_id, lecture_id, exc)
                status = "error"
                message = str(exc)

            # Log result
            log = AutomationLog(
                course_id=course_id,
                lecture_id=lecture_id,
                action="attend",
                status=status,
                message=message,
            )
            db.add(log)
            await db.commit()

            # Update progress percentage
            automation_state.progress = int((idx + 1) / total * 100) if total > 0 else 100
            automation_state.state = "running"

        automation_state.progress = 100
        automation_state.message = f"완료: {total}개 강의 처리됨"
        logger.info("Auto-attend finished: %d lectures processed", total)

    except asyncio.CancelledError:
        automation_state.message = "사용자에 의해 중단됨"
        raise
    except Exception as exc:
        automation_state.state = "error"
        automation_state.message = f"오류 발생: {exc}"
        logger.error("Auto-attend task error: %s", exc)
        return
    finally:
        if automation_state.state == "running":
            automation_state.state = "idle"
        automation_state.current_course = None
        automation_state.current_lecture = None
        automation_state._task = None


@router.post("/attend")
async def attend(
    body: AttendRequest,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Single lecture attendance."""
    result = await _do_attend_lecture(body.course_id, body.lecture_id, db)

    log = AutomationLog(
        course_id=body.course_id,
        lecture_id=body.lecture_id,
        action="attend",
        status=result["status"],
        message=result.get("message"),
    )
    db.add(log)
    await db.commit()

    return result


@router.post("/attend-all")
async def attend_all(db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """
    Auto-attend all incomplete lectures as a background task.
    Sets state to 'running' and returns immediately.
    """
    if automation_state.state == "running":
        raise HTTPException(status_code=409, detail="이미 자동 출석이 실행 중입니다.")

    automation_state._task = asyncio.create_task(_attend_all_task(db))
    return {"message": "자동 출석 작업을 시작했습니다.", "state": "running"}


@router.get("/status", response_model=AutomationStatusResponse)
async def get_status() -> AutomationStatusResponse:
    """Return current automation state."""
    return AutomationStatusResponse(
        state=automation_state.state,
        current_course=automation_state.current_course,
        current_lecture=automation_state.current_lecture,
        progress=automation_state.progress,
        message=automation_state.message,
    )


@router.post("/stop")
async def stop() -> dict[str, str]:
    """Cancel the running background task and reset state to idle."""
    if automation_state._task and not automation_state._task.done():
        automation_state._task.cancel()
        try:
            await automation_state._task
        except asyncio.CancelledError:
            pass

    automation_state.state = "idle"
    automation_state.current_course = None
    automation_state.current_lecture = None
    automation_state.progress = 0
    automation_state.message = "중단됨"
    automation_state._task = None

    return {"message": "자동 출석 작업이 중단되었습니다.", "state": "idle"}
