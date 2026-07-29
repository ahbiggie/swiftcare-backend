import sequelize from "../config/database.js";
import definePatient from "./patient.js";
import defineClinic from "./clinic.js";
import defineStaff from "./staff.js";
import defineAppointment from "./appointment.js";
import defineQueueEntry from "./queueEntry.js";
import defineQueueStatusEvent from "./queueStatusEvent.js";
import defineVitals from "./vitals.js";

const Patient = definePatient(sequelize);
const Clinic = defineClinic(sequelize);
const Staff = defineStaff(sequelize);
const Appointment = defineAppointment(sequelize);
const QueueEntry = defineQueueEntry(sequelize);
const QueueStatusEvent = defineQueueStatusEvent(sequelize);
const Vitals = defineVitals(sequelize);

const db = {
  Patient,
  Clinic,
  Staff,
  Appointment,
  QueueEntry,
  QueueStatusEvent,
  Vitals,
};

Object.values(db).forEach((model) => {
  if (typeof model.associate === "function") model.associate(db);
});

db.sequelize = sequelize;

export default db;
