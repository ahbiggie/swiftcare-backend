// SHARED. GET /users is the first endpoint to need page/limit, but the
// contract's 1/20/100 convention applies to every list endpoint still coming
// (GET /patients, GET /payments/history, ...). One parser now so nobody
// downstream reinvents it slightly differently.
export function parsePagination(query) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}
