import { Op } from "sequelize";
import db from "../../models/index.js";
import ApiError from "../../utils/ApiError.js";
import { ErrorCode, InvoiceStatus, QueueStatus, PaymentMethod, Role } from "../../constants/index.js";
import { isUuid } from "../../utils/uuid.js";
import { changeStatus } from "../queue/queue.service.js";

const { Invoice, Payment, Consultation, QueueEntry, sequelize } = db;

// POST /payments - body is { invoiceId, method } only, deliberately no
// amount: the backend reads the invoice's own total, same discipline
// completeConsultation uses for CONSULTATION_FEE rather than trusting a
// caller-supplied price. One transaction, invoice row locked before checking
// whether it's already paid, then the queue move to Completed rides the same
// transaction via changeStatus's transaction param - if anything fails,
// nothing above it is saved.
export async function createPayment({ clinicId, invoiceId, method, cashierId }) {
  if (!invoiceId || !method) {
    throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "invoiceId and method are required.");
  }
  if (!Object.values(PaymentMethod).includes(method)) {
    throw new ApiError(
      400,
      ErrorCode.VALIDATION_ERROR,
      `method must be one of: ${Object.values(PaymentMethod).join(", ")}.`,
    );
  }
  if (!isUuid(invoiceId)) {
    throw new ApiError(404, ErrorCode.NOT_FOUND, "Invoice not found");
  }

  return sequelize.transaction(async (t) => {
    // Row lock: nothing else may act on this invoice while we decide whether
    // to pay it - same discipline as completeConsultation's lock on Consultation.
    const invoice = await Invoice.findByPk(invoiceId, { transaction: t, lock: t.LOCK.UPDATE });

    if (!invoice || invoice.clinicId !== clinicId) {
      throw new ApiError(404, ErrorCode.NOT_FOUND, "Invoice not found");
    }

    if (invoice.status === InvoiceStatus.PAID) {
      throw new ApiError(409, ErrorCode.INVOICE_ALREADY_PAID, "This invoice has already been paid.");
    }

    // The queue entry this invoice's consultation belongs to - locked too,
    // since changeStatus below is about to move it and we need its current
    // status first to tell "already paid" apart from "not due yet".
    const consultation = await Consultation.findByPk(invoice.consultationId, { transaction: t });
    const queueEntry = await QueueEntry.findByPk(consultation.queueEntryId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });

    if (queueEntry.status !== QueueStatus.AWAITING_PAYMENT) {
      throw new ApiError(409, ErrorCode.PAYMENT_NOT_DUE, "Patient is not at Awaiting Payment.");
    }

    invoice.status = InvoiceStatus.PAID;
    await invoice.save({ transaction: t });

    const payment = await Payment.create(
      {
        clinicId,
        patientId: invoice.patientId,
        invoiceId: invoice.id,
        amount: invoice.totalAmount,
        method,
        receivedBy: cashierId,
      },
      { transaction: t },
    );

    // Same transition the queue route itself would make (Awaiting Payment ->
    // Completed, cashier-owned) - reusing changeStatus keeps the transition
    // rules in one place. queueEntry is already locked above; changeStatus's
    // own lock on the same row within this transaction just re-affirms it.
    const queueResult = await changeStatus({
      queueId: queueEntry.id,
      actor: { id: cashierId, clinicId, role: Role.CASHIER },
      status: QueueStatus.COMPLETED,
      transaction: t,
    });

    return {
      payment: { id: payment.id },
      // Data, not a PDF - the contract's own words for this shape.
      receipt: {
        invoiceId: invoice.id,
        patientId: invoice.patientId,
        amount: Number(payment.amount),
        method: payment.method,
        receivedBy: payment.receivedBy,
        paidAt: payment.createdAt,
      },
      queueStatus: queueResult.status,
    };
  });
}

// GET /payments/history?date=&method=&page=&limit=
export async function listPaymentHistory({ clinicId, date, method, limit, offset }) {
  const where = { clinicId };
  if (method) where.method = method;

  if (date) {
    const start = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      throw new ApiError(400, ErrorCode.VALIDATION_ERROR, "date must be a valid date (YYYY-MM-DD).");
    }
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    where.createdAt = { [Op.gte]: start, [Op.lt]: end };
  }

  const { rows, count } = await Payment.findAndCountAll({
    where,
    limit,
    offset,
    order: [["createdAt", "DESC"]],
  });
  return { payments: rows, total: count };
}
