'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    /**
     * Add altering commands here.
     *
     * Example:
     * await queryInterface.createTable('users', { id: Sequelize.INTEGER });
     */
    await queryInterface.createTable('clinics', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUID4, primaryKey: true },
      name: { type: Sequelize.STRING, allowNull: false },
      address: { type: Sequelize.STRING, allowNull: false },
      email: { type: Sequelize.STRING, allowNull: false, unique: true },
      password: { type: Sequelize.STRING, allowNull: false },
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updateAt: { type: Sequelize.DATE, allowNull: false },
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('users');

  }
};
