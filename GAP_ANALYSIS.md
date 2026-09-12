# QC Live Feature-Gap Audit

**Audit date:** 2026-09-12

This audit compares the current QC Live repository with GoStream's publicly described product capabilities. It identifies functional parity gaps, infrastructure gaps, and features that require separate provider approvals or cannot be assumed from marketing claims. The goal is to build an original QC Live product with comparable outcomes, not to copy GoStream's proprietary branding, code, text, or visual assets.

## Executive summary

QC Live currently provides a working technical foundation: account authentication, passwordless magic links, a local video library, video import, manual and OAuth-oriented channel linking, custom RTMP destinations, FFmpeg-based streaming, stream status controls, system metrics, Cloudflare control-plane scaffolding, and deployment documentation.

It is **not yet a complete GoStream-equivalent product** because the central unattended-broadcast workflow is incomplete. The largest missing capability is a durable scheduler and persistent worker architecture that can start broadcasts after the browser is closed, isolate each destination, retry failures, and retain a complete run history.

GoStream publicly describes pre-recorded streaming, scheduling, multistreaming to 30+ platforms, mini-games, e-commerce destinations, third-party RTMP sourcing, cloud storage imports, mobile access, tutorials, and paid plan limits.[^1][^2] QC Live currently covers only parts of pre-recorded streaming, multistreaming, third-party RTMP output, and basic import.

## Capability matrix

| Capability | GoStream public position | QC Live status | Gap severity | Recommended action |
|---|---|---|---|---|
| Pre-recorded video streaming | Core product capability | **Partial** — local uploads/imports and FFmpeg output exist | Critical | Complete media metadata, validation, durable storage, and guided broadcast creation |
| Stream now | Advertised | **Implemented** — manual stream controls exist | Medium | Add preflight validation and better launch feedback |
| One-time scheduling | Advertised | **Missing** | Critical | Add schedules, time zones, durable scheduler, and run history |
| Recurring scheduling | Implied by automation positioning | **Missing** | Critical | Add daily, weekly, custom recurrence, pause/resume, and next-run previews |
| Multistreaming | Core capability | **Partial** — multiple saved channels are supported conceptually, but the execution model is not yet a durable per-destination job system | Critical | Add broadcast and destination-run entities with isolated workers and retries |
| YouTube | Advertised | **Partial** — OAuth/channel code exists, but production verification and lifecycle UX need completion | High | Finish OAuth setup UX, token expiry handling, test connection, and per-destination overrides |
| Facebook | Advertised | **Partial** — OAuth/channel code exists, subject to Meta app configuration and review | High | Finish provider setup and reconnect/error flows |
| Twitch | Advertised | **Partial** — OAuth/channel code exists; custom RTMP is also possible | High | Complete OAuth lifecycle and health checks |
| TikTok | Advertised | **Missing official integration** | High | Add only through approved TikTok APIs/RTMP workflows; do not assume access or scrape accounts |
| X/Twitter | Advertised | **Missing dedicated integration** | Medium | Support custom RTMP where available and add official API integration only if eligible |
| LinkedIn | Advertised | **Missing dedicated integration** | Medium | Support custom RTMP and evaluate official event APIs separately |
| Custom RTMP | Advertised | **Implemented** — saved encrypted destinations exist | Medium | Add testing, masking, rotation, destination health, and per-broadcast overrides |
| Third-party RTMP sourcing | Advertised for OBS, Zoom, Ecamm, Webex, Wirecast, and XSplit | **Missing** — QC Live primarily uses stored video sources | Critical | Add an authenticated live-input worker mode with ingest health and pass-through controls |
| Cloud storage imports | Advertised for Google Drive, Dropbox, OneDrive, YouTube, and local upload | **Partial** — local upload and public URL import exist | High | Add official cloud connectors, resumable transfers, provider scopes, and import history |
| Video library | Required by the workflow | **Partial** — upload/list/import/thumbnail support exists | High | Add folders, tags, search, metadata, previews, quotas, archive, duplicate detection, and resumable upload |
| Thumbnails | Basic thumbnail support exists | **Partial** | Medium | Add replacement, crop/preview, validation, and destination-specific thumbnail settings |
| Video quality controls | GoStream advertises up to 1080p | **Partial** — QC Live now has stronger 720p/1080p FFmpeg presets | Medium | Add source inspection, preflight, bitrate controls, capacity checks, and worker profiles |
| Watermarking | GoStream pricing includes watermark differences | **Missing** | Medium | Add optional image/text overlays and enforce them by plan if monetization is introduced |
| Text/image overlays | Advertised for paid plans | **Missing** | Medium | Build composable FFmpeg overlay templates with preview and safe escaping |
| Mini-game | Publicly advertised word-guessing game driven by comments | **Missing** | Medium | Treat as a later engagement module requiring provider comment APIs, moderation, and opt-in overlays |
| E-commerce destinations | Shopee, Lazada, Amazon, Tiki are publicly mentioned | **Missing** | High but provider-dependent | Validate official ingest/API availability per region before promising integrations |
| Public website streaming | GoStream mentions websites | **Missing** | High | Add public broadcast pages, HLS playback, embed code, privacy controls, and viewer metrics |
| Mobile app | iOS and Android app advertised | **Missing** | Medium | First make responsive web controls excellent; build native apps after API and notification contracts stabilize |
| Mobile browser control | Needed for practical operation | **Partial** | Medium | Add responsive broadcast controls, schedule management, alerts, and log summaries |
| Live status | Basic stream status exists | **Partial** | High | Add per-destination health, uptime, bitrate, FPS, dropped frames, reconnect count, and last error |
| Automatic retry/recovery | Required for unattended streaming | **Missing** | Critical | Add durable queue, leases, retry policy, process reconciliation, and destination isolation |
| Worker monitoring | GoStream abstracts this from users | **Partial** — local process state and system stats exist | Critical | Add persistent worker heartbeats, capacity, job leases, and dashboard health |
| Stream history | Commercial product expectation | **Partial** — activity logs exist, but no durable broadcast/run model | High | Add immutable broadcasts, destination runs, events, logs, and retention policy |
| Notifications | Expected for failures and scheduled starts | **Missing** | High | Add email/in-app notifications and optional webhook delivery |
| Tutorials/help | Publicly emphasized | **Missing** | Medium | Add setup guides, platform-specific help, troubleshooting, and onboarding checklist |
| Teams/workspaces | GoStream pricing references teams/SMEs | **Missing** | High | Add workspace ownership, invitations, roles, audit logs, and shared destinations |
| Usage limits | GoStream has daily streams, concurrency, duration, resolution, watermark limits | **Missing** | Critical for a paid product | Add metering and enforcement before billing |
| Pricing/subscriptions | Free, Plus, Premium public tiers | **Missing** | High | Add plan model, entitlements, usage metering, checkout, webhooks, and billing portal |
| Affiliate/referral program | Publicly advertised | **Missing** | Low | Add only after paid conversion, attribution, refunds, and compliance are stable |
| Support operations | FAQ, tutorials, support positioning | **Missing** | Medium | Add knowledge base, diagnostic bundle, contact flow, and incident status |

## The five largest blockers to parity

### 1. No durable scheduling system

The current application can start streams through request-driven API calls, but a production GoStream-style product must launch broadcasts after a user closes the browser. This requires schedule records, recurrence calculation, time-zone handling, idempotent run creation, and a persistent scheduler.

### 2. No persistent media-worker boundary

Vercel cannot safely own FFmpeg, 24/7 streams, large local files, or durable process state. QC Live needs a worker API and a persistent worker with durable media storage. The existing Cloudflare Worker is a lightweight control plane and explicitly does not run FFmpeg.

### 3. No first-class broadcast/run model

The current `streams` table represents a configured stream and its current process. It does not fully represent a broadcast instance, each destination's result, retries, events, logs, or historical metrics. A `broadcasts` plus `broadcast_destinations`/`destination_runs` model is required.

### 4. Integrations are not yet productized

OAuth helpers exist for some platforms, but a complete product needs provider setup guidance, redirect management, token refresh, expiry warnings, reconnect flows, per-destination settings, health checks, and official API compliance. Platform names on a marketing page cannot substitute for working provider integrations.

### 5. No monetization entitlement layer

GoStream's public pricing differentiates daily starts, multistream concurrency, duration, resolution, watermark, and overlays.[^2] QC Live needs usage metering and server-side entitlement enforcement before accepting subscriptions or promising plan limits.

## Recommended build order

### Release A — Reliable core

1. Add versioned database migrations.
2. Add `broadcasts`, `broadcast_destinations`, `schedules`, `schedule_runs`, `worker_jobs`, and `broadcast_events`.
3. Build the stream creation wizard.
4. Add preflight checks for video, destination, credentials, worker capacity, and bandwidth.
5. Build a persistent worker API with signed requests and job leases.
6. Add scheduler execution, idempotency, retries, and per-destination isolation.
7. Add broadcast history, logs, and failure notifications.

### Release B — GoStream parity features

1. Add media folders, tags, search, metadata, previews, quotas, archive, and resumable upload.
2. Add official cloud imports.
3. Complete YouTube, Facebook, and Twitch OAuth lifecycle management.
4. Add custom RTMP testing, rotation, masking, and per-broadcast overrides.
5. Add public HLS broadcast pages and embed code.
6. Add responsive mobile controls and onboarding.

### Release C — Commercial platform

1. Add workspaces, roles, invitations, and audit events.
2. Add usage metering and plan entitlements.
3. Add subscriptions, checkout, billing webhooks, and customer portal.
4. Add analytics and operational reporting.
5. Add support tools and diagnostic exports.

### Release D — Differentiation

1. Add text/image overlays and watermark policies.
2. Add countdowns, lower thirds, QR codes, and calls to action.
3. Add mini-games only after comment APIs and moderation are stable.
4. Add additional destinations based on official API availability and customer demand.
5. Build native mobile apps after responsive web workflows are proven.

## Features that require explicit technical validation

### TikTok, e-commerce, and regional providers

GoStream publicly names TikTok and several e-commerce platforms, but QC Live should not assume that an open, stable, or eligible API exists for every account or region. Each integration needs separate verification of official live-ingest APIs, app review requirements, account eligibility, rate limits, content policies, and token lifecycle.

### Mini-games and comment-driven interactions

A mini-game needs comment ingestion, moderation, rate limiting, anti-spam controls, localization, and an overlay/rendering strategy. It should not be implemented as a simple client-side widget that exposes provider credentials or trusts unmoderated comments.

### Pricing parity

GoStream's public prices and limits may change. QC Live should use its own economics based on actual worker CPU, storage, bandwidth, provider fees, support cost, and abuse risk rather than copying public price points mechanically.

## Definition of complete parity

QC Live should be considered feature-complete for this product category when a user can:

1. Create an account using password or a secure magic link.
2. Upload or import a video from approved storage.
3. Preview and validate the media.
4. Connect multiple official or custom destinations.
5. Create a broadcast using a guided workflow.
6. Start it immediately or schedule it in a local time zone.
7. Close the browser without interrupting execution.
8. Monitor each destination independently.
9. Recover a failed destination without stopping healthy outputs.
10. Review analytics, logs, events, and run history.
11. Publish a protected or public player page.
12. Manage team access and destination ownership.
13. See usage against plan limits.
14. Receive actionable alerts when a broadcast or destination needs attention.

## Sources

[^1]: [GoStream public homepage](https://gostream.co/en)
[^2]: [GoStream public pricing page](https://gostream.co/en/pricing)
