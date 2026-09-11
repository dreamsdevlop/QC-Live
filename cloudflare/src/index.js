addEventListener('fetch', (event) => {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  const url = new URL(request.url);

  if (url.pathname === '/health') {
    return new Response(JSON.stringify({
      ok: true,
      service: 'qc-live-control',
      plan: 'free-compatible',
      ffmpeg: 'external-worker-required',
    }), {
      headers: { 'content-type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}
