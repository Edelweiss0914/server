from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.browser import browser_manager
from app.config import settings
from app.database import get_db
from app.models import UserSession
from app.schemas import AuthStatus, LoginRequest, LoginResponse, VerifyEmailRequest

router = APIRouter(prefix="/auth", tags=["auth"])


async def _get_active_session(db: AsyncSession) -> UserSession | None:
    result = await db.execute(
        select(UserSession).where(UserSession.is_active == True).order_by(UserSession.last_login.desc())
    )
    return result.scalars().first()


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest, db: AsyncSession = Depends(get_db)) -> LoginResponse:
    success = await browser_manager.login(request.student_id, request.password)

    if success:
        # Deactivate previous sessions
        result = await db.execute(select(UserSession).where(UserSession.is_active == True))
        for old_session in result.scalars().all():
            old_session.is_active = False

        # Upsert session record for this student
        result = await db.execute(
            select(UserSession).where(UserSession.student_id == request.student_id)
        )
        session = result.scalars().first()

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if session is None:
            session = UserSession(
                student_id=request.student_id,
                is_active=True,
                last_login=now,
                browser_state_path=str(settings.BROWSER_STATE_PATH),
            )
            db.add(session)
        else:
            session.is_active = True
            session.last_login = now
            session.browser_state_path = str(settings.BROWSER_STATE_PATH)

        await db.commit()
        return LoginResponse(success=True, message="Login successful", student_id=request.student_id)

    return LoginResponse(success=False, message="Login failed. Check credentials.")


@router.post("/logout")
async def logout(db: AsyncSession = Depends(get_db)) -> dict:
    session = await _get_active_session(db)
    if session is None:
        return {"success": True, "message": "No active session"}

    # Clear browser state
    await browser_manager.close()

    session.is_active = False
    await db.commit()
    return {"success": True, "message": "Logged out"}


@router.get("/status", response_model=AuthStatus)
async def status(db: AsyncSession = Depends(get_db)) -> AuthStatus:
    logged_in = await browser_manager.is_logged_in()

    session = await _get_active_session(db)

    if not logged_in and session is not None:
        # Session expired — mark inactive
        session.is_active = False
        await db.commit()
        session = None

    return AuthStatus(
        is_logged_in=logged_in,
        student_id=session.student_id if session else None,
        last_login=session.last_login.isoformat() if session and session.last_login else None,
    )


@router.post("/verify-email")
async def verify_email(request: VerifyEmailRequest, db: AsyncSession = Depends(get_db)) -> dict:
    session = await _get_active_session(db)
    if session is None:
        raise HTTPException(status_code=401, detail="Not logged in")

    try:
        page = await browser_manager.get_page()

        # Try to find email verification input on the current page or a popup
        code_input = await page.query_selector("input[name='authCode'], input[id*='code'], input[placeholder*='인증']")
        if code_input is None:
            raise HTTPException(status_code=404, detail="Email verification form not found on current page")

        await code_input.fill(request.code)

        submit_btn = await page.query_selector("button[type='submit'], .btn-verify, input[type='submit']")
        if submit_btn:
            await submit_btn.click()
            await page.wait_for_load_state("networkidle", timeout=15_000)

        return {"success": True, "message": "Verification code submitted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Verification failed: {e}")
