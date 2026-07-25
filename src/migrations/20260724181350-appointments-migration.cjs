'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('appointments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      clinicId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'clinics', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      patientId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'patients', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      doctorId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
      },
      time: {
        type: Sequelize.TIME,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('Scheduled', 'Cancelled', 'Completed'),
        allowNull: false,
        defaultValue: 'Scheduled',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('appointments', ['clinicId', 'doctorId']);
    await queryInterface.addIndex('appointments', ['patientId']);
  },

  async down(queryInterface, Sequelize) {
    /**
     * Add reverting commands here.
     *
     * Example:
     * await queryInterface.dropTable('users');
     */
    await queryInterface.dropTable('appointments');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_appointments_status";');
  }
};
