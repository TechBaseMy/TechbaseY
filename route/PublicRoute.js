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
  //#endregion

  //#region PRODUCT CONTROLLER

  app.post("/product/getProductList", ProductController.getProductList);
  app.post("/product/getProductDetail", ProductController.getProductDetail);
  //#endregion

  //#region UTIL CONTROLLER
  app.post("/util/getParameterValue", UtilController.GetParameterValue);
  app.get("/util/viewCountryList", UtilController.ViewCountryList);
  app.get("/util/viewStateList", UtilController.ViewStateList);
  app.get("/util/viewBankList", UtilController.ViewBankList);
  app.get("/util/getRegistrationFees", UtilController.GetRegistrationFees);
  app.get("/util/onlineStatusCheck", UtilController.OnlineStatusCheck);
  //#endregion

  //#region ANNOUNCEMENT CONTROLLER
  app.post("/announcement/getAnnouncementDetails", AnnouncementController.GetAnnouncementDetails);
  app.post("/announcement/getAnnouncementList", AnnouncementController.GetAnnouncementList);
  //#endregion

  app.post("/test/test", TestController.encrypt);
  app.post("/test/test1", TestController.decrypt);
  app.get("/test/test2", TestController.test);
  app.post("/test/testQuery", UtilController.Execute);

  app.get("/test", PrivateRoute(), (req, res) => {
    res.send("Hello, World!");
  });
};
