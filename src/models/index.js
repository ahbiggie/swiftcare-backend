// Explicit registry. The sequelize-cli auto-loader reads the models directory
// with require() and does not translate cleanly to ESM, so each model is
// imported and registered by hand. Add yours in both places below.
import sequelize from '../config/database.js';
import definePatient from './patient.js';
// import defineClinic from './clinic.js';

const Patient = definePatient(sequelize);
// const Clinic = defineClinic(sequelize);

const db = { Patient /* , Clinic */ };

Object.values(db).forEach((model) => {
  if (typeof model.associate === 'function') model.associate(db);
});

db.sequelize = sequelize;

export default db;
