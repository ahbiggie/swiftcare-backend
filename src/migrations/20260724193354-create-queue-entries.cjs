'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('queue_entries', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      clinicId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'clinics', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      // FK deferred: the patients table (Lane 2 / Victor) isn't migrated yet, so
      // referencing it here would fail. Column now; a later migration adds the
      // constraint once patients exists. Same holding pattern as appointmentId.
      patientId: { type: Sequelize.UUID, allowNull: false },
      // Nullable (walk-ins). No FK yet — the appointments table doesn't exist;
      // a later migration adds the reference once Lane 2 builds it.
      appointmentId: { type: Sequelize.UUID, allowNull: true },
      assignedDoctorId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'staff', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      lastUpdatedBy: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL', // nullable; keep the visit if the staff row goes
      },
      // Literal, not imported: a migration is a snapshot (matches QueueStatus.CHECKED_IN).
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'Checked-In' },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    });

    // One active visit per patient — partial unique index, only over non-terminal
    // rows, so a Completed/Cancelled visit never blocks a fresh check-in. Terminal
    // literals are the snapshot equivalent of TERMINAL_STATUSES in the model.
    await queryInterface.addIndex('queue_entries', ['patientId'], {
      unique: true,
      name: 'one_active_visit_per_patient',
      where: { status: { [Sequelize.Op.notIn]: ['Completed', 'Cancelled'] } },
    });

    // Hot path: GET /queue filters by status within a clinic.
    await queryInterface.addIndex('queue_entries', ['clinicId', 'status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('queue_entries');
  },
};
