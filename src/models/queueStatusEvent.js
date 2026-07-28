import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const QueueStatusEvent = sequelize.define(
    'QueueStatusEvent',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      queueEntryId: { type: DataTypes.UUID, allowNull: false },
      fromStatus: { type: DataTypes.STRING, allowNull: false },
      toStatus: { type: DataTypes.STRING, allowNull: false },
      changedBy: { type: DataTypes.UUID, allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
    },
    {
      tableName: 'queue_status_events',
      updatedAt: false,
      indexes: [{ fields: ['queueEntryId', 'createdAt'] }],
    }
  );

  QueueStatusEvent.associate = (db) => {
    QueueStatusEvent.belongsTo(db.QueueEntry, { foreignKey: 'queueEntryId' });
  };

  return QueueStatusEvent;
};
