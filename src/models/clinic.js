import { DataTypes } from 'sequelize';
import bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

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
                    clinic.password = await bcrypt.hash(clinic.password, SALT_ROUNDS);
                },
                beforeUpdate: async (clinic) => {
                    if (clinic.changed('password')) {
                        clinic.password = await bcrypt.hash(clinic.password, SALT_ROUNDS);
                    }
                },
            },
        });

    // POST auth/login to verify a plaintext password against the hash stored.
    Clinic.prototype.comparePassword = function (candidate) {
        return bcrypt.compare(candidate, this.password);
    };
    Clinic.associate = (db) => {
        Clinic.hasMany(db.Patient, { foreignKey: 'clinicId' })
        Clinic.hasStaff(db.Staff, { foreignKey: 'clinicId' })
    };
    return Clinic;
};
