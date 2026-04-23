import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import AutoModeConfig
from app.schemas import AutoModeConfigRequest, AutoModeConfigResponse
from app.scheduler import update_schedule

router = APIRouter(prefix="/auto-mode", tags=["auto-mode"])


def _serialize_config(config: AutoModeConfig) -> AutoModeConfigResponse:
    target_courses: list[str] = []
    if config.target_courses:
        try:
            target_courses = json.loads(config.target_courses)
        except (json.JSONDecodeError, TypeError):
            target_courses = []

    return AutoModeConfigResponse(
        id=config.id,
        enabled=config.enabled,
        schedule_cron=config.schedule_cron,
        target_courses=target_courses,
        created_at=config.created_at.isoformat(),
        updated_at=config.updated_at.isoformat(),
    )


async def _get_or_create_config(db: AsyncSession) -> AutoModeConfig:
    result = await db.execute(select(AutoModeConfig).limit(1))
    config = result.scalar_one_or_none()
    if config is None:
        config = AutoModeConfig(
            enabled=False,
            schedule_cron=None,
            target_courses=json.dumps([]),
        )
        db.add(config)
        await db.commit()
        await db.refresh(config)
    return config


@router.get("/", response_model=AutoModeConfigResponse)
async def get_auto_mode(db: AsyncSession = Depends(get_db)) -> AutoModeConfigResponse:
    """Get AutoModeConfig from DB (creates default if not exists)."""
    config = await _get_or_create_config(db)
    return _serialize_config(config)


@router.put("/", response_model=AutoModeConfigResponse)
async def update_auto_mode(
    body: AutoModeConfigRequest,
    db: AsyncSession = Depends(get_db),
) -> AutoModeConfigResponse:
    """Update AutoModeConfig in DB, return updated config."""
    config = await _get_or_create_config(db)

    config.enabled = body.enabled
    config.schedule_cron = body.schedule_cron
    config.target_courses = json.dumps(body.target_courses)

    await db.commit()
    await db.refresh(config)

    update_schedule(body.schedule_cron, body.enabled)

    return _serialize_config(config)
