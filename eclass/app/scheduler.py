import logging
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def scheduled_attend_all():
    """Triggered by cron schedule to auto-attend all lectures."""
    from app.routers.automation import automation_state, _attend_all_task
    from app.database import AsyncSessionLocal

    if automation_state.state == "running":
        logger.info("Skipping scheduled attend-all: already running")
        return

    logger.info("Starting scheduled auto-attend")
    async with AsyncSessionLocal() as db:
        await _attend_all_task(db)


def update_schedule(cron_expression: str | None, enabled: bool):
    """Update or remove the scheduled job."""
    job_id = "auto_attend_all"

    # Remove existing job if any
    existing = scheduler.get_job(job_id)
    if existing:
        scheduler.remove_job(job_id)

    if enabled and cron_expression:
        try:
            trigger = CronTrigger.from_crontab(cron_expression)
            scheduler.add_job(
                scheduled_attend_all,
                trigger=trigger,
                id=job_id,
                replace_existing=True,
            )
            logger.info("Scheduled auto-attend with cron: %s", cron_expression)
        except ValueError as e:
            logger.error("Invalid cron expression '%s': %s", cron_expression, e)
    else:
        logger.info("Auto-attend schedule disabled")
