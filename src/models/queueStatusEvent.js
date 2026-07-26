import { DataTypes } from 'sequelize';

// One row per queue transition — where the "why" behind a move lives (the note
// the guard requires on cancellation). Written only by the queue service, in
// the same transaction as the status update. Also the future data source for
// the deferred queue-bottleneck dashboard metric (time-in-status from
// consecutive event timestamps). Lane 4's audit-logs can read or supersede it.
export default (sequelize) => {
  const QueueStatusEvent = sequelize.define(
    'QueueStatusEvent',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      queueEntryId: { type: DataTypes.UUID, allowNull: false },
      fromStatus: { type: DataTypes.STRING, allowNull: false },
      toStatus: { type: DataTypes.STRING, allowNull: false },
      // Soft reference, no FK: for an admin override the actor is the clinic row,
      // not a staff row, so one FK can't cover both. See the migration.
      changedBy: { type: DataTypes.UUID, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'queue_status_events',
      // Events are immutable — created, never updated.
      updatedAt: false,
      // Documentation, not enforcement (no sync()); real index in the migration.
      indexes: [{ fields: ['queueEntryId', 'createdAt'] }],
    }
  );

  QueueStatusEvent.associate = (db) => {
    QueueStatusEvent.belongsTo(db.QueueEntry, { foreignKey: 'queueEntryId' });
    // No belongsTo(Staff) on changedBy — it isn't always a staff id (admin
    // overrides carry the clinic id), so the association would lie.
  };

  return QueueStatusEvent;
};
