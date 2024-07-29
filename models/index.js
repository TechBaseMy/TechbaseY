"use strict";
const { Sequelize, DataTypes } = require("sequelize");
const path = require("path");
const process = require("process");
const basename = path.basename(__filename);
const env = process.env.NODE_ENV || "development";
const config = require(__dirname + "/../config/config.json")[env];
const db = {};
const fs = require("fs");
const { encrypt, decrypt } = require("../lib/Encryptor");

let sequelize;
if (config.use_env_variable) {
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  sequelize = new Sequelize(decrypt(config.database), decrypt(config.username), decrypt(config.password), {
    host: decrypt(config.host),
    port: decrypt(config.port),
    dialect: decrypt(config.dialect),
    dialectOptions: {
      options: {
        database: decrypt(config.database),
        trustServerCertificate: true,
        encrypt: false,
      },
    },
  });
}

console.log("Decrypted Config Values:");
for (const key in config) {
  if (config.hasOwnProperty(key)) {
    if (key != "key") {
      try {
        console.log(`"${key}": "${decrypt(config[key])}",`);
      } catch (error) {
        console.log(`"${key}": "${config[key]}",`);
      }
    }
  }
}

const modelsDir = path.join(__dirname, "../models/");

fs.readdirSync(modelsDir)
  .filter((file) => {
    return file.indexOf(".") !== 0 && file !== basename && file.slice(-3) === ".js" && file.indexOf(".test.js") === -1;
  })
  .forEach((file) => {
    const model = require(path.join(modelsDir, file))(sequelize);

    console.log(`Model ${model.name} imported successfully.`);
    db[model.name] = model;
  });

Object.keys(db).forEach((modelName) => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;
async function testConnection() {
  try {
    await sequelize.authenticate();
    console.log("Connection has been established successfully.");
  } catch (error) {
    console.error("Unable to connect to the database:", error);
  } finally {
    // Close the connection when done (optional)
    await sequelize.close();
  }
}
// testConnection();
// module.exports = {db, testConnection};
module.exports = db;
