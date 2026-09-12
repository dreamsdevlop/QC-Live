# Unified QC Live Platform

QC Live is now organized as a product monorepo with two cooperating layers:

```text
QC Live dashboard and control plane
  Next.js, authentication, media library, destinations, user workflow

QC Live media backend
  worker/ — vendored PyRunner media-worker service
  Django, django-q2, FFmpeg, heartbeats, retries, process supervision
```

The dashboard remains the user-facing application. The PyRunner service is an
internal backend and must not be exposed as a second public product or used to
run arbitrary user Python scripts for QC Live.

## Runtime workflow

1. A user signs in to QC Live and chooses a video and destination.
2. QC Live resolves the destination server-side and creates a private media job.
3. The request is sent to the internal PyRunner service with a bearer token.
4. PyRunner encrypts the job payload and creates one destination run per output.
5. django-q2 executes the job asynchronously.
6. PyRunner launches one isolated FFmpeg process per destination.
7. The worker records status, logs, metrics, and failures independently.
8. QC Live reconciles job status and displays the result in the dashboard.

## Production Compose

`docker-compose.production.yml` starts:

- `app` — QC Live Next.js dashboard and control plane.
- `media-worker` — internal PyRunner/Django media worker.
- `qc_live_media` — shared media volume.
- `qc_live_worker_data` — durable worker database and job state.

Set these values in the deployment environment:

```env
SESSION_SECRET=<qc-live-session-secret>
ADMIN_USERNAME=<admin-name>
ADMIN_PASSWORD_HASH=<bcrypt-hash>
MEDIA_WORKER_TOKEN=<long-random-shared-token>
WORKER_SECRET_KEY=<unique-django-secret>
WORKER_ENCRYPTION_KEY=<unique-fernet-key>
MEDIA_WORKER_ID=worker-01
MEDIA_WORKER_CAPACITY=1
FFMPEG_PRESET=faster
```

The dashboard uses `http://media-worker:8000` inside Compose. The worker has no
published host port, so its API is internal to the Compose network.

## Media storage contract

The app and worker must use the shared `qc_live_media` volume. QC Live writes
uploaded media under `/app/public/uploads`; PyRunner reads the same files under
`/app/media`. The start route maps the basename into the worker path before
submitting the job.

For multi-host deployments, replace the local named volume with shared
S3-compatible object storage or a synchronized media volume. A local Vercel
filesystem is not visible to the worker.

## Backend safety boundary

The vendored PyRunner code includes its original script automation modules for
compatibility with the upstream project, but the QC Live workflow only uses
`core.media`. Never expose PyRunner's script executor, Django admin, or general
script API as part of QC Live's public product.

## Operational requirements

- Run the worker behind private networking or a firewall.
- Keep `MEDIA_WORKER_TOKEN`, `WORKER_SECRET_KEY`, and `WORKER_ENCRYPTION_KEY`
  server-side only.
- Use HTTPS at the public edge.
- Give the worker enough CPU, memory, disk, and outbound bandwidth for the
  selected number of 720p/1080p destinations.
- Run migrations before first production start.
- Monitor worker heartbeats and reconcile expired leases.
- Add object storage before scaling beyond a single host.
