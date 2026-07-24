import { DataTypes } from 'sequelize';
import { Role, StaffStatus } from '../constants/index.js';
import { hashPassword, comparePassword } from '../utils/password.js';

// Staff are the invited users (receptionist | nurse | doctor | cashier).
// `admin` is deliberately excluded: the admin account IS the Clinic record
// (see clinic.js — "The Clinic account is the admin account"). Derive the allowed set from Role by removing admin
const INVITABLE_ROLES = Object.values(Role).filter((r) => r !== Role.ADMIN);

export default (sequelize) => {
    const Staff = sequelize.define(
        'Staff',
        {
            id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
            clinicId: { type: DataTypes.UUID, allowNull: false },
            name: { type: DataTypes.STRING, allowNull: false },
            email: {
                type: DataTypes.STRING, allowNull: false,
                unique: true,
                validate: { isEmail: true },
            },
            role: {
                type: DataTypes.STRING, allowNull: false,
                validate: { isIn: [INVITABLE_ROLES] },
            },
            status: {
                type: DataTypes.STRING, allowNull: false,
                defaultValue: StaffStatus.INVITED,
                validate: { isIn: [Object.values(StaffStatus)] },
            },
            // No password exists at invite time — it first shows up at
            // POST /auth/accept-invite. Hence nullable, and the hook guards
            // against hashing an absent value on create.
            password: { type: DataTypes.STRING, allowNull: true },
            inviteToken: { type: DataTypes.STRING, allowNull: true, unique: true },
        },
        {
            tableName: 'staff',
            indexes: [
                { fields: ['clinicId', 'email'] },
            ],
            hooks: {
                beforeCreate: async (staff) => {
                    if (staff.password) {
                        staff.password = await hashPassword(staff.password);
                    }
                },
                beforeUpdate: async (staff) => {
                    // Fires on accept-invite, when the password is first set.
                    if (staff.changed('password') && staff.password) {
                        staff.password = await hashPassword(staff.password);
                    }
                },
            },
        });

    // POST /auth/login verifies a plaintext password against the stored hash.
    Staff.prototype.comparePassword = function (candidate) {
        return comparePassword(candidate, this.password);
    };

    Staff.associate = (db) => {
        Staff.belongsTo(db.Clinic, { foreignKey: 'clinicId' });
    };

    return Staff;
};
