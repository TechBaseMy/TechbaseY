"use strict";
const captureError = require("../lib/ErrorHandler/CaptureError");
const Models = require("../models");
const { z } = require("zod");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const ZodCustomValidator = require("../util/ZodCustomValidator");
const Util = require("../util/Util");
const { ValidateUser } = require("../lib/JWT");

const loginSchema = ZodCustomValidator.customRefine(
  z.object({
    username: z.string(),
    password: z.string(),
  })
);

const changePasswordSchema = ZodCustomValidator.customRefine(
  z.object({
    username: z.string(),
    password: z.string(),
  })
);
class UserController {
  static async Login(req, res) {
    try {
      const mainResult = await ValidateUser(req.body);
      res.status(200).send({
        Success: mainResult != null,
        Data: mainResult == null ? "Invalid Login" : mainResult,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
}
module.exports = UserController;
