"""QC Live media-worker primitives built on PyRunner's process supervision patterns."""

import json
import logging
import os
import signal
import socket
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import timedelta
from pathlib import Path

import psutil
from django.db import transaction
from django.utils import timezone
from django_q.tasks import async_task

from core.models import DestinationRun, MediaJob, WorkerHeartbeat
from core.services.encryption_service import EncryptionService

logger = logging.getLogger(__name__)
MAX_LOG_TAIL = 256_000
LEASE_SECONDS = 90


def _worker_token_valid(request):
    expected = os.environ.get("MEDIA_WORKER_TOKEN", "")
    supplied = request.headers.get("Authorization", "")
    return bool(expected) and supplied == f"Bearer {expected}"


def worker_token_valid(request):
    return _worker_token_valid(request)


def _redact(value: str, secrets: list[str]) -> str:
    result = value or ""
    for secret in secrets:
        if secret:
            result = result.replace(secret, "[REDACTED]")
    return result


def _payload(job: MediaJob) -> dict:
    return json.loads(EncryptionService.decrypt(job.payload_encrypted))


def create_job(payload: dict) -> MediaJob:
    job_id = str(payload.get("jobId", "")).strip()
    broadcast_id = str(payload.get("broadcastId", "")).strip()
    idempotency_key = str(payload.get("idempotencyKey") or job_id).strip()
    if not job_id or not broadcast_id or not payload.get("videoPath") and not payload.get("videoUrl"):
        raise ValueError("jobId, broadcastId, and videoPath or videoUrl are required")
    destinations = payload.get("destinations") or []
    if not destinations:
        raise ValueError("At least one destination is required")
    if len(destinations) > int(os.environ.get("MEDIA_MAX_DESTINATIONS", "20")):
        raise ValueError("Too many destinations for this worker")
    encrypted = EncryptionService.encrypt(json.dumps(payload))
    with transaction.atomic():
        job, created = MediaJob.objects.get_or_create(
            id=job_id,
            defaults={
                "broadcast_id": broadcast_id,
                "idempotency_key": idempotency_key,
                "payload_encrypted": encrypted,
            },
        )
        if not created:
            if job.idempotency_key != idempotency_key:
                raise ValueError("Job ID already exists with a different idempotency key")
            return job
        for destination in destinations:
            destination_id = str(destination.get("id", "")).strip()
            if not destination_id or not destination.get("ingestUrl") or not destination.get("streamKey"):
                raise ValueError("Each destination requires id, ingestUrl, and streamKey")
            DestinationRun.objects.create(job=job, destination_id=destination_id)
    async_task("core.media.tasks.execute_media_job", job.id, task_name=f"media-{job.id}")
    return job


def claim_job(job_id: str, worker_id: str) -> MediaJob:
    with transaction.atomic():
        job = MediaJob.objects.select_for_update().get(id=job_id)
        now = timezone.now()
        if job.status not in {MediaJob.Status.QUEUED, MediaJob.Status.CLAIMED}:
            return job
        if job.status == MediaJob.Status.CLAIMED and job.lease_expires_at and job.lease_expires_at > now and job.worker_id != worker_id:
            raise RuntimeError("Job is leased by another worker")
        job.status = MediaJob.Status.CLAIMED
        job.worker_id = worker_id
        job.lease_expires_at = now + timedelta(seconds=LEASE_SECONDS)
        job.save(update_fields=["status", "worker_id", "lease_expires_at", "updated_at"])
        return job


def heartbeat(worker_id: str, capacity: int, metadata: dict | None = None):
    worker, _ = WorkerHeartbeat.objects.update_or_create(
        worker_id=worker_id,
        defaults={
            "hostname": socket.gethostname(),
            "capacity": max(1, int(capacity)),
            "active_jobs": MediaJob.objects.filter(worker_id=worker_id, status__in=[MediaJob.Status.CLAIMED, MediaJob.Status.RUNNING, MediaJob.Status.DEGRADED]).count(),
            "cpu_percent": psutil.cpu_percent(interval=0.1),
            "memory_percent": psutil.virtual_memory().percent,
            "last_seen_at": timezone.now(),
            "metadata": metadata or {},
        },
    )
    return worker


def _ffmpeg_args(destination: dict, payload: dict) -> list[str]:
    quality = payload.get("quality", "1080p")
    presets = {
        "720p": ("1280:720", "3000k", "3500k", "7000k"),
        "1080p": ("1920:1080", "6000k", "7000k", "14000k"),
    }
    resolution, bitrate, maxrate, bufsize = presets.get(quality, presets["1080p"])
    source = payload.get("videoPath") or payload.get("videoUrl")
    output = f"{destination['ingestUrl'].rstrip('/')}/{destination['streamKey']}"
    args = ["ffmpeg", "-hide_banner", "-nostats", "-re"]
    if payload.get("loop", True):
        args += ["-stream_loop", "-1"]
    args += [
        "-i", source,
        "-c:v", "libx264",
        "-preset", os.environ.get("FFMPEG_PRESET", "faster"),
        "-profile:v", "high",
        "-pix_fmt", "yuv420p",
        "-b:v", bitrate,
        "-maxrate", maxrate,
        "-bufsize", bufsize,
        "-vf", f"scale={resolution}:force_original_aspect_ratio=decrease,pad={resolution}:(ow-iw)/2:(oh-ih)/2:color=black",
        "-r", "30", "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
        "-c:a", "aac", "-b:a", "128k", "-ar", "48000", "-ac", "2",
        "-f", "flv", output,
    ]
    return args


