import { DataTypes } from 'sequelize';
import { hashPassword, comparePassword } from '../utils/password.js';

export default (sequelize) => {
    const Clinic = sequelize.define(
        'Clinic',
        {
            id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
            name: { type: DataTypes.STRING, allowNull: false },
            address: { type: DataTypes.STRING, allowNull: false },
            //The Clinic account is the admin account.
            email: {
                type: DataTypes.STRING, allowNull: false,
                unique: true,
                // it is unique because it's a login credential
                validate: { isEmail: true },
            },
            password: { type: DataTypes.STRING, allowNull: false },
        },
        {
            tableName: 'clinics',
            indexes: [{ unique: true, fields: ['email'] }],
            hooks: {
                beforeCreate: async (clinic) => {
                    clinic.password = await hashPassword(clinic.password);
                },
                beforeUpdate: async (clinic) => {
                    if (clinic.changed('password')) {
                        clinic.password = await hashPassword(clinic.password);
                    }
                },
            },
        });

    // POST auth/login to verify a plaintext password against the hash stored.
    Clinic.prototype.comparePassword = function (candidate) {
        return comparePassword(candidate, this.password);
    };
    Clinic.associate = (db) => {
        // One clinic has many patients and many staff - this is not a sequelize method, just a placeholder.
        Clinic.hasMany(db.Patient, { foreignKey: 'clinicId' })
        Clinic.hasMany(db.Staff, { foreignKey: 'clinicId' })
    };
    return Clinic;
};
