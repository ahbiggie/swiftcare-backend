import { DataTypes } from "sequelize";
import { PaymentMethod } from "../constants/index.js";

export default (sequelize) => {
  const Payment = sequelize.define(
    "Payment",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      clinicId: { type: DataTypes.UUID, allowNull: false },
      patientId: { type: DataTypes.UUID, allowNull: false },
      // One payment per invoice - double payment is blocked at the service
      // layer (invoice.status check inside the locked transaction), this is
      // just the DB-level backstop.
      invoiceId: { type: DataTypes.UUID, allowNull: false, unique: true },
      // Copied from invoice.totalAmount at payment time - never accepted from
      // the request body (see createPayment).
      amount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      method: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: { isIn: [Object.values(PaymentMethod)] },
      },
      receivedBy: { type: DataTypes.UUID, allowNull: false },
    },
    {
      tableName: "payments",
      indexes: [
        // Hot path: GET /payments/history filters by clinic, optionally by date.
        { fields: ["clinicId", "createdAt"] },
      ],
    },
  );

  Payment.associate = (db) => {
    Payment.belongsTo(db.Clinic, { foreignKey: "clinicId" });
    Payment.belongsTo(db.Patient, { foreignKey: "patientId" });
    Payment.belongsTo(db.Invoice, { foreignKey: "invoiceId" });
    Payment.belongsTo(db.Staff, { as: "receivedByStaff", foreignKey: "receivedBy" });
  };

  return Payment;
};
