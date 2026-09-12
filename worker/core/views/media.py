"""Private API used by QC Live to control the PyRunner media worker."""

import json
import os

from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from core.media.service import create_job, heartbeat, worker_token_valid
from core.models import DestinationRun, MediaJob


def _auth(request):
    if not worker_token_valid(request):
        return JsonResponse({"error": "Unauthorized"}, status=401)
    return None


@csrf_exempt
@require_http_methods(["POST"])
def heartbeat_view(request):
    unauthorized = _auth(request)
    if unauthorized:
        return unauthorized
    body = json.loads(request.body or "{}")
    worker = heartbeat(
        str(body.get("workerId") or os.environ.get("MEDIA_WORKER_ID", "worker")),
        int(body.get("capacity") or os.environ.get("MEDIA_WORKER_CAPACITY", "1")),
        body.get("metadata") or {},
    )
    return JsonResponse({"workerId": worker.worker_id, "activeJobs": worker.active_jobs, "lastSeenAt": worker.last_seen_at.isoformat()})


@csrf_exempt
@require_http_methods(["POST"])
def create_media_job(request):
    unauthorized = _auth(request)
    if unauthorized:
        return unauthorized
    try:
        job = create_job(json.loads(request.body or "{}"))
        return JsonResponse({"success": True, "jobId": job.id, "status": job.status}, status=202)
    except (ValueError, json.JSONDecodeError) as exc:
        return JsonResponse({"error": str(exc)}, status=400)
    except Exception as exc:
        return JsonResponse({"error": "Could not create media job", "detail": str(exc)}, status=500)


@csrf_exempt
@require_http_methods(["GET"])
def media_job_status(request, job_id):
    unauthorized = _auth(request)
    if unauthorized:
        return unauthorized
    try:
        job = MediaJob.objects.prefetch_related("destination_runs").get(id=job_id)
    except MediaJob.DoesNotExist:
        return JsonResponse({"error": "Job not found"}, status=404)
    return JsonResponse({
        "jobId": job.id,
        "broadcastId": job.broadcast_id,
        "status": job.status,
        "retryCount": job.retry_count,
        "lastError": job.last_error,
        "destinationRuns": [
            {"destinationId": run.destination_id, "status": run.status, "pid": run.process_pid, "bitrateKbps": run.bitrate_kbps, "fps": run.fps, "droppedFrames": run.dropped_frames, "lastError": run.last_error}
            for run in job.destination_runs.all()
        ],
    })


@csrf_exempt
@require_http_methods(["POST"])
def stop_media_job(request, job_id):
    unauthorized = _auth(request)
    if unauthorized:
        return unauthorized
    try:
        job = MediaJob.objects.get(id=job_id)
    except MediaJob.DoesNotExist:
        return JsonResponse({"error": "Job not found"}, status=404)
    for run in DestinationRun.objects.filter(job=job, process_pid__isnull=False):
        try:
            if os.name != "nt":
                os.killpg(os.getpgid(run.process_pid), 15)
            else:
                os.kill(run.process_pid, 15)
        except (ProcessLookupError, PermissionError, OSError):
            pass
    job.status = MediaJob.Status.CANCELLED
    job.save(update_fields=["status", "updated_at"])
    return JsonResponse({"success": True, "jobId": job.id, "status": job.status})
