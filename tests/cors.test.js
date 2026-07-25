// CORS origin allow-list, via node --test (zero deps — see DECISIONS "Tests").
// Boots the real app and drives it over HTTP so the full path is exercised:
// cors origin callback -> next(err) -> errorHandler -> the contract envelope.
//
// CORS_ORIGIN is read once at app-module load, so it must be set before the
// dynamic import below — hence the import inside the test rather than at top.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

let app;
let server;
let baseUrl;

before(async () => {
  process.env.CORS_ORIGIN = 'http://localhost:5173,https://good.example';
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
  return { status: res.status, body };
}

test('an allowed origin gets through', async () => {
  const { status, body } = await hit('http://localhost:5173');
  assert.equal(status, 200);
  assert.equal(body.success, true);
});

test('a disallowed origin is 403 FORBIDDEN_ORIGIN in the contract envelope', async () => {
  const { status, body } = await hit('https://evil.example');
  assert.equal(status, 403); // an access decision, not a 500 server fault
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'FORBIDDEN_ORIGIN');
});

test('no Origin header (server-to-server / curl / health check) is not blocked', async () => {
  const { status, body } = await hit(null);
  assert.equal(status, 200);
  assert.equal(body.success, true);
});
