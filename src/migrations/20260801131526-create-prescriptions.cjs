'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('prescriptions', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      consultationId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'consultations', key: 'id' },
        onUpdate: 'CASCADE',
        // Detail rows of their own consultation - same relationship as
        // queue_status_events -> queue_entries.
        onDelete: 'CASCADE',
      },
      drugName: { type: Sequelize.STRING, allowNull: false },
      dosage: { type: Sequelize.STRING, allowNull: false },
      frequency: { type: Sequelize.STRING, allowNull: false },
      duration: { type: Sequelize.STRING, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });

    await queryInterface.addIndex('prescriptions', ['consultationId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('prescriptions');
  },
};
