import { DataTypes } from "sequelize";
import { InvoiceStatus } from "../constants/index.js";

export default (sequelize) => {
  const Invoice = sequelize.define(
    "Invoice",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      clinicId: { type: DataTypes.UUID, allowNull: false },
      patientId: { type: DataTypes.UUID, allowNull: false },
      // One invoice per consultation - created only by the complete step.
      consultationId: { type: DataTypes.UUID, allowNull: false, unique: true },
      totalAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: InvoiceStatus.PENDING,
        validate: { isIn: [Object.values(InvoiceStatus)] },
      },
    },
    {
      tableName: "invoices",
      indexes: [
        // Hot path: GET /invoices/:patientId (billing lane).
        { fields: ["patientId"] },
        { fields: ["clinicId"] },
      ],
    },
  );

  Invoice.associate = (db) => {
    Invoice.belongsTo(db.Clinic, { foreignKey: "clinicId" });
    Invoice.belongsTo(db.Patient, { foreignKey: "patientId" });
    Invoice.belongsTo(db.Consultation, { foreignKey: "consultationId" });
  };

  return Invoice;
};
