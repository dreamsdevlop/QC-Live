# Vercel deployment fix

The Vercel build log showed that QC Live compiled successfully at the repository root, but Vercel then searched for the Next.js output at `/vercel/path0/worker/.next` and failed. The repository contains both the Next.js dashboard and the vendored PyRunner backend under `worker/`; the dashboard must remain the Vercel build target.

The root `vercel.json` now explicitly sets:

```json
{
  "framework": "nextjs",
  "buildCommand": "npm run build",
  "installCommand": "npm install",
  "outputDirectory": ".next"
}
```

If Vercel project settings still override the repository file, set **Root Directory** to the repository root and **Output Directory** to `.next`. Do not set either value to `worker`.

The PyRunner backend is deployed separately through `docker-compose.production.yml`; it is not a Vercel build target.
