'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('queue_status_events', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      queueEntryId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'queue_entries', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      fromStatus: { type: Sequelize.STRING, allowNull: false },
      toStatus: { type: Sequelize.STRING, allowNull: false },
      // Soft reference, deliberately no FK: the actor is a staff row for normal
      // transitions but the CLINIC row for admin overrides (admin is the clinic
      // account), and one FK can't point at two tables. An append-only audit log
      // keeps the id either way — attribution matters more than referential
      // integrity here, and a hard FK would 500 every admin override.
      changedBy: { type: Sequelize.UUID, allowNull: true },
      note: { type: Sequelize.TEXT, allowNull: true },
      // No updatedAt — events are immutable.
      createdAt: { type: Sequelize.DATE, allowNull: false },
    });

    // Per-visit history reads, in order.
    await queryInterface.addIndex('queue_status_events', ['queueEntryId', 'createdAt']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('queue_status_events');
  },
};
