"use strict";
const captureError = require("../lib/ErrorHandler/CaptureError");
const Models = require("../models");
const { z } = require("zod");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const ZodCustomValidator = require("../util/ZodCustomValidator");
const Util = require("../util/Util");
const SettingService = require("../service/SettingService");
const MemberService = require("../service/MemberService");
const UtilService = require("../service/UtilService");

class SettingController{
  static async GetAllWalletPermissionList(req, res){
    try {
      const result = await SettingService.getAllWalletPermissionList();

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
  static async GetMemberLockedWalletPermission(req, res){
    try {
      const body = req.body;
      const result = await SettingService.getMemberLockedWalletPermission(body.MemberID);

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
  static async GetWalletConversionRate(req, res){
    try {
      const body = req.body;
      const result = await SettingService.getWalletConversionRate(body.FromWallet, body.ToWallet);

      res.status(200).send({
        Success: true,
        Data: {Rate: result},
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async GetWalletConversionRateList(req, res){
    try {
      const result = await SettingService.getWalletConversionRateList();

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
  static async UpdateWalletMethodPermission(req, res){
    try {
      const body = req.body;

      await sequelize.transaction(async (transaction) => {
        await SettingService.updateWalletMethodPermission(body, req, transaction);
      });

      res.status(200).send({
        Success: true,
        Data: "Update Successful!",
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async UpdateMemberWalletMethodPermission(req, res){
    try {
      const body = req.body;

      await sequelize.transaction(async (transaction) => {
        await SettingService.updateMemberWalletMethodPermission(body, req, transaction);
      });

      res.status(200).send({
        Success: true,
        Data: "Update Successful!",
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async UpdateSingleWalletConversionRate(req, res){
    try {
      const body = req.body;

      await sequelize.transaction(async (transaction) => {
        await SettingService.updateSingleWalletConversionRate(body, req, transaction);
      });

      res.status(200).send({
        Success: true,
        Data: "Update Successful!",
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
}
module.exports = SettingController;