const _ = require("lodash");
const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const QueryHandler = require("../lib/Query/QueryHandler");
const MemberService = require("../service/MemberService");
const SettingService = require("../service/SettingService");
const Log = require("../util/Log");
const Constants = require("../util/Constant");

class WalletService{
  static async getMemberWalletBalance(MemberID, WalletType){
    return (await QueryHandler.executeQuery('WG001', {MemberID, WalletType}))?.[0]?.Balance;
  }
  static async getOverallWalletBalanceList(body){
    const result = await QueryHandler.executeQuery('WG002', body);
    const totalCount = await QueryHandler.executeQuery('WG003', body);

    return { data: result, totalRows: totalCount[0].Total };
  }
  static async getWalletStatement(body){
    const result = await QueryHandler.executeQuery('WG004', body);
    const totalCount = await QueryHandler.executeQuery('WG005', body);

    return { data: result, totalRows: totalCount[0].Total };
  }
  static async getConvertWalletList(body){
    const result = await QueryHandler.executeQuery('WC006', body);
    const totalCount = await QueryHandler.executeQuery('WC007', body);

    return { data: result, totalRows: totalCount[0].Total };
  }
  static async getWalletReloadList(body){
    const result = await QueryHandler.executeQuery('WR003', body);
    const totalCount = await QueryHandler.executeQuery('WR004', body);

    return { data: result, totalRows: totalCount[0].Total };
  }
  static async getWalletWithdrawalList(body){
    const result = await QueryHandler.executeQuery('WW003', body);
    const totalCount = await QueryHandler.executeQuery('WW004', body);

    return { data: result, totalRows: totalCount[0].Total };
  }
  static async getWalletTransferList(body){
    const result = await QueryHandler.executeQuery('WT003', body);
    const totalCount = await QueryHandler.executeQuery('WT004', body);

    return { data: result, totalRows: totalCount[0].Total };
  }
  static async convertWallet(body, req, t=null){
    if (!(await MemberService.validateSecurityPin(body.MemberID, body.SecurityPin))){
      throw new Error("Invalid security pin!");
    }

    if (!(await SettingService.getSingleMemberWalletPermission(body.MemberID, body.FromWallet, Constants.walletMethodEnum.convert))){
      throw new Error("This member or this wallet type has no permission in performing wallet conversion.");
    }

    await QueryHandler.executeQuery('WC005', body, req, t);
  }
  static async reloadWallet(body, req, t=null){
    if (!(await MemberService.validateSecurityPin(body.MemberID, body.SecurityPin))){
      throw new Error("Invalid security pin!");
    }

    if (!(await SettingService.getSingleMemberWalletPermission(body.MemberID, body.WalletType, Constants.walletMethodEnum.topup))){
      throw new Error("This member or this wallet type has no permission in performing wallet reload.");
    }

    await QueryHandler.executeQuery('WR001', body, req, t);
  }
  static async withdrawWallet(body, req, t=null){
    if (!(await MemberService.validateSecurityPin(body.MemberID, body.SecurityPin))){
      throw new Error("Invalid security pin!");
    }

    if (!(await SettingService.getSingleMemberWalletPermission(body.MemberID, body.WalletType, Constants.walletMethodEnum.withdraw))){
      throw new Error("This member or this wallet type has no permission in performing wallet reload.");
    }

    if (body.Amount > (await this.getMemberWalletBalance(body.MemberID, body.WalletType))){
      throw new Error("Insufficient wallet balance!");
    }

    await QueryHandler.executeQuery('WW001', body, req, t);
  }
  static async transferWallet(body, req, t=null){
    if (!(await MemberService.validateSecurityPin(body.MemberID, body.SecurityPin))){
      throw new Error("Invalid security pin!");
    }

    if (!(await SettingService.getSingleMemberWalletPermission(body.MemberID, body.WalletType, Constants.walletMethodEnum.transfer))){
      throw new Error("This member or this wallet type has no permission in performing wallet reload.");
    }

    if (!(await MemberService.validateDownline(body.FromMember, body.ToMember))){
      throw new Error("Invalid transfer target. This member can only transfer to its downline.");
    }

    //FNC_CheckWalletBalance
    if (body.Amount > (await QueryHandler.executeQuery('WT001', body))?.[0]?.Balance){
      throw new Error("Insufficient wallet balance!");
    }

    await QueryHandler.executeQuery('WT002', body, req, t);
  }
  static async processWalletReloadRequest(body, req, t=null){
    await QueryHandler.executeQuery('WR002', body, req, t);
  }
  static async processWithdrawWalletRequest(body, req, t=null){
    await QueryHandler.executeQuery('WW002', body, req, t);
  }
}
module.exports = WalletService;