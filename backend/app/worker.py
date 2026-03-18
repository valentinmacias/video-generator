"""
Background polling worker.

Runs as an asyncio task inside the FastAPI process.
Every POLL_INTERVAL_SECONDS it checks all PROCESSING videos,
queries Google for their operation status and updates the DB.
"""
import asyncio
import logging
from .config import settings
from .database import (
    get_processing_videos,
    update_video_completed,
    update_video_failed,
    get_training_avatars,
    update_avatar_progress,
    update_avatar_ready,
    update_avatar_failed,
)
from .veo_client import poll_operation
from .kling_client import poll_kling_task
from .storage import save_video_bytes, upload_video_from_uri

logger = logging.getLogger(__name__)

_worker_task: asyncio.Task | None = None


async def _process_one_video(video: dict) -> None:
    video_id = video["id"]
    operation_name = video["operation_id"]

    logger.debug(f"Polling video {video_id} | operation={operation_name}")
    # Route to the correct poller based on operation prefix
    if operation_name.startswith("runway:"):
        from .runway_client import poll_runway_task
        result = await poll_runway_task(operation_name)
    elif operation_name.startswith("kling:"):
        result = await poll_kling_task(operation_name)
    else:
        result = await poll_operation(operation_name)

    if not result["done"]:
        return  # Still processing — try again next cycle

    if result["error"]:
        await update_video_failed(video_id, result["error"])
        return

    # --- Video is ready -------------------------------------------------------
    try:
        if result["video_uri"]:
            # Copy from Veo's output bucket to our bucket and get a signed URL
            gcs_uri, signed_url = upload_video_from_uri(result["video_uri"], video_id)
        elif result["video_bytes"]:
            gcs_uri, signed_url = save_video_bytes(result["video_bytes"], video_id)
        else:
            await update_video_failed(video_id, "Operation completed but no video data found")
            return

        await update_video_completed(video_id, signed_url, thumbnail_url=None)
        logger.info(f"Video {video_id} successfully stored at {gcs_uri}")

    except Exception as e:
        logger.error(f"Failed to store video {video_id}: {e}")
        await update_video_failed(video_id, f"Storage error: {e}")


async def _process_training_avatar(avatar: dict) -> None:
    """Poll a Runway training job and update the avatar record."""
    from .runway_client import get_training_progress
    avatar_id       = avatar["id"]
    training_job_id = avatar["training_job_id"]

    # Skip placeholder job IDs created when Runway API wasn't available
    if training_job_id.startswith("pending:"):
        return

    try:
        prog = await get_training_progress(training_job_id)
        status   = prog["status"]
        progress = prog["progress"]

        if status == "COMPLETED":
            custom_model_id = prog.get("custom_model_id") or training_job_id
            await update_avatar_ready(avatar_id, custom_model_id)
        elif status == "FAILED":
            await update_avatar_failed(avatar_id, "Runway training failed")
        else:
            await update_avatar_progress(avatar_id, progress)

    except Exception as e:
        logger.error(f"Failed to poll training avatar {avatar_id}: {e}")


async def _polling_loop() -> None:
    """Main loop: poll every POLL_INTERVAL_SECONDS."""
    logger.info(
        f"Polling worker started (interval={settings.POLL_INTERVAL_SECONDS}s)"
    )
    while True:
        try:
            # Poll video generations
            processing = await get_processing_videos()
            if processing:
                logger.info(f"Found {len(processing)} video(s) in PROCESSING state")
                tasks = [_process_one_video(v) for v in processing]
                await asyncio.gather(*tasks, return_exceptions=True)

            # Poll Runway training jobs
            training = await get_training_avatars()
            if training:
                logger.info(f"Found {len(training)} avatar(s) in TRAINING state")
                ttasks = [_process_training_avatar(a) for a in training]
                await asyncio.gather(*ttasks, return_exceptions=True)

        except Exception as e:
            logger.error(f"Polling loop error: {e}", exc_info=True)

        await asyncio.sleep(settings.POLL_INTERVAL_SECONDS)


def start_worker() -> None:
    """Schedule the polling loop as a background asyncio task."""
    global _worker_task
    loop = asyncio.get_event_loop()
    _worker_task = loop.create_task(_polling_loop())
    logger.info("Background polling worker scheduled")


def stop_worker() -> None:
    global _worker_task
    if _worker_task and not _worker_task.done():
        _worker_task.cancel()
        logger.info("Background polling worker stopped")
