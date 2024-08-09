const util = require("../util/Util");

class Constants {
  static salesStatusPendingPayment = "PU";
  static salesStatusPacking = "PIP";
  static salesStatusPending = "P";
  static salesStatusCompleted = "C";
  static key = util.generateRandomString(20);
  static role_admin = "Admin";
  static role_member = "Member";
  static admin_code = ["AD", "SA"];
  static token_expiry_seconds = 3600;
  static token_refresh_within_seconds = 1800;
  static proj_name = "TechbaseY";
  static reset_pass_token_expiry_seconds = 600;
  static currentUrl = null;
  static timeZone = "Asia/Kuala_Lumpur";
  static walletMethodEnum = Object.freeze({
    convert: 1,
    purchase: 2,
    redemption: 3,
    topup: 4,
    transfer: 5,
    withdraw: 6
  });

  static setCurrentUrl(url) {
    this.currentUrl = url;
  }
}

module.exports = Constants;
