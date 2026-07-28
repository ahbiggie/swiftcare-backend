// SHARED. Any lookup by :id or a body-supplied id must check this before
// querying — an invalid UUID makes Postgres throw a cast error, which
// errorHandler.js doesn't special-case and falls through to a 500.
export function isUuid(v) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
