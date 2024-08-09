"use strict";
const captureError = require("../lib/ErrorHandler/CaptureError");
const Models = require("../models");
const { z } = require("zod");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const ZodCustomValidator = require("../util/ZodCustomValidator");
const Util = require("../util/Util");
const WalletService = require("../service/WalletService");
const MemberService = require("../service/MemberService");
const UtilService = require("../service/UtilService");

class WalletController{
  static async GetMemberWalletBalance(req, res){
    try {
      const body = req.body;
      const result = await WalletService.getMemberWalletBalance(body.MemberID, body.WalletType);

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
  static async GetWalletBalanceList(req, res){
    try {
      const body = req.body;
      const result = await WalletService.getOverallWalletBalanceList(body);

      res.status(200).send({
        Success: true,
        Data: result.data,
        Total: result.totalRows,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async GetWalletStatement(req, res){
    try {
      const body = req.body;
      const result = await WalletService.getWalletStatement(body);

      res.status(200).send({
        Success: true,
        Data: result.data,
        Total: result.totalRows,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async GetConvertWalletList(req, res){
    try {
      const body = req.body;
      const result = await WalletService.getConvertWalletList(body);

      res.status(200).send({
        Success: true,
        Data: result.data,
        Total: result.totalRows,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async GetWalletReloadList(req, res){
    try {
      const body = req.body;
      const result = await WalletService.getWalletReloadList(body);

      res.status(200).send({
        Success: true,
        Data: result.data,
        Total: result.totalRows,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async GetWalletWithdrawalList(req, res){
    try {
      const body = req.body;
      const result = await WalletService.getWalletWithdrawalList(body);

      res.status(200).send({
        Success: true,
        Data: result.data,
        Total: result.totalRows,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async GetWalletTransferList(req, res){
    try {
      const body = req.body;
      const result = await WalletService.getWalletTransferList(body);

      res.status(200).send({
        Success: true,
        Data: result.data,
        Total: result.totalRows,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async ConvertWallet(req, res){
    try {
      const body = req.body;

      await sequelize.transaction(async (transaction) => {
        await WalletService.convertWallet(body, req, transaction);
      });

      res.status(200).send({
        Success: true,
        Data: "Convert Wallet Action Successful!",
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async ReloadWallet(req, res){
    try {
      const body = req.body;

      await sequelize.transaction(async (transaction) => {
        await WalletService.reloadWallet(body, req, transaction);
      });

      res.status(200).send({
        Success: true,
        Data: "Reload Wallet Action Successful!",
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async WithdrawWallet(req, res){
    try {
      const body = req.body;

      await sequelize.transaction(async (transaction) => {
        await WalletService.withdrawWallet(body, req, transaction);
      });

      res.status(200).send({
        Success: true,
        Data: "Withdraw Wallet Action Successful!",
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async TransferWallet(req, res){
    try {
      const body = req.body;

      await sequelize.transaction(async (transaction) => {
        await WalletService.transferWallet(body, req, transaction);
      });

      res.status(200).send({
        Success: true,
        Data: "Transfer Wallet Action Successful!",
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async ProcessWalletReloadRequest(req, res){
    try {
      const body = req.body;

      await sequelize.transaction(async (transaction) => {
        await WalletService.processWalletReloadRequest(body, req, transaction);
      });

      const action = body.Status === 1 ? 'approved' : 'rejected';

      res.status(200).send({
        Success: true,
        Data: `Wallet Reload with ID of ${body.TempSalesID} is successfully ${action}!`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
  static async ProcessWithdrawWalletRequest(req, res){
    try {
      const body = req.body;

      await sequelize.transaction(async (transaction) => {
        await WalletService.processWithdrawWalletRequest(body, req, transaction);
      });

      const action = body.Status === 1 ? 'approved' : 'rejected';

      res.status(200).send({
        Success: true,
        Data: `Wallet Withdrawal with ID of ${body.TempSalesID} is successfully ${action}!`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
}
module.exports = WalletController;