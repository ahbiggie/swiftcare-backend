import { DataTypes } from "sequelize";
import { ConsultationStatus } from "../constants/index.js";

export default (sequelize) => {
  const Consultation = sequelize.define(
    "Consultation",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      clinicId: { type: DataTypes.UUID, allowNull: false },
      queueEntryId: { type: DataTypes.UUID, allowNull: false },
      patientId: { type: DataTypes.UUID, allowNull: false },
      doctorId: { type: DataTypes.UUID, allowNull: false },
      // Filled in on complete, not at open time.
      notes: { type: DataTypes.TEXT, allowNull: true },
      diagnosis: { type: DataTypes.TEXT, allowNull: true },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: ConsultationStatus.IN_PROGRESS,
        validate: { isIn: [Object.values(ConsultationStatus)] },
      },
    },
    {
      tableName: "consultations",
      indexes: [
        // Hot path: GET /consultations/:patientId, optionally narrowed by queueEntryId.
        { fields: ["patientId", "queueEntryId"] },
        { fields: ["clinicId"] },
      ],
    },
  );

  Consultation.associate = (db) => {
    Consultation.belongsTo(db.Clinic, { foreignKey: "clinicId" });
    Consultation.belongsTo(db.Patient, { foreignKey: "patientId" });
    Consultation.belongsTo(db.QueueEntry, { foreignKey: "queueEntryId" });
    Consultation.belongsTo(db.Staff, { as: "doctor", foreignKey: "doctorId" });
    Consultation.hasMany(db.Prescription, { foreignKey: "consultationId" });
  };

  return Consultation;
};
