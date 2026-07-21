// CommonJS on purpose — sequelize-cli requires this file directly.
// See README, rule 1.
require('dotenv').config();

const base = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  dialect: 'postgres',
};

module.exports = { development: base, test: base, production: base };
