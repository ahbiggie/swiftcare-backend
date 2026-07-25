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
      changedBy: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'staff', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL', // losing the who shouldn't lose the event
      },
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
