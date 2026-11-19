const { pool, withTransaction } = require("./connection");
const { initDB } = require("./schema");
const userRepository = require("./repositories/userRepository");
const fileRepository = require("./repositories/fileRepository");
const folderRepository = require("./repositories/folderRepository");
const shareRepository = require("./repositories/shareRepository");
const settingsRepository = require("./repositories/settingsRepository");
const loginAttemptRepository = require("./repositories/loginAttemptRepository");

module.exports = {
  pool,
  withTransaction,
  initDB,
  userRepository,
  fileRepository,
  folderRepository,
  shareRepository,
  settingsRepository,
  loginAttemptRepository,
};
