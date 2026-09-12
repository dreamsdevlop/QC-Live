"""Persistent models for QC Live media-worker jobs."""

from django.db import models
from django.utils import timezone


class MediaJob(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        CLAIMED = "claimed", "Claimed"
        PREFLIGHTING = "preflighting", "Preflighting"
        RUNNING = "running", "Running"
        DEGRADED = "degraded", "Degraded"
        STOPPING = "stopping", "Stopping"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    id = models.CharField(max_length=160, primary_key=True)
    broadcast_id = models.CharField(max_length=160)
    idempotency_key = models.CharField(max_length=255, unique=True)
    payload_encrypted = models.TextField()
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.QUEUED)
    worker_id = models.CharField(max_length=160, blank=True, default="")
    retry_count = models.PositiveIntegerField(default=0)
    last_error = models.TextField(blank=True, default="")
    requested_at = models.DateTimeField(default=timezone.now)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)
    lease_expires_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.broadcast_id} ({self.status})"


class DestinationRun(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        PREFLIGHTING = "preflighting", "Preflighting"
        STARTING = "starting", "Starting"
        RUNNING = "running", "Running"
        DEGRADED = "degraded", "Degraded"
        RETRYING = "retrying", "Retrying"
        STOPPING = "stopping", "Stopping"
        COMPLETED = "completed", "Completed"
        FAILED = "failed", "Failed"
        CANCELLED = "cancelled", "Cancelled"

    job = models.ForeignKey(MediaJob, on_delete=models.CASCADE, related_name="destination_runs")
    destination_id = models.CharField(max_length=160)
    status = models.CharField(max_length=24, choices=Status.choices, default=Status.QUEUED)
    process_pid = models.PositiveIntegerField(null=True, blank=True)
    retry_count = models.PositiveIntegerField(default=0)
    bitrate_kbps = models.FloatField(null=True, blank=True)
    fps = models.FloatField(null=True, blank=True)
    speed = models.FloatField(null=True, blank=True)
    dropped_frames = models.PositiveIntegerField(default=0)
    reconnect_count = models.PositiveIntegerField(default=0)
    log_tail = models.TextField(blank=True, default="")
    last_error = models.TextField(blank=True, default="")
    started_at = models.DateTimeField(null=True, blank=True)
    stopped_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["job", "destination_id"], name="unique_media_destination_run")
        ]


class WorkerHeartbeat(models.Model):
    worker_id = models.CharField(max_length=160, unique=True)
    hostname = models.CharField(max_length=255, blank=True, default="")
    capacity = models.PositiveIntegerField(default=1)
    active_jobs = models.PositiveIntegerField(default=0)
    cpu_percent = models.FloatField(default=0)
    memory_percent = models.FloatField(default=0)
    last_seen_at = models.DateTimeField(default=timezone.now)
    metadata = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ["-last_seen_at"]
