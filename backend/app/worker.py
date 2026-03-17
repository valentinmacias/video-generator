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
)
from .veo_client import poll_operation
from .storage import save_video_bytes, upload_video_from_uri

logger = logging.getLogger(__name__)

_worker_task: asyncio.Task | None = None


async def _process_one_video(video: dict) -> None:
    video_id = video["id"]
    operation_name = video["operation_id"]

    logger.debug(f"Polling video {video_id} | operation={operation_name}")
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


async def _polling_loop() -> None:
    """Main loop: poll every POLL_INTERVAL_SECONDS."""
    logger.info(
        f"Polling worker started (interval={settings.POLL_INTERVAL_SECONDS}s)"
    )
    while True:
        try:
            processing = await get_processing_videos()
            if processing:
                logger.info(f"Found {len(processing)} video(s) in PROCESSING state")
                tasks = [_process_one_video(v) for v in processing]
                await asyncio.gather(*tasks, return_exceptions=True)
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
