"use strict";
const captureError = require("../lib/ErrorHandler/CaptureError");
const Models = require("../models");
const { z } = require("zod");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const ZodCustomValidator = require("../util/ZodCustomValidator");
const FormService = require("../service/FormService");
const SalesService = require("../service/SalesService");
const fs = require("fs");
const puppeteer = require("puppeteer");

const getAddendumSchema = z.object({
  salesID: z.string().refine(
    async (data) => {
      const result = await SalesService.getSalesBySalesID(data);
      if (result.length > 0) {
        if (result[0].SalesType === "2") {
          return true;
        }
      }
      return false;
    },
    { message: "Sales ID does not exists or not valid." }
  ),
});

const getMiscellaneousInvoiceSchema = z.object({
  salesID: z.string().refine(
    async (data) => {
      const result = await SalesService.getSalesBySalesID(data);
      if (result.length > 0) {
        if (result[0].SalesType === "5") {
          return true;
        }
      }
      return false;
    },
    { message: "Sales ID does not exists or not valid." }
  ),
});

class FormController {
  static async GetAddendum(req, res) {
    try {
      const body = await getAddendumSchema.parseAsync(req.body);
      const result = await FormService.getAddendum(body);

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

  static async GetPurchaseOrder(req, res) {
    try {
      const body = await getAddendumSchema.parseAsync(req.body);
      const result = await FormService.getPO(body);
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

  static async GetMiscellaneousInvoice(req, res) {
    try {
      const body = await getMiscellaneousInvoiceSchema.parseAsync(req.body);
      const result = await FormService.getMiscellaneousInvoice(body);
      res.status(200).send({
        Success: true,
        Data: result[0],
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
}
module.exports = FormController;
