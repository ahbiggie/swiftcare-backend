import { DataTypes } from "sequelize";

export default (sequelize) => {
  const Vitals = sequelize.define(
    "Vitals",
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      clinicId: { type: DataTypes.UUID, allowNull: false },
      queueEntryId: { type: DataTypes.UUID, allowNull: false },
      patientId: { type: DataTypes.UUID, allowNull: false },
      bpSystolic: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 40, max: 300 },
      },
      bpDiastolic: {
        type: DataTypes.INTEGER,
        allowNull: false,
        validate: { min: 20, max: 200 },
      },
      temperature: {
        type: DataTypes.FLOAT, // Celsius
        allowNull: false,
        validate: { min: 25, max: 45 },
      },
      weight: {
        type: DataTypes.FLOAT, // kg
        allowNull: false,
        validate: { min: 0 },
      },
      recordedBy: { type: DataTypes.UUID, allowNull: false },
      recordedAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      tableName: "vitals",
      updatedAt: false,
      indexes: [
        // Hot path: GET /vitals/:patientId, optionally narrowed by queueEntryId.
        { fields: ["patientId", "queueEntryId"] },
        { fields: ["clinicId"] },
      ],
    },
  );

  Vitals.associate = (db) => {
    Vitals.belongsTo(db.Clinic, { foreignKey: "clinicId" });
    Vitals.belongsTo(db.Patient, { foreignKey: "patientId" });
    Vitals.belongsTo(db.QueueEntry, { foreignKey: "queueEntryId" });
    Vitals.belongsTo(db.Staff, {
      as: "recordedByStaff",
      foreignKey: "recordedBy",
    });
  };

  return Vitals;
};
