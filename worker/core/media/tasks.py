"""django-q2 entry points for QC Live media jobs."""

import logging

from core.media.service import execute_job, heartbeat

logger = logging.getLogger(__name__)


def execute_media_job(job_id: str) -> dict:
    try:
        return execute_job(job_id)
    except Exception as exc:
        logger.exception("Media job %s failed", job_id)
        return {"success": False, "job_id": job_id, "error": str(exc)}


def media_worker_heartbeat() -> dict:
    worker_id = __import__("os").environ.get("MEDIA_WORKER_ID", __import__("socket").gethostname())
    worker = heartbeat(worker_id, int(__import__("os").environ.get("MEDIA_WORKER_CAPACITY", "1")), {"service": "qc-live-media"})
    return {"success": True, "worker_id": worker.worker_id, "last_seen_at": worker.last_seen_at.isoformat()}
