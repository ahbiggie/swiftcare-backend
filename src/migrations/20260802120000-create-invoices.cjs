'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('invoices', {
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
      consultationId: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'consultations', key: 'id' },
        onUpdate: 'CASCADE',
        // Billing record of its own consultation - same relationship as
        // prescriptions -> consultations.
        onDelete: 'RESTRICT',
      },
      totalAmount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      // Literal, not imported: a migration is a snapshot (matches
      // InvoiceStatus.PENDING in constants/index.js).
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'Pending' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('invoices', ['patientId']);
    await queryInterface.addIndex('invoices', ['clinicId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('invoices');
  },
};
