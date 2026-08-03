// CORS currently reflects the request's Origin rather than restricting to
// the CORS_ORIGIN allow-list. TEMPORARY — see DECISIONS.md for why and the
// trigger to revert. Boots the real app and drives it over HTTP so the full
// path is exercised, via node --test (zero deps).

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

let app;
let server;
let baseUrl;

before(async () => {
  ({ default: app } = await import('../src/app.js'));
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server?.close();
});

// GET /api/health with an optional Origin header.
async function hit(origin) {
  const res = await fetch(`${baseUrl}/api/health`, {
    headers: origin ? { Origin: origin } : {},
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body, allowOriginHeader: res.headers.get('access-control-allow-origin') };
}

test('any origin gets through, including one that would have failed the old allow-list', async () => {
  const { status, body } = await hit('https://not-on-any-allowlist.example');
  assert.equal(status, 200);
  assert.equal(body.success, true);
});

test('the response reflects the actual request origin, not a bare "*"', async () => {
  // The reason for `origin: true` over a bare wildcard: "*" and
  // Access-Control-Allow-Credentials: true can't coexist, so reflecting the
  // real origin keeps this compatible if credentialed requests are ever
  // introduced later. Verified directly against the response header, not
  // just inferred from the config.
  const { allowOriginHeader } = await hit('https://reflect-me.example');
  assert.equal(allowOriginHeader, 'https://reflect-me.example');
});

test('no Origin header (server-to-server / curl / health check) is not blocked', async () => {
  const { status, body } = await hit(null);
  assert.equal(status, 200);
  assert.equal(body.success, true);
});
