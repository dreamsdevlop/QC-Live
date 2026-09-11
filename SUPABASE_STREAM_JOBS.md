# QC-Live Supabase Stream Jobs

The `stream-jobs` Edge Function is the control plane for QC-Live stream orchestration. It manages desired state, destination rows, worker heartbeats, and a database-backed event outbox. It does **not** run FFmpeg and must not be used as a 24/7 media process.

## Deployment

The function is deployed to the configured Supabase project with slug `stream-jobs`.

```text
https://rirngdknrszxkgdjcrcv.supabase.co/functions/v1/stream-jobs
```

The database migrations are:

- `20260912004600_stream_jobs_edge_function.sql`
- `20260912004700_claim_stream_job_events.sql`

## Required secrets

Configure these in Supabase Edge Function secrets:

```bash
supabase secrets set WORKER_SHARED_SECRET="replace-with-a-long-random-secret"
```

Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the function runtime. The service-role key is used only inside the function and is never returned to clients.

## User actions

Authenticated user requests send the user's Supabase access token:

```http
Authorization: Bearer <supabase-access-token>
Content-Type: application/json
```

Create a job:

```json
{
  "action": "create",
  "title": "My 24/7 channel",
  "sourceObjectKey": "videos/user-id/video.mp4",
  "channelIds": ["channel-uuid-1", "channel-uuid-2"],
  "quality": "720p",
  "loopEnabled": true
}
```

A public `sourceUrl` may be used instead of `sourceObjectKey`, but the actual permitted download should be performed by the external media worker. The function validates that every selected channel belongs to the authenticated user and is enabled.

Start or stop a job:

```json
{ "action": "start", "jobId": "job-uuid" }
```

```json
{ "action": "stop", "jobId": "job-uuid" }
```

The function changes `desired_state`; the database trigger creates a `job_start_requested` or `job_stop_requested` outbox event.

## Media-worker actions

The media worker sends the shared secret in a header. It must not send channel secrets to the browser.

```http
x-worker-secret: <WORKER_SHARED_SECRET>
Content-Type: application/json
```

Claim pending events atomically:

```json
{ "action": "claim_events", "limit": 10 }
```

For each destination, start or stop FFmpeg using the server-side channel secret, then report status:

```json
{
  "action": "heartbeat",
  "jobId": "job-uuid",
  "destinationId": "destination-uuid",
  "status": "running",
  "remoteStreamId": "ffmpeg-pid-or-provider-id"
}
```

Failure example:

```json
{
  "action": "heartbeat",
  "jobId": "job-uuid",
  "destinationId": "destination-uuid",
  "status": "error",
  "error": "Twitch rejected the RTMP connection"
}
```

After successfully handling an event:

```json
{ "action": "ack_event", "eventId": 123 }
```

## Security notes

The function deployment uses custom authentication because it supports both Supabase user JWTs and the private worker secret. Keep `verify_jwt` disabled only while this function retains the explicit `requireUser` and `requireWorker` checks. Do not expose `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_SHARED_SECRET`, or decrypted stream credentials to the browser.

The RLS policies allow users to read and update only their own jobs. Destination writes, event claiming, heartbeats, and channel-secret access are server-only.

## Runtime boundary

Supabase Edge Functions have a finite runtime and are not a permanent streaming process. The external worker remains responsible for FFmpeg, `yt-dlp`, looping, RTMP/RTMPS connections, and 24/7 uptime. The Edge Function is the authenticated job API and durable state machine around that worker.
