'use strict';

// Supersedes the FK deferral in 20260724193354-create-queue-entries.cjs: the
// appointments table now exists (20260725150000), so the constraint can land.
// Mirrors 20260725131733-add-patient-fk-to-queue-entries.cjs.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.addConstraint('queue_entries', {
      fields: ['appointmentId'],
      type: 'foreign key',
      name: 'queue_entries_appointmentId_fkey',
      references: { table: 'appointments', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeConstraint('queue_entries', 'queue_entries_appointmentId_fkey');
  },
};
