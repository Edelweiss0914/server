from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import select

from app.browser import browser_manager
from app.database import init_db, AsyncSessionLocal
from app.models import AutoModeConfig
from app.routers import auth, courses, automation, auto_mode
from app.scheduler import scheduler, update_schedule


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await browser_manager.initialize()
    scheduler.start()
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(AutoModeConfig).limit(1))
        config = result.scalar_one_or_none()
        if config and config.enabled and config.schedule_cron:
            update_schedule(config.schedule_cron, True)
    yield
    scheduler.shutdown(wait=False)
    await browser_manager.shutdown()


app = FastAPI(title="E-Class Automation API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(automation.router)
app.include_router(auto_mode.router)


@app.get("/healthz")
async def healthz():
    return {"status": "ok"}
