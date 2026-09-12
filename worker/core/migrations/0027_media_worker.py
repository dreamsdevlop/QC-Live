from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone


class Migration(migrations.Migration):
    dependencies = [("core", "0026_run_pid")]

    operations = [
        migrations.CreateModel(
            name="MediaJob",
            fields=[
                ("id", models.CharField(max_length=160, primary_key=True, serialize=False)),
                ("broadcast_id", models.CharField(max_length=160)),
                ("idempotency_key", models.CharField(max_length=255, unique=True)),
                ("payload_encrypted", models.TextField()),
                ("status", models.CharField(choices=[("queued", "Queued"), ("claimed", "Claimed"), ("preflighting", "Preflighting"), ("running", "Running"), ("degraded", "Degraded"), ("stopping", "Stopping"), ("completed", "Completed"), ("failed", "Failed"), ("cancelled", "Cancelled")], default="queued", max_length=24)),
                ("worker_id", models.CharField(blank=True, default="", max_length=160)),
                ("retry_count", models.PositiveIntegerField(default=0)),
                ("last_error", models.TextField(blank=True, default="")),
                ("requested_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("finished_at", models.DateTimeField(blank=True, null=True)),
                ("lease_expires_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.CreateModel(
            name="WorkerHeartbeat",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("worker_id", models.CharField(max_length=160, unique=True)),
                ("hostname", models.CharField(blank=True, default="", max_length=255)),
                ("capacity", models.PositiveIntegerField(default=1)),
                ("active_jobs", models.PositiveIntegerField(default=0)),
                ("cpu_percent", models.FloatField(default=0)),
                ("memory_percent", models.FloatField(default=0)),
                ("last_seen_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("metadata", models.JSONField(blank=True, default=dict)),
            ],
            options={"ordering": ["-last_seen_at"]},
        ),
        migrations.CreateModel(
            name="DestinationRun",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("destination_id", models.CharField(max_length=160)),
                ("status", models.CharField(choices=[("queued", "Queued"), ("preflighting", "Preflighting"), ("starting", "Starting"), ("running", "Running"), ("degraded", "Degraded"), ("retrying", "Retrying"), ("stopping", "Stopping"), ("completed", "Completed"), ("failed", "Failed"), ("cancelled", "Cancelled")], default="queued", max_length=24)),
                ("process_pid", models.PositiveIntegerField(blank=True, null=True)),
                ("retry_count", models.PositiveIntegerField(default=0)),
                ("bitrate_kbps", models.FloatField(blank=True, null=True)),
                ("fps", models.FloatField(blank=True, null=True)),
                ("speed", models.FloatField(blank=True, null=True)),
                ("dropped_frames", models.PositiveIntegerField(default=0)),
                ("reconnect_count", models.PositiveIntegerField(default=0)),
                ("log_tail", models.TextField(blank=True, default="")),
                ("last_error", models.TextField(blank=True, default="")),
                ("started_at", models.DateTimeField(blank=True, null=True)),
                ("stopped_at", models.DateTimeField(blank=True, null=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("job", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="destination_runs", to="core.mediajob")),
            ],
            options={"constraints": [models.UniqueConstraint(fields=("job", "destination_id"), name="unique_media_destination_run")]},
        ),
    ]
