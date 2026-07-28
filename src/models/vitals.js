import { DataTypes, Model } from "sequelize";
import { sequelize } from "../config/database.js";

class Vitals extends Model {}

Vitals.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    queueEntryId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "queue_entry_id",
    },
    patientId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "patient_id",
    },
    bpSystolic: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "bp_systolic",
      validate: { min: 40, max: 300 },
    },
    bpDiastolic: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: "bp_diastolic",
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
    recordedBy: {
      type: DataTypes.UUID,
      allowNull: false,
      field: "recorded_by",
    },
    recordedAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: "recorded_at",
    },
  },
  {
    sequelize,
    modelName: "Vitals",
    tableName: "vitals",
    underscored: true,
    timestamps: true,
    indexes: [{ fields: ["patient_id", "queue_entry_id"] }],
  },
);

export default Vitals;
