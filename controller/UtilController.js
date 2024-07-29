const ZodCustomValidator = require("../util/ZodCustomValidator");
const { z } = require("zod");
const Models = require("../models");
const UtilService = require("../service/UtilService");
const captureError = require("../lib/ErrorHandler/CaptureError");
const QueryHandler = require("../lib/Query/QueryHandler");
const { encrypt } = require("../lib/Encryptor");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;

const getParameterValueSchema = ZodCustomValidator.customRefine(
  z.object({
    category: z.enum([
      "Marriage",
      "MemberStatus",
      "Role",
      "IdentityType",
      "PaymentType",
      "SalesType",
      "PaymentPurpose",
      "ProductType",
    ]),
  })
);
class UtilController {
  static async Execute(req, res) {
    try {
      req.body.Password = req.body?.Password != null ? encrypt(req.body?.Password) : null;
      let result = await QueryHandler.executeQuery(req.body.queryID, req.body);
      res.status(200).send({
        Success: result != null,
        Data: result == null ? "Invalid" : result,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async OnlineStatusCheck(req, res) {
    const query = `
    SELECT TOP 1 * FROM tbl_Parameter WITH (NOLOCK) WHERE Category = 'OnlineStatus'
  `;
    const result = await sequelize.query(query, {
      replacements: {},
      type: Sequelize.QueryTypes.SELECT,
    });

    res.status(200).send({
      Success: true,
      Data: {
        OnlineStatus: result[0]?.ParameterValue === "1" ? "Online" : "Offline",
        OnlineStatusCode: result[0]?.ParameterValue,
      },
    });
  }

  static async ViewCountryList(req, res) {
    try {
      let query = `
        SELECT ID, [dbo].[InitCap](Country_Name) AS Country_Name, Country_Status, Country_MobileCode AS 'MobileCode', ISO_Alpha_2, ISO_Alpha_3, Currency_Code, Currency_Name, AllowRegister
        FROM tbl_Country WITH (NOLOCK)
        WHERE IsDeleted = 0;
      `;
      let result = await sequelize.query(query, {
        replacements: {},
        type: Sequelize.QueryTypes.SELECT,
      });
      res.status(200).send({
        Success: true,
        Data: result,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async ViewStateList(req, res) {
    try {
      let query = `
        SELECT ID, [dbo].[InitCap](State_Name) AS State_Name, State_Country, State_Status, IsEastMalaysia
        FROM tbl_State WITH (NOLOCK)
        WHERE IsDeleted = 0 AND State_Status = 1
      `;
      let result = await sequelize.query(query, {
        replacements: {},
        type: Sequelize.QueryTypes.SELECT,
      });
      res.status(200).send({
        Success: true,
        Data: result,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async ViewBankList(req, res) {
    try {
      let query = `
        SELECT * FROM tbl_banks WITH (NOLOCK) WHERE countryBind = 127
      `;
      let result = await sequelize.query(query, {
        replacements: {},
        type: Sequelize.QueryTypes.SELECT,
      });
      res.status(200).send({
        Success: true,
        Data: result,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async GetRegistrationFees(req, res) {
    try {
      let query =
        "SELECT TOP 1 Price FROM tbl_Product WITH (NOLOCK) WHERE ProductCategoryID = '10005'AND IsDeleted = 0";
      let result = await sequelize.query(query, {
        replacements: {},
        type: Sequelize.QueryTypes.SELECT,
      });
      res.status(200).send({
        Success: true,
        Data: result,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async GetParameterValue(req, res) {
    try {
      const body = await getParameterValueSchema.parseAsync(req.body);
      const result = await UtilService.getParameterValue(body.category);

      res.status(200).send({
        Success: true,
        Data: result,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
}
module.exports = UtilController;
