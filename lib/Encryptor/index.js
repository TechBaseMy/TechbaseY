const crypto = require("crypto");
const env = process.env.NODE_ENV || "development";
const config = require("../../config/config.json");
const configMono = require("../../config/config.json")[env];
const secretKey = config.key; // Replace with your own secret key
const axios = require("axios");

function encrypt(text) {
  const cipher = crypto.createCipher("aes-256-cbc", secretKey);
  let encrypted = cipher.update(text, "utf-8", "base64");
  encrypted += cipher.final("base64");
  return encrypted;
}

function decrypt(encryptedText) {
  const decipher = crypto.createDecipher("aes-256-cbc", secretKey);
  let decrypted = decipher.update(encryptedText, "base64", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

function encryptMD5(text, useHashing) {
  const key = Buffer.from(secretKey, "ascii");

  let buffer;
  let bytes = Buffer.from(text, "ascii");

  if (useHashing) {
    const md5 = crypto.createHash("md5");
    md5.update(key);
    buffer = md5.digest();
  } else {
    buffer = key;
  }
  const adjustedKey = Buffer.alloc(24);
  buffer.copy(adjustedKey, 0, 0, Math.min(buffer.length, 24));

  const cipher = crypto.createCipheriv("des-ede3-ecb", adjustedKey, Buffer.alloc(0));
  cipher.setAutoPadding(true);

  let encrypted = cipher.update(bytes, "utf8", "base64");
  encrypted += cipher.final("base64");

  return encrypted;
}

async function validateMonoEndpoint() {
  try {
    const response = await axios.get(configMono.monoEndpoint);
    return response.status === 200 ? true : false;
  } catch (error) {
    return false;
  }
}
async function encryptMono(password) {
  const requestData = { input: password, type: true };
  const response = await axios.post(
    // decrypt(config.monoEndpoint) + "Support/PasswordEncryption.aspx",
    configMono.monoEndpoint + "Support/PasswordEncryption.aspx",
    requestData
  );
  return response.data.result;
}

async function decryptMono(password) {
  const requestData = { input: password, type: false };
  const response = await axios.post(
    // decrypt(config.monoEndpoint) + "Support/PasswordEncryption.aspx",
    configMono.monoEndpoint + "api/Token/Decrypt",
    requestData
  );
  return response.data.RESULT;
}

module.exports = {
  encrypt,
  decrypt,
  encryptMD5,
  validateMonoEndpoint,
  encryptMono,
  decryptMono,
};
