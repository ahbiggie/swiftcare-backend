import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Patient = sequelize.define(
    'Patient',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      clinicId: { type: DataTypes.UUID, allowNull: false },
      firstName: { type: DataTypes.STRING, allowNull: false },
      lastName: { type: DataTypes.STRING, allowNull: false },
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
    Patient.belongsTo(db.Clinic, { foreignKey: 'clinicId' });
  };

  return Patient;
};
