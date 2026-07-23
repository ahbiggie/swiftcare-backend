'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('staff', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      clinicId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'clinics', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false },
      role: { type: Sequelize.STRING, allowNull: false },
      // Literal, not imported from constants: a migration is a snapshot and must
      // not shift if the enum later changes. Matches StaffStatus.INVITED.
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'invited' },
      // Nullable: no password until POST /auth/accept-invite (see staff.js).
      password: { type: Sequelize.STRING, allowNull: true },
      inviteToken: { type: Sequelize.STRING, allowNull: true, unique: true },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // Email unique per clinic, not globally (staff.js). Name matches the ORM's
    // auto-generated index name so the two describe the same constraint.
    await queryInterface.addIndex('staff', ['clinicId', 'email'], {
      unique: true,
      name: 'staff_clinic_id_email',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('staff');
  },
};
