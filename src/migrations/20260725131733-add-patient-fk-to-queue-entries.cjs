'use strict';

// Supersedes the FK deferral in 20260724193354-create-queue-entries.cjs: the
// patients table now exists (20260725124601), so the constraint can land.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addConstraint('queue_entries', {
      fields: ['patientId'],
      type: 'foreign key',
      name: 'queue_entries_patientId_fkey',
      references: { table: 'patients', field: 'id' },
      onUpdate: 'CASCADE',
      // Visit history must not vanish with a patient row — same logic as assignedDoctorId.
      onDelete: 'RESTRICT',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('queue_entries', 'queue_entries_patientId_fkey');
  },
};
