import { DataTypes } from "sequelize";
import { AppointmentStatus } from "../constants/index.js";

export default (sequelize) => {
    const Appointment = sequelize.define(
        "Appointment",
        {
            id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
            clinicId: { type: DataTypes.UUID, allowNull: false },
            patientId: { type: DataTypes.UUID, allowNull: false },
            doctorId: { type: DataTypes.UUID, allowNull: false },
            date: { type: DataTypes.DATEONLY, allowNull: false },
            time: { type: DataTypes.TIME, allowNull: false },
            status: { type: DataTypes.ENUM(...Object.values(AppointmentStatus)), allowNull: false, defaultValue: AppointmentStatus.SCHEDULED },
        },
        {
            tableName: 'appointments',
            indexes: [
                { fields: ['clinicId', 'doctorId', 'date'] },
                { fields: ['patientId'] },
            ],
        }
    );

    Appointment.associate = (db) => {
        Appointment.belongsTo(db.Clinic, { foreignKey: 'clinicId' });
        Appointment.belongsTo(db.Patient, { foreignKey: 'patientId' });
        Appointment.belongsTo(db.Staff, { foreignKey: 'doctorId', as: 'doctor' });
    };

    return Appointment;
};