def _run_destination(job: MediaJob, run: DestinationRun, destination: dict, payload: dict):
    secrets = [str(destination.get("streamKey", "")), str(destination.get("ingestUrl", ""))]
    run.status = DestinationRun.Status.STARTING
    run.started_at = timezone.now()
    run.save(update_fields=["status", "started_at", "updated_at"])
    process = None
    output_tail = ""
    try:
        process = subprocess.Popen(
            _ffmpeg_args(destination, payload),
            start_new_session=(os.name != "nt"),
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        run.process_pid = process.pid
        run.status = DestinationRun.Status.RUNNING
        run.save(update_fields=["process_pid", "status", "updated_at"])
        deadline = time.time() + int(payload.get("maxDurationSeconds", 0) or 0) if payload.get("maxDurationSeconds") else None
        while process.poll() is None:
            if deadline and time.time() >= deadline:
                break
            line = process.stderr.readline() if process.stderr else ""
            if line:
                output_tail = (output_tail + _redact(line, secrets))[-MAX_LOG_TAIL:]
                if "speed=" in line and "bitrate=" in line:
                    run.log_tail = output_tail
                    run.save(update_fields=["log_tail", "updated_at"])
            time.sleep(0.05)
        if process.poll() is None:
            if os.name != "nt":
                os.killpg(os.getpgid(process.pid), signal.SIGTERM)
            else:
                process.terminate()
        code = process.wait(timeout=20)
        run.status = DestinationRun.Status.COMPLETED if code == 0 else DestinationRun.Status.FAILED
        run.last_error = "" if code == 0 else output_tail[-4000:]
    except Exception as exc:
        run.status = DestinationRun.Status.FAILED
        run.last_error = _redact(str(exc), secrets)
        logger.exception("Media destination failed: %s", run.destination_id)
    finally:
        run.log_tail = output_tail[-MAX_LOG_TAIL:]
        run.stopped_at = timezone.now()
        run.process_pid = None
        run.save(update_fields=["status", "last_error", "log_tail", "stopped_at", "process_pid", "updated_at"])


def execute_job(job_id: str):
    worker_id = os.environ.get("MEDIA_WORKER_ID", socket.gethostname())
    job = claim_job(job_id, worker_id)
    if job.status not in {MediaJob.Status.CLAIMED, MediaJob.Status.QUEUED} or job.worker_id != worker_id:
        return {"success": False, "error": "Job could not be claimed"}
    job.status = MediaJob.Status.RUNNING
    job.started_at = timezone.now()
    job.lease_expires_at = timezone.now() + timedelta(seconds=LEASE_SECONDS)
    job.save(update_fields=["status", "started_at", "lease_expires_at", "updated_at"])
    payload = _payload(job)
    destinations = {str(item.get("id")): item for item in payload.get("destinations", [])}
    runs = list(job.destination_runs.all())
    with ThreadPoolExecutor(max_workers=max(1, min(len(runs), int(os.environ.get("MEDIA_MAX_DESTINATIONS", "20"))))) as pool:
        futures = {
            pool.submit(_run_destination, job, run, destinations[run.destination_id], payload): run.destination_id
            for run in runs
            if run.destination_id in destinations
        }
        for future in as_completed(futures):
            try:
                future.result()
            except Exception:
                logger.exception("Destination worker failed: %s", futures[future])
    job.refresh_from_db()
    failed = job.destination_runs.filter(status=DestinationRun.Status.FAILED).exists()
    job.status = MediaJob.Status.FAILED if failed else MediaJob.Status.COMPLETED
    job.finished_at = timezone.now()
    job.lease_expires_at = None
    job.save(update_fields=["status", "finished_at", "lease_expires_at", "updated_at"])
    return {"success": not failed, "job_id": job.id, "status": job.status}


# Keep the process runner above as the single-attempt primitive, then add
# bounded destination-isolated recovery for transient RTMP failures.
_run_destination_once = _run_destination


def _run_destination(job: MediaJob, run: DestinationRun, destination: dict, payload: dict):
    max_attempts = max(1, min(int(payload.get("maxRetries", 3)) + 1, 5))
    delays = [10, 30, 120]
    for attempt in range(max_attempts):
        run.retry_count = attempt
        if attempt:
            run.status = DestinationRun.Status.RETRYING
            run.save(update_fields=["retry_count", "status", "updated_at"])
            time.sleep(delays[min(attempt - 1, len(delays) - 1)])
        _run_destination_once(job, run, destination, payload)
        run.refresh_from_db()
        if run.status == DestinationRun.Status.COMPLETED:
            return
    logger.error("Destination %s exhausted retries for job %s", run.destination_id, job.id)
