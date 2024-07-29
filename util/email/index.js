const nodemailer = require("nodemailer");
const config = require("../../config/config.json")["smtp"];
const { decrypt } = require("../../lib/Encryptor");

const smtp = nodemailer.createTransport({
  host: decrypt(config.server),
  port: config.port,
  secure: config.enableSSL,
  auth: {
    user: decrypt(config.username),
    pass: decrypt(config.password),
  },
});

module.exports = smtp;
