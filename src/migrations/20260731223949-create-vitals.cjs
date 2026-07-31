'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('vitals', {
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
        // Vitals are core clinical history — must not vanish with the visit row.
        onDelete: 'RESTRICT',
      },
      patientId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'patients', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      bpSystolic: { type: Sequelize.INTEGER, allowNull: false },
      bpDiastolic: { type: Sequelize.INTEGER, allowNull: false },
      temperature: { type: Sequelize.FLOAT, allowNull: false }, // Celsius
      weight: { type: Sequelize.FLOAT, allowNull: false }, // kg
      recordedBy: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      recordedAt: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });

    // Hot path: GET /vitals/:patientId, optionally narrowed by queueEntryId.
    await queryInterface.addIndex('vitals', ['patientId', 'queueEntryId']);
    await queryInterface.addIndex('vitals', ['clinicId']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('vitals');
  },
};
