import { DataTypes, Op } from 'sequelize';
import { QueueStatus, ACTIVE_QUEUE_STATUSES } from '../constants/index.js';

// Terminal = whatever isn't active, derived so it can't drift from the shared
// constant. (The .cjs migration can't import ESM constants, so it restates
// these as literals — keep 20260724193354-create-queue-entries.cjs in sync.)
const TERMINAL_STATUSES = Object.values(QueueStatus).filter(
  (s) => !ACTIVE_QUEUE_STATUSES.includes(s),
);

export default (sequelize) => {
  const QueueEntry = sequelize.define(
    'QueueEntry',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      clinicId: { type: DataTypes.UUID, allowNull: false },
      patientId: { type: DataTypes.UUID, allowNull: false },
      appointmentId: { type: DataTypes.UUID, allowNull: true },
      assignedDoctorId: { type: DataTypes.UUID, allowNull: false },
      lastUpdatedBy: { type: DataTypes.UUID, allowNull: true },
      status: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: QueueStatus.CHECKED_IN,
        validate: { isIn: [Object.values(QueueStatus)] },
      },
    },
    {
      tableName: 'queue_entries',

      indexes: [
        {
          unique: true,
          fields: ['patientId'],
          name: 'one_active_visit_per_patient',
          where: { status: { [Op.notIn]: TERMINAL_STATUSES } },
        },
        // Hot path: GET /queue filters by status within a clinic.
        { fields: ['clinicId', 'status'] },
      ],
    }
  );

  QueueEntry.associate = (db) => {
    QueueEntry.belongsTo(db.Patient, { foreignKey: 'patientId' });
    QueueEntry.belongsTo(db.Clinic, { foreignKey: 'clinicId' });
    // Two FKs into the same model — `as` disambiguates which column each means.
    QueueEntry.belongsTo(db.Staff, { as: 'assignedDoctor', foreignKey: 'assignedDoctorId' });
    QueueEntry.belongsTo(db.Staff, { as: 'lastUpdatedByStaff', foreignKey: 'lastUpdatedBy' });
    QueueEntry.hasMany(db.QueueStatusEvent, { as: 'statusEvents', foreignKey: 'queueEntryId' });
    QueueEntry.belongsTo(db.Appointment, { foreignKey: 'appointmentId' });
  };

  return QueueEntry;
};
