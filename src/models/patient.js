import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Patient = sequelize.define(
    'Patient',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      clinicId: { type: DataTypes.UUID, allowNull: false },
      firstName: { type: DataTypes.STRING, allowNull: false },
      lastName: { type: DataTypes.STRING, allowNull: false },
      // Deliberately NOT unique. No natural key identifies a person — see the
      // Duplicate Patient Handling section of docs/API_CONTRACT.md. Matching is
      // an application-level workflow, not a DB constraint.
      phone: { type: DataTypes.STRING, allowNull: false },
      gender: { type: DataTypes.STRING },
      dob: { type: DataTypes.DATEONLY },
    },
    {
      tableName: 'patients',
      // Non-unique index: makes the duplicate-candidate lookup fast without
      // asserting that (clinicId, phone) identifies one person.
      indexes: [{ fields: ['clinicId', 'phone'] }],
    }
  );

  Patient.associate = (db) => {
    // TODO (Lane 1): uncomment once src/models/clinic.js lands and is registered
    // in models/index.js. Associating against a model that isn't in the registry
    // throws at boot.
    // Patient.belongsTo(db.Clinic, { foreignKey: 'clinicId' });
  };

  return Patient;
};
