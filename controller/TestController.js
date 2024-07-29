const { validateMonoEndpoint, decryptMono, encrypt, decrypt } = require("../lib/Encryptor");
const Models = require("../models");
const { z, ZodError } = require("zod");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const jwt = require("jsonwebtoken");
const Constant = require("../util/Constant");
const Redis = require("../lib/Redis");
const OSS = require("../lib/OSS");
const util = require("../util/Util");
const QueryHandler = require("../lib/Query/QueryHandler");

const testSchema = z.object({
  base64: z.string(),
  string2: z.string().optional(),
});

class TestController {
  static async test(req, res) {
    const status = await validateMonoEndpoint();
    if (status) {
      let query = `
      SELECT * FROM tbl_login WITH (NOLOCK)
      `;
      let result = await sequelize.query(query, {
        replacements: {},
        type: Sequelize.QueryTypes.SELECT,
        raw: true,
      });
      const t = await sequelize.transaction();

      for (const data of result) {
        const password = await decryptMono(data.LoginPassword);
        const secPassword = data.SecurityPin == null ? null : await decryptMono(data.SecurityPin);
        const encryptPass = await encrypt(password);
        const encryptSecPass = data.SecurityPin == null ? null : await encrypt(secPassword);
        query = `
        UPDATE tbl_login SET loginPassword = :password, SecurityPin = :sec_password WHERE id = :id
        `;
        await sequelize.query(query, {
          replacements: {
            password: encryptPass,
            sec_password: encryptSecPass,
            id: data.ID,
          },
          type: Sequelize.QueryTypes.UPDATE,
          transaction: t,
          raw: true,
        });
      }
      await t.commit();
    }
    res.status(200).send({
      Success: true,
    });
  }

  static async test1(req, res) {
    // await Redis.setObj("test", {status: true, data: "test daniel"});
    const body = testSchema.parse(req.body);
    let target = "test/" + body.string2 + (await OSS.getFileExtensionFromBase64(body.base64));
    await OSS.uploadObject(target, body.base64, req);

    res.status(200).send({
      Success: true,
      // Data: token
    });
  }
  static async test2(req, res) {
    await Redis.setObj("test", { status: true, data: util.generateRandomString(30) });

    const result = await Redis.getObj("test");

    res.status(200).send({
      Success: true,
      Data: result,
    });
  }

  static async testGetFoldersAndFiles(req, res) {
    try {
      const body = testSchema.parse(req.body);
      const result = await OSS.listDirectoryContents(body.base64);

      res.status(200).send({
        Success: true,
        Data: result,
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).send({
        Success: false,
        Error: error.message,
      });
    }
  }

  static async testDeleteFolder(req, res) {
    try {
      const { base64 } = req.body;
      let isSuccess = await OSS.deleteFolder(base64, req);

      res.status(200).send({
        Success: isSuccess,
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).send({
        Success: false,
        Error: error.message,
      });
    }
  }

  static async test12345(req, res) {
    try {
      // const body = { queryID: "1", memberID: "000001" };
      const body = { queryID: "3", loginRole: "C" };
      // const body = { queryID: "3" };

      const { queryID, ...parameters } = body;
      let isSuccess = await QueryHandler.executeQuery(queryID, parameters);

      res.status(200).send({
        Success: isSuccess,
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).send({
        Success: false,
        Error: error.message,
      });
    }
  }

  static async encryptObject(obj) {
    const result = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === "string") {
          try {
            result[key] = encrypt(value);
          } catch (error) {
            result[key] = value; // If encryption fails, keep original value
          }
        } else if (typeof value === "object" && value !== null) {
          result[key] = await TestController.encryptObject(value); // Recursive call for nested objects
        } else {
          result[key] = value; // Keep non-string and non-object values as they are
        }
      }
    }
    return result;
  }
  static async decryptObject(obj) {
    const result = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        if (typeof value === "string") {
          try {
            result[key] = decrypt(value);
          } catch (error) {
            result[key] = value; // If decryption fails, keep original value
          }
        } else if (typeof value === "object" && value !== null) {
          result[key] = await TestController.decryptObject(value); // Recursive call for nested objects
        } else {
          result[key] = value; // Keep non-string and non-object values as they are
        }
      }
    }
    return result;
  }

  static async encrypt(req, res) {
    try {
      const body = req.body;
      let result = await TestController.encryptObject(body);

      res.status(200).send({
        Data: result,
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).send({
        Success: false,
        Error: error.message,
      });
    }
  }

  static async decrypt(req, res) {
    try {
      const body = req.body;
      let result = await TestController.decryptObject(body);

      res.status(200).send({
        Data: result,
      });
    } catch (error) {
      console.error("Error:", error);
      res.status(500).send({
        Success: false,
        Error: error.message,
      });
    }
  }
}

module.exports = TestController;
