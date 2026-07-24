'use strict';

// Corrective migration. 20260723175159-clinic-migration.cjs created the column
// as `updateAt` (missing the 'd'), but Sequelize's timestamps write `updatedAt`,
// so every model-level write to Clinic — including POST /auth/clinic/signup —
// fails on the missing column.
//
// Fixed forward with a rename rather than by editing the original migration:
// that file has already run, so correcting its createTable would leave anyone
// who runs from scratch with `updatedAt` and nothing for this rename to find.

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    await queryInterface.renameColumn('clinics', 'updateAt', 'updatedAt');
  },

  async down(queryInterface) {
    await queryInterface.renameColumn('clinics', 'updatedAt', 'updateAt');
  },
};
