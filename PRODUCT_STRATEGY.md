# QC Live Product Strategy

## Product direction

QC Live will become a branded, original platform for broadcasting pre-recorded video to multiple destinations. It will take inspiration from the category capabilities demonstrated by GoStream—pre-recorded streaming, multistreaming, scheduling, cloud media, integrations, analytics, and simple onboarding—without copying GoStream's proprietary code, visual assets, wording, or brand identity.

The core promise is:

> Upload once, configure destinations once, then schedule and monitor reliable broadcasts from one control center.

## Strategic principles

1. **Reliability before breadth.** A small number of dependable destinations is more valuable than dozens of unreliable integrations.
2. **Separate control from execution.** The web dashboard and API should control broadcasts, while a persistent worker runs FFmpeg and owns process recovery.
3. **Secrets never belong in the browser.** Stream keys, OAuth refresh tokens, service-role keys, and worker credentials remain server-side and encrypted at rest.
4. **Every automated action is observable.** Schedules, runs, retries, failures, and destination health must be visible and auditable.
5. **Progressive complexity.** New users get a guided path; advanced users get detailed controls without forcing those controls on everyone.
6. **Provider-policy compliance.** Integrations use official APIs and ingest mechanisms. QC Live will not bypass authentication, DRM, paywalls, platform restrictions, or content ownership rules.

## Target architecture

```text
Browser dashboard
       |
       v
Next.js control plane ---- Supabase Auth / Postgres / encrypted destinations
       |
       +---- scheduler and job state
       |
       v
Persistent media worker ---- FFmpeg ---- YouTube / Twitch / Facebook / custom RTMP
       |
       +---- metrics, logs, retries, alerts
```

Vercel remains suitable for the dashboard and short-lived API requests. The FFmpeg worker, durable media storage, and high-volume scheduling must run on persistent infrastructure with enough CPU, memory, disk, and outbound bandwidth. The worker can be hosted on a managed persistent service or an appropriately sized cloud server; it should not depend on a request remaining open in a serverless function.

## Delivery phases

### Phase 0 — Foundation and safety

**Objective:** make the existing product safe to extend.

Deliverables:

- Canonical environment variables and startup validation.
- Password login plus secure Supabase magic-link login.
- Session rotation, logout-all capability, rate limiting, and audit logging.
- CSRF protection for state-changing browser requests.
- Strict ownership checks on every video, stream, destination, schedule, and run.
- Dedicated `CHANNEL_ENCRYPTION_SECRET`; fail closed if it is missing in production.
- No plaintext stream keys or access tokens in logs, API responses, or client state.
- Database migrations with version tracking instead of ad-hoc table alterations.
- Error taxonomy that distinguishes validation, provider, worker, and infrastructure failures.

**Exit criteria:** a new deployment can validate its configuration, users can authenticate without exposing secrets, and every protected resource has an owner.

### Phase 1 — Broadcast creation and scheduling

**Objective:** deliver the central GoStream-style workflow.

Core entities:

- `media_assets`
- `destinations`
- `broadcasts`
- `broadcast_destinations`
- `schedules`
- `schedule_runs`
- `worker_jobs`
- `broadcast_events`

A broadcast wizard will support:

1. Select a video or external source.
2. Select one or more destinations.
3. Configure title, description, thumbnail, quality, loop, and duration.
4. Start now or schedule later.
5. Run preflight validation.
6. Show a review screen and launch.

Scheduling will support one-time, daily, weekly, and custom recurrence rules, time zones, end conditions, pause/resume, duplication, and next-run previews.

**Exit criteria:** a user can schedule a multi-destination broadcast, close the browser, and the worker can execute it with durable state and a visible run history.

### Phase 2 — Worker reliability and operations

**Objective:** make unattended streaming dependable.

Deliverables:

- Durable job queue with idempotency keys.
- Worker heartbeats and leases.
- Per-destination process isolation.
- Automatic retries with exponential backoff.
- Destination-specific failure handling.
- Graceful stop and forced stop.
- Capacity checks before launch.
- FFmpeg log redaction and retention.
- Health metrics: bitrate, FPS, speed, dropped frames, uptime, reconnects, CPU, memory, disk, and bandwidth.
- Alerts for failed, degraded, or capacity-blocked broadcasts.

**Exit criteria:** failure of one destination does not terminate healthy destinations, and a worker restart can recover or safely reconcile jobs.

### Phase 3 — Media library and destinations

**Objective:** make content and integrations easy to manage.

Media features:

- Folders, tags, search, filters, preview, thumbnails, metadata, duplicate detection, archive, and storage quotas.
- Resumable uploads and background transcoding.
- Cloud imports from approved provider APIs.
- Codec and resolution validation.

Destination features:

