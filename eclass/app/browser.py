import asyncio
import logging
from pathlib import Path
from typing import Optional

from playwright.async_api import async_playwright, Browser, BrowserContext, Page, Playwright

from app.config import settings

logger = logging.getLogger(__name__)

LOGIN_URL = f"{settings.ECLASS_BASE_URL}/home/mainHome/Form/main"
MAIN_URL = f"{settings.ECLASS_BASE_URL}/home/mainHome/Form/main"


class BrowserManager:
    """Singleton browser manager for E-class automation."""

    def __init__(self) -> None:
        self._playwright: Optional[Playwright] = None
        self._browser: Optional[Browser] = None
        self._context: Optional[BrowserContext] = None
        self._page: Optional[Page] = None
        self._lock = asyncio.Lock()

    async def initialize(self) -> None:
        """Launch playwright, create chromium browser, restore saved state if exists."""
        async with self._lock:
            if self._browser is not None:
                return

            self._playwright = await async_playwright().start()
            self._browser = await self._playwright.chromium.launch(headless=True)

            state_path = Path(settings.BROWSER_STATE_PATH)
            if state_path.exists():
                logger.info("Restoring browser state from %s", state_path)
                self._context = await self._browser.new_context(storage_state=str(state_path))
            else:
                self._context = await self._browser.new_context()

            self._context.on("page", self._on_new_page)
            logger.info("BrowserManager initialized")

    async def shutdown(self) -> None:
        """Save state, close browser, stop playwright."""
        async with self._lock:
            if self._context is not None:
                await self.save_state()
            if self._page is not None:
                try:
                    await self._page.close()
                except Exception:
                    pass
                self._page = None
            if self._context is not None:
                try:
                    await self._context.close()
                except Exception:
                    pass
                self._context = None
            if self._browser is not None:
                try:
                    await self._browser.close()
                except Exception:
                    pass
                self._browser = None
            if self._playwright is not None:
                try:
                    await self._playwright.stop()
                except Exception:
                    pass
                self._playwright = None
            logger.info("BrowserManager shut down")

    async def _on_new_page(self, page: Page) -> None:
        """Handle new popup pages opened by the browser."""
        logger.debug("New popup page opened: %s", page.url)
        # Auto-dismiss common E-class alert popups
        page.on("dialog", lambda dialog: asyncio.ensure_future(dialog.accept()))

    async def login(self, student_id: str, password: str) -> bool:
        """
        Navigate to login page, fill credentials, handle duplicate login popup,
        and return True if login succeeded.
        """
        page = await self.get_page()

        # Register dialog handler before navigation
        async def handle_dialog(dialog):
            logger.info("Login dialog: %s", dialog.message)
            await dialog.accept()

        page.on("dialog", handle_dialog)

        try:
            await page.goto(LOGIN_URL, wait_until="networkidle", timeout=30_000)

            # Fill login form (actual selectors from site: id=inputId, id=inputPwd, id=btnLogin)
            await page.wait_for_selector("#inputId", timeout=10_000)
            await page.fill("#inputId", student_id)
            await page.fill("#inputPwd", password)

            # Click login button
            await page.click("#btnLogin", timeout=10_000)

            # Wait for navigation after login attempt
            await page.wait_for_load_state("networkidle", timeout=30_000)

            # Handle duplicate login warning if it appears (separate page or dialog)
            try:
                dup_selector = "a.btn-primary, button.btn-primary, .duplicate-login-confirm"
                dup_el = await page.wait_for_selector(dup_selector, timeout=3_000)
                if dup_el:
                    logger.info("Duplicate login popup detected, confirming")
                    await dup_el.click()
                    await page.wait_for_load_state("networkidle", timeout=15_000)
            except Exception:
                pass  # No duplicate login popup

            success = await self._check_logged_in(page)
            if success:
                await self.save_state()
                logger.info("Login successful for student_id=%s", student_id)
            else:
                logger.warning("Login failed for student_id=%s", student_id)
            return success

        except Exception as e:
            logger.error("Login error: %s", e)
            return False
        finally:
            page.remove_listener("dialog", handle_dialog)

    async def is_logged_in(self) -> bool:
        """Check if session is still valid."""
        try:
            page = await self.get_page()
            return await self._check_logged_in(page)
        except Exception:
            return False

    async def _check_logged_in(self, page: Page) -> bool:
        """
        Navigate to main page and determine if user is authenticated.
        Returns False if redirected to login page.
        """
        try:
            await page.goto(MAIN_URL, wait_until="networkidle", timeout=20_000)
            current_url = page.url
            if "loginUser" in current_url or "doLogin" in current_url:
                return False
            # Additional check: look for logout link or user greeting
            logout_el = await page.query_selector("a[href*='logout'], .user-name, #userInfo")
            return logout_el is not None
        except Exception:
            return False

    async def save_state(self) -> None:
        """Save browser context storage state to config.BROWSER_STATE_PATH."""
        if self._context is None:
            return
        state_path = Path(settings.BROWSER_STATE_PATH)
        state_path.parent.mkdir(parents=True, exist_ok=True)
        await self._context.storage_state(path=str(state_path))
        logger.debug("Browser state saved to %s", state_path)

    async def load_state(self) -> None:
        """Reload saved state into the current browser context."""
        state_path = Path(settings.BROWSER_STATE_PATH)
        if not state_path.exists():
            logger.warning("No saved browser state found at %s", state_path)
            return
        # Re-create context with saved state
        if self._context is not None:
            await self._context.close()
        self._page = None
        self._context = await self._browser.new_context(storage_state=str(state_path))
        self._context.on("page", self._on_new_page)
        logger.info("Browser state loaded from %s", state_path)

    async def get_page(self) -> Page:
        """Return the active page, creating one if needed."""
        if self._context is None:
            raise RuntimeError("BrowserManager not initialized. Call initialize() first.")
        if self._page is None or self._page.is_closed():
            self._page = await self._context.new_page()
            # Auto-dismiss any dialogs on this page
            self._page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        return self._page

    async def close(self) -> None:
        """Close all pages and context."""
        if self._page is not None:
            try:
                await self._page.close()
            except Exception:
                pass
            self._page = None
        if self._context is not None:
            try:
                await self._context.close()
            except Exception:
                pass
            self._context = None


# Module-level singleton
browser_manager = BrowserManager()
