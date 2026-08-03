import { createPayment, listPaymentHistory } from "../services/payment/payment.service.js";
import { ok } from "../utils/response.js";
import { parsePagination } from "../utils/pagination.js";

export async function postPayment(req, res, next) {
  try {
    const { invoiceId, method } = req.body || {};
    const result = await createPayment({
      clinicId: req.user.clinicId,
      invoiceId,
      method,
      cashierId: req.user.id,
    });
    return ok(res, result);
  } catch (err) {
    return next(err);
  }
}

export async function getPaymentHistory(req, res, next) {
  try {
    const { limit, offset } = parsePagination(req.query);
    const data = await listPaymentHistory({
      clinicId: req.user.clinicId,
      date: req.query.date,
      method: req.query.method,
      limit,
      offset,
    });
    return ok(res, data);
  } catch (err) {
    return next(err);
  }
}
