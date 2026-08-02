'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('consultations', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      clinicId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'clinics', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      queueEntryId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'queue_entries', key: 'id' },
        onUpdate: 'CASCADE',
        // Clinical history - must not vanish with the visit row. Same
        // reasoning as vitals.queueEntryId.
        onDelete: 'RESTRICT',
      },
      patientId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'patients', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      doctorId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      notes: { type: Sequelize.TEXT, allowNull: true },
      diagnosis: { type: Sequelize.TEXT, allowNull: true },
      // Literal, not imported: a migration is a snapshot (matches
      // ConsultationStatus.IN_PROGRESS in constants/index.js).
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'in_progress' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // Hot path: GET /consultations/:patientId, optionally narrowed by queueEntryId.
    await queryInterface.addIndex('consultations', ['patientId', 'queueEntryId']);
    await queryInterface.addIndex('consultations', ['clinicId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('consultations');
  },
};
