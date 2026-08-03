'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payments', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
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
        onDelete: 'RESTRICT',
      },
      invoiceId: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'invoices', key: 'id' },
        onUpdate: 'CASCADE',
        // Billing record of its own invoice - same relationship as
        // invoices -> consultations.
        onDelete: 'RESTRICT',
      },
      amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      method: { type: Sequelize.STRING, allowNull: false },
      receivedBy: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // Hot path: GET /payments/history filters by clinic, optionally by date.
    await queryInterface.addIndex('payments', ['clinicId', 'createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payments');
  },
};
