// Single source of truth for every enum in the API contract.
// Never inline these string literals in a lane — import from here.

export const QueueStatus = {
  CHECKED_IN: 'Checked-In',
  TRIAGE_READY: 'Triage Ready',
  AWAITING_DOCTOR: 'Awaiting Doctor',
  IN_CONSULTATION: 'In Consultation',
  AWAITING_PAYMENT: 'Awaiting Payment',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export const Role = {
  ADMIN: 'admin',
  RECEPTIONIST: 'receptionist',
  NURSE: 'nurse',
  DOCTOR: 'doctor',
  CASHIER: 'cashier',
};

export const PaymentMethod = {
  CASH: 'cash',
  MOBILE_MONEY: 'mobile_money',
  INSURANCE: 'insurance',
};

export const AppointmentStatus = {
  SCHEDULED: 'Scheduled',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
};

export const InvoiceStatus = {
  PENDING: 'Pending',
  PAID: 'Paid',
};

export const StaffStatus = {
  INVITED: 'invited',
  ACTIVE: 'active',
};

export const ErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN_ROLE: 'FORBIDDEN_ROLE',
  FORBIDDEN_ORIGIN: 'FORBIDDEN_ORIGIN',
  INVITE_NOT_ACCEPTED: 'INVITE_NOT_ACCEPTED',
  NOT_FOUND: 'NOT_FOUND',
  DUPLICATE_PATIENT: 'DUPLICATE_PATIENT',
  QUEUE_ILLEGAL_TRANSITION: 'QUEUE_ILLEGAL_TRANSITION',
  QUEUE_ALREADY_CHECKED_IN: 'QUEUE_ALREADY_CHECKED_IN',
  INVOICE_ALREADY_PAID: 'INVOICE_ALREADY_PAID',
  PAYMENT_NOT_DUE: 'PAYMENT_NOT_DUE',
};

// Active = any status except the two terminal ones, Completed and Cancelled.
// A visit can now be cancelled on the queue itself (Checked-In -> Cancelled),
// so Cancelled is a real terminal queue state, not only an appointment status.
// This resolves the ambiguity S4/Q1 flagged: the "one active visit per patient"
// check treats a cancelled visit as closed, so the patient can check in again.
export const ACTIVE_QUEUE_STATUSES = [
  QueueStatus.CHECKED_IN,
  QueueStatus.TRIAGE_READY,
  QueueStatus.AWAITING_DOCTOR,
  QueueStatus.IN_CONSULTATION,
  QueueStatus.AWAITING_PAYMENT,
];
