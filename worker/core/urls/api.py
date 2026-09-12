"""
URL patterns for the PyRunner REST API.
"""

from django.urls import path

from core.views.api import (
    list_datastores,
    get_datastore,
    list_entries,
    get_entry,
)
from core.views.media import (
    create_media_job,
    heartbeat_view,
    health_view,
    media_job_status,
    stop_media_job,
)

app_name = "api"

urlpatterns = [
    # Private QC Live media-worker endpoints. All require MEDIA_WORKER_TOKEN.
    path("media/health/", health_view, name="media_health"),
    path("media/heartbeat/", heartbeat_view, name="media_heartbeat"),
    path("media/jobs/", create_media_job, name="create_media_job"),
    path("media/jobs/<str:job_id>/", media_job_status, name="media_job_status"),
    path("media/jobs/<str:job_id>/stop/", stop_media_job, name="stop_media_job"),
    # Datastore endpoints
    path("datastores/", list_datastores, name="list_datastores"),
    path("datastores/<str:name>/", get_datastore, name="get_datastore"),
    path("datastores/<str:name>/entries/", list_entries, name="list_entries"),
    path("datastores/<str:name>/entries/<str:key>/", get_entry, name="get_entry"),
]
