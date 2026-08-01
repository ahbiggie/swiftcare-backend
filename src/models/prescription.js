import { DataTypes } from "sequelize";

export default (sequelize) => {
  const Prescription = sequelize.define(
    "Prescription",
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      consultationId: { type: DataTypes.UUID, allowNull: false },
      drugName: { type: DataTypes.STRING, allowNull: false },
      dosage: { type: DataTypes.STRING, allowNull: false },
      frequency: { type: DataTypes.STRING, allowNull: false },
      duration: { type: DataTypes.STRING, allowNull: false },
    },
    {
      tableName: "prescriptions",
      // Written once, as part of completing a consultation - never edited after.
      updatedAt: false,
      indexes: [{ fields: ["consultationId"] }],
    },
  );

  Prescription.associate = (db) => {
    Prescription.belongsTo(db.Consultation, { foreignKey: "consultationId" });
  };

  return Prescription;
};
