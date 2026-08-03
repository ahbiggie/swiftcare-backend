import { getInvoicesForPatient } from "../services/invoice/invoice.service.js";
import { ok } from "../utils/response.js";

export async function getInvoices(req, res, next) {
  try {
    const { patientId } = req.params;
    const { queueEntryId } = req.query;
    const invoices = await getInvoicesForPatient({
      clinicId: req.user.clinicId,
      patientId,
      queueEntryId,
    });
    return ok(res, { invoices });
  } catch (err) {
    return next(err);
  }
}
