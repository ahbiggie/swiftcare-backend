import { DataTypes, Op } from 'sequelize';
import { QueueStatus } from '../constants/index.js';

// Terminal statuses — the complement of ACTIVE_QUEUE_STATUSES. A visit in one of
// these no longer occupies the queue, so it doesn't count toward the
// one-active-visit rule below.
const TERMINAL_STATUSES = [QueueStatus.COMPLETED, QueueStatus.CANCELLED];

export default (sequelize) => {
  const QueueEntry = sequelize.define(
    'QueueEntry',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      // Denormalized: set once at check-in, never changes. GET /queue is the
      // hottest read in the system (every role polls it) and is always
      // clinic-scoped, so storing clinicId avoids a Patient join on every poll.
      clinicId: { type: DataTypes.UUID, allowNull: false },
      patientId: { type: DataTypes.UUID, allowNull: false },
      // Optional: walk-ins have no appointment. FK wired once Appointment exists.
      appointmentId: { type: DataTypes.UUID, allowNull: true },
      assignedDoctorId: { type: DataTypes.UUID, allowNull: false },
      // Whoever last changed status; null until the first transition after check-in.
      lastUpdatedBy: { type: DataTypes.UUID, allowNull: true },
      // Only POST /queue/check-in creates a QueueEntry, always at Checked-In,
      // so the model owns the default rather than the service.
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
        // One active visit per patient, enforced by the DB. Unlike D3 (patient
        // identity is ambiguous), "already has a non-terminal row" is a plain
        // checkable fact, so the DB can own it. Partial index: applies only to
        // non-terminal rows, so a completed/cancelled visit never blocks a fresh
        // check-in. A violation surfaces as QUEUE_ALREADY_CHECKED_IN — the
        // service pre-checks for a clean message, this is the race-proof backstop.
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
    // TODO: uncomment once Appointment (Lane 2 / Victor) is built and registered
    // in models/index.js — same pattern Patient followed waiting on Clinic.
    // QueueEntry.belongsTo(db.Appointment, { foreignKey: 'appointmentId' });
  };

  return QueueEntry;
};