- YouTube, Facebook, and Twitch official OAuth flows.
- Custom RTMP with masked secrets and rotation.
- Destination test and preflight.
- Token expiry and reconnect status.
- Per-destination title and privacy overrides.
- Embed/output destinations where technically and contractually supported.

**Exit criteria:** users can connect, test, rotate, disable, and reuse destinations without re-entering secrets for every broadcast.

### Phase 4 — Product experience

**Objective:** turn the technical dashboard into a creator-facing product.

Deliverables:

- Onboarding checklist.
- Dashboard sections: Broadcasts, Schedules, Videos, Destinations, Analytics, Team, Settings, Help.
- Responsive mobile controls for start, stop, schedule, status, and alerts.
- Empty states and guided setup.
- Public broadcast pages and embed codes.
- In-product documentation and troubleshooting.
- Branded email notifications.

**Exit criteria:** a first-time user can connect a destination, upload a video, and launch a test broadcast without reading deployment documentation.

### Phase 5 — Analytics, collaboration, and monetization

**Objective:** establish a scalable commercial foundation.

Deliverables:

- Broadcast analytics and destination comparisons.
- Workspace and team roles: owner, admin, operator, viewer.
- Invitations, audit trail, shared destinations, and workspace media.
- Usage metering for hours, storage, destinations, concurrency, and bandwidth.
- Plan enforcement before billing.
- Subscription and invoicing integration only after usage accounting is reliable.
- Agency workspaces and client separation.
- Optional white-label public pages.

**Exit criteria:** usage is measurable, permissions are explicit, and plan limits are enforced consistently across UI, API, scheduler, and worker.

### Phase 6 — Engagement and expansion

**Objective:** differentiate the product beyond basic multistreaming.

Possible deliverables:

- Polls, countdowns, lower-thirds, QR codes, and call-to-action overlays.
- Moderated comments and social overlays where official APIs allow them.
- Mini-games as optional broadcast overlays.
- Mobile application after responsive web controls are stable.
- Additional destinations based on user demand and official API support.

## Immediate engineering backlog

1. Add startup configuration validation and a safe production checklist.
2. Replace the current SQLite ad-hoc migrations with versioned migrations.
3. Add schedule and broadcast-run tables.
4. Add schedule CRUD APIs with strict session ownership.
5. Add the broadcast creation wizard.
6. Add preflight validation for files, destinations, capacity, and worker readiness.
7. Extract FFmpeg execution behind a worker-job interface.
8. Add per-destination run state and retry policies.
9. Add a schedule worker on persistent infrastructure.
10. Add dashboard cards for next scheduled broadcast, active destinations, failures, and worker capacity.
11. Add audit events for authentication, destination changes, schedule changes, and broadcast actions.
12. Add end-to-end tests for authentication, ownership, schedule idempotency, and failed destinations.

## PyRunner comparison and adopted patterns

PyRunner is a general-purpose Python execution platform, not a specialized
video-transcoding or live-streaming worker. Its strongest reusable ideas are
worker heartbeats, durable task states, isolated process groups, bounded output,
secret masking, and safe retry/idempotency behavior. QC Live adopts those
patterns in its existing Node.js/FFmpeg architecture rather than merging
PyRunner's Django application, models, or runtime.

QC Live's FFmpeg path now uses isolated process groups, redacts RTMP URLs from
logs, bounds retained error output, uses higher 720p/1080p bitrate presets,
preserves aspect ratio with padding, enforces H.264/AAC compatibility settings,
and supports an operator-controlled `FFMPEG_PRESET`. Higher quality increases
CPU and outbound bandwidth requirements, so the scheduler must eventually
perform capacity checks before allowing a high-quality broadcast.

## Success metrics

- Time from signup to first successful broadcast.
- First-broadcast success rate.
- Percentage of scheduled runs starting on time.
- Destination failure recovery rate.
- Mean time to detect and recover from a failed output.
- Weekly active broadcasters.
- Broadcast hours per active workspace.
- Storage and bandwidth cost per broadcast hour.
- Support tickets per 100 broadcasts.

## Architecture decision

The recommended production path is a managed web dashboard plus a persistent media worker. A lightweight alternative is to keep the existing single-server architecture while adding schedules and retries, but that will remain limited by server capacity, deploy interruptions, and shared process reliability. The managed split architecture costs more operationally but gives QC Live the reliability, isolation, and scaling needed for a serious GoStream-style product.

## Definition of done for the first release

A release is not considered production-ready until a user can:

1. Create an account or use a magic link.
2. Upload and preview a video.
3. Connect and test a destination.
4. Schedule a broadcast in a selected time zone.
5. Close the browser.
6. Observe the worker start the broadcast on time.
7. See per-destination health and logs.
8. Recover a failed destination without affecting healthy outputs.
9. Stop the broadcast safely.
10. Review the complete run history and audit trail.
