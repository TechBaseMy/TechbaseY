const TestController = require("../controller/TestController");
const UtilController = require("../controller/UtilController");
const UserController = require("../controller/UserController");
const { PrivateRoute } = require("../lib/JWT");
const Constant = require("../util/Constant");
const MemberController = require("../controller/MemberController");
const SalesController = require("../controller/SalesController");
const ProductController = require("../controller/ProductController");
const LotController = require("../controller/LotController");
const AnnouncementController = require("../controller/AnnouncementController");
const WalletController = require("../controller/WalletController");
const SettingController = require("../controller/SettingController");

module.exports = function (app) {
  //#region USER CONTROLLER
  app.post("/login", UserController.Login);
  //#endregion

  //#region MEMBER CONTROLLER
  app.post("/forgetPassword", MemberController.ForgetPassword);
  app.post("/verifyForgetPassword", MemberController.VerifyForgetPassword);
  app.post("/forgetPasswordChange", MemberController.ForgetPasswordChange);
  app.post("/member/getMemberName", MemberController.GetMemberName);
  app.post("/member/insertMember", MemberController.InsertMember);
  app.post("/member/getMemberDetail",MemberController.GetMemberDetail);
  //#endregion

  //#region PRODUCT CONTROLLER
  app.post("/product/getProductList", ProductController.GetProductList);
  app.post("/product/getSimpleProductDetail", ProductController.GetSimpleProductDetail);
  app.get("/product/getValidProductCategoryList", ProductController.GetValidProductCategoryList);
  app.post("/product/getSingleProductCategory", ProductController.GetSingleProductCategory);
  //#endregion

  //#region UTIL CONTROLLER
  app.post("/util/getParameterValue", UtilController.GetParameterValue);
  app.get("/util/viewCountryList", UtilController.ViewCountryList);
  app.get("/util/viewStateList", UtilController.ViewStateList);
  app.post("/util/viewBankList", UtilController.ViewBankList);
  app.get("/util/getRegistrationFees", UtilController.GetRegistrationFees);
  app.get("/util/onlineStatusCheck", UtilController.OnlineStatusCheck);
  //#endregion

  //#region ANNOUNCEMENT CONTROLLER
  app.post("/announcement/getAnnouncementDetails", AnnouncementController.GetAnnouncementDetails);
  app.post("/announcement/getAnnouncementList", AnnouncementController.GetAnnouncementList);
  //#endregion

  //#region WALLET CONTROLLER
  app.post("/wallet/getMemberWalletBalance", WalletController.GetMemberWalletBalance);
  app.post("/wallet/getWalletBalanceList", WalletController.GetWalletBalanceList);
  app.post("/wallet/getWalletStatement", WalletController.GetWalletStatement);
  app.post("/wallet/getConvertWalletList", WalletController.GetConvertWalletList);
  app.post("/wallet/getWalletReloadList", WalletController.GetWalletReloadList);
  app.post("/wallet/getWalletWithdrawalList", WalletController.GetWalletWithdrawalList);
  app.post("/wallet/getWalletTransferList", WalletController.GetWalletTransferList);
  app.post("/wallet/convertWallet", WalletController.ConvertWallet);
  app.post("/wallet/reloadWallet", WalletController.ReloadWallet);
  app.post("/wallet/withdrawWallet", WalletController.WithdrawWallet);
  app.post("/wallet/transferWallet", WalletController.TransferWallet);
  //#endregion

  //#region SETTING CONTROLLER
  app.post("/wallet/getWalletConversionRate", SettingController.GetWalletConversionRate);
  //#endregion

  app.post("/test/test", TestController.encrypt);
  app.post("/test/test1", TestController.decrypt);
  app.get("/test/test2", TestController.test);
  app.post("/test/testQuery", UtilController.Execute);

  app.get("/test", PrivateRoute(), (req, res) => {
    res.send("Hello, World!");
  });
};
