const _ = require("lodash");
const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const QueryHandler = require("../lib/Query/QueryHandler");
const Log = require("../util/Log");

class SettingService{
  static async getAllWalletPermissionList(){
    return (await QueryHandler.executeQuery('WP001', [])).reduce((acc, current) => {
      const existingWalletType = acc.find(item => item.WalletType === current.WalletType);
      if (existingWalletType) {
          existingWalletType.AllowMethod.push(current.AllowMethod);
      } else {
          acc.push({
              WalletType: current.WalletType,
              AllowMethod: [current.AllowMethod]
          });
      }
      return acc;
    }, []);
  }
  static async getMemberLockedWalletPermission(MemberID){
    return (await QueryHandler.executeQuery('WP002', {MemberID})).reduce((acc, current) => {
      const existingWalletType = acc.find(item => item.WalletType === current.WalletType);
      if (existingWalletType) {
          existingWalletType.LockMethod.push(current.LockMethod);
      } else {
          acc.push({
              WalletType: current.WalletType,
              LockMethod: [current.LockMethod]
          });
      }
      return acc;
    }, []);
  }
  static async getSingleMemberWalletPermission(MemberID, WalletType, WalletMethod){
    return (await QueryHandler.executeQuery('WP003', {MemberID, WalletType, WalletMethod}))?.[0]?.Result === 1;
  }
  static async getWalletConversionRate(FromWallet, ToWallet){
    return (await QueryHandler.executeQuery('WC001', {FromWallet, ToWallet}))?.[0]?.Rate;
  }
  static async getWalletConversionRateList(){
    return (await QueryHandler.executeQuery('WC002', []));
  }
  static async updateWalletMethodPermission(body, req, t = null){
    await QueryHandler.executeQuery('WP004', body, req, t);

    if (body.WalletMethod != null && body.WalletMethod.length > 0){
      for (const method of body.WalletMethod){
        await QueryHandler.executeQuery('WP005', {
          WalletType: body.WalletType,
          WalletMethod: method,
          CreatedBy: body.CreatedBy,
        }, req, t);
      }
    }
  }
  static async updateMemberWalletMethodPermission(body, req, t=null){
    await QueryHandler.executeQuery('WP006', body, req, t);

    if (body.WalletMethod != null && body.WalletMethod.length > 0){
      for (const method of body.WalletMethod){
        await QueryHandler.executeQuery('WP007', {
          WalletType: body.WalletType,
          MemberID: body.MemberID,
          WalletMethod: method,
          CreatedBy: body.CreatedBy,
        }, req, t);
      }
    }
  }
  static async updateSingleWalletConversionRate(body, req, t=null){
    await QueryHandler.executeQuery('WC003', body, req, t);
    await QueryHandler.executeQuery('WC004', body, req, t);
  }
}
module.exports = SettingService;