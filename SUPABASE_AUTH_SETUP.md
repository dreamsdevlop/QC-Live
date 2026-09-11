# QC Live Supabase Auth and Channel Linking

This setup adds Supabase Auth ownership and provider metadata without exposing stream keys or OAuth tokens to the browser. QC Live may continue using its existing server session during migration; the schema supports a later move to Supabase Auth JWTs.

## 1. Apply the migrations

Run these migrations in order in the Supabase SQL Editor or through the Supabase CLI:

1. `supabase/migrations/20260911235000_qc_live_channel_connections.sql`
2. `supabase/migrations/20260912001200_supabase_auth_channel_linking.sql`

The second migration creates `qc_live_profiles`, creates a profile automatically when a user signs up, adds `owner_id` and OAuth metadata to channel connections, and enables row-level security.

## 2. Configure Supabase Auth

In **Supabase Dashboard → Authentication → Providers**, enable the providers you want. Email/password is the simplest starting point. For Google, GitHub, or another provider, register an OAuth application with that provider and copy its client ID and secret into Supabase.

Set the Supabase site URL to the public QC-Live URL. Add these redirect URLs:

```text
https://YOUR-VERCEL-DOMAIN.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

If the application is deployed behind a custom domain, add that exact HTTPS callback URL too. The URL must match character-for-character, including protocol and path.

Recommended initial Auth settings:

| Setting | Recommendation |
|---|---|
| Confirm email | Enabled for production; disabled only for local development |
| Minimum password length | At least 12 characters |
| Leaked password protection | Enabled |
| CAPTCHA/rate limits | Enable when the application is public |
| JWT expiry | Use the Supabase default unless the worker needs a different session lifetime |

## 3. Server environment variables

Set these only on the server or Vercel project environment. Never expose the service-role key or encryption secret through `NEXT_PUBLIC_*` variables.

```env
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_ANON_KEY=your-public-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
CHANNEL_ENCRYPTION_SECRET=at-least-32-random-characters
```

`SUPABASE_ANON_KEY` is safe for the browser when used with Supabase Auth. `SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and must be used only by a trusted server route or reviewed Edge Function. `CHANNEL_ENCRYPTION_SECRET` encrypts manual stream keys and OAuth tokens before they are stored.

## 4. Channel-linking data model

Every new channel connection should set `owner_id = auth.uid()` when using Supabase Auth. Manual RTMP connections use `auth_mode = 'manual'`. Provider-linked connections use `auth_mode = 'oauth'`, set `oauth_provider`, `oauth_account_id`, and `oauth_scope`, and store encrypted access/refresh tokens in the encrypted columns.

The client should receive only safe metadata such as `id`, `platform`, `display_name`, `account_name`, `ingest_url`, and status fields. It must never receive `encrypted_stream_key`, `encrypted_access_token`, or `encrypted_refresh_token`.

## 5. Recommended request flow

1. The browser signs in with Supabase Auth and receives an access token.
2. The browser sends the access token to a QC-Live server route in the `Authorization: Bearer <token>` header.
3. The server validates the token with Supabase Auth or the Supabase user endpoint.
4. The server checks that the requested channel belongs to the authenticated user.
5. The server encrypts a submitted stream key or OAuth token with `CHANNEL_ENCRYPTION_SECRET`.
6. The server writes the encrypted value using the service-role key.
7. When starting FFmpeg, the server decrypts the destination only in memory and never logs it or returns it to the client.

The current repository adapter still uses the existing QC-Live session and `owner_key` for backward compatibility. During a full Auth migration, update the adapter to use `owner_id` after validating the Supabase JWT, then backfill existing records with the corresponding Auth user IDs before making `owner_id` mandatory.

## 6. OAuth provider notes

Supabase Auth authenticates the QC-Live operator. It does not automatically grant YouTube, Twitch, or Meta Live permissions. Channel OAuth requires separate provider applications, scopes, callback handling, token refresh, and compliance review. Store only encrypted provider tokens and request the smallest scopes needed.

Manual RTMP linking is available without provider OAuth. It is the correct first implementation for a self-hosted 24/7 channel because the operator can paste the provider’s ingest URL and stream key, then QC-Live can reuse the destination for selected uploaded videos.

## 7. Deployment safety checklist

- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side.
- Use a different `CHANNEL_ENCRYPTION_SECRET` per environment.
- Back up the encryption secret separately from the database; without it, stored channel keys cannot be recovered.
- Do not log full RTMP URLs containing stream keys.
- Rotate provider tokens if a key or token is ever exposed.
- Use HTTPS for Vercel and all OAuth callbacks.
- Keep FFmpeg and persistent video storage on an always-on worker, not a Vercel serverless function.
