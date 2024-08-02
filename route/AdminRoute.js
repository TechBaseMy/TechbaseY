const TestController = require("../controller/TestController");
const UtilController = require("../controller/UtilController");
const UserController = require("../controller/UserController");
const { PrivateRoute } = require("../lib/JWT");
const Constant = require("../util/Constant");
const MemberController = require("../controller/MemberController");
const SalesController = require("../controller/SalesController");
const ProductController = require("../controller/ProductController");
const LotController = require("../controller/LotController");
const FormController = require("../controller/FormController");
const AnnouncementController = require("../controller/AnnouncementController");

module.exports = function (app) {
  //#region SALES CONTROLLER
  // app.post("/sales/insertSales", PrivateRoute([Constant.role_admin, Constant.role_agent]), SalesController.InsertSales);
  // app.post(
  //   "/sales/insertInstallmentPayment",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   SalesController.InsertInstallmentPayment
  // );
  // app.post(
  //   "/sales/insertRefund",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   SalesController.InsertRefund
  // );
  // app.post("/sales/approveRejectSales", PrivateRoute(Constant.role_admin), SalesController.ApproveRejectSales);
  // app.post("/sales/approveRejectInstallment", PrivateRoute(Constant.role_admin), SalesController.ApproveRejectInstallment);
  // app.post("/sales/validateIsFirstSales", PrivateRoute(Constant.role_admin), SalesController.ValidateIsFirstSales);
  // app.post(
  //   "/sales/getPendingPaymentList",
  //   PrivateRoute(Constant.role_admin),
  //   SalesController.GetPendingPaymentApprovalList
  // );
  // app.post(
  //   "/sales/getPendingInstallmentPaymentList",
  //   PrivateRoute(Constant.role_admin),
  //   SalesController.GetPendingInstallmentPaymentList
  // );
  // app.post("/sales/getTransactionHistory", PrivateRoute([Constant.role_admin, Constant.role_agent]), SalesController.GetTransactionHistory);
  // app.post("/sales/getPaymentList",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   SalesController.GetPaymentList);
  // app.post("/sales/reuploadPaymentReceipt", PrivateRoute(Constant.role_admin), SalesController.ReuploadPaymentReceipt);
  // app.post(
  //   "/sales/getOrderDetails",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   SalesController.GetOrderDetails
  // );
  // app.post(
  //   "/sales/getOrderList",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   SalesController.GetOrderList
  // );
  // app.post(
  //   "/sales/addAuthorizedRepresentative",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   SalesController.AddAuthorizedRepresentative
  // );
  // app.post(
  //   "/sales/cancelBookingSales",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   SalesController.CancelBookingSales
  // );
  //#endregion
  //#region MEMBER CONTROLLER
  // app.post("/member/viewMemberList", PrivateRoute(Constant.role_admin), MemberController.ViewMemberList);
  // app.post("/member/toggleMemberKYC", PrivateRoute(Constant.role_admin), MemberController.ToggleMemberKYC);
  // app.post(
  //   "/changePassword",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   MemberController.ChangePassword
  // );
  // app.post(
  //   "/member/getMemberDetail",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   MemberController.GetMemberDetail
  // );
  // app.post("/member/getMemberName", MemberController.GetMemberName);
  // app.post(
  //   "/member/getPendingApprovalMemberList",
  //   PrivateRoute(Constant.role_admin),
  //   MemberController.GetPendingApprovalMemberList
  // );
  // app.post(
  //   "/member/getMemberUploadedKYCDocument",
  //   PrivateRoute(Constant.role_admin),
  //   MemberController.GetMemberUploadedKYCDocument
  // );
  // app.post(
  //   "/member/SponsorTree",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   MemberController.GetSponsorTree
  // );
  //#endregion
  //#region PRODUCT CONTROLLER
  app.post("/product/createProduct",
    //PrivateRoute(Constant.role_admin), 
    ProductController.createProduct
  );
  app.post("/product/createNewProductCategory",
    //PrivateRoute(Constant.role_admin),
    ProductController.CreateNewProductCategory
  );
  app.post("/product/getFullProductDetail",
    //PrivateRoute(Constant.role_admin),
    ProductController.GetFullProductDetail
  );
  app.get("/product/getFullProductCategoryList",
    //PrivateRoute(Constant.role_admin),
    ProductController.GetFullProductCategoryList
  );
  app.post("/product/updateProductBasic", 
    //PrivateRoute(Constant.role_admin), 
    ProductController.UpdateProductBasic
  );
  app.post("/product/updateProductDisplay", 
    //PrivateRoute(Constant.role_admin), 
    ProductController.UpdateProductDisplay
  );
  app.post("/product/updateProductImage", 
    //PrivateRoute(Constant.role_admin), 
    ProductController.UpdateProductImage
  );
  app.post("/product/updateProductPricingByProductCode",
    //PrivateRoute(Constant.role_admin),
    ProductController.UpdateProductPricingByProductCode
  );
  app.post("/product/updateProductPricingForCertainCountry",
    //PrivateRoute(Constant.role_admin),
    ProductController.UpdateProductPricingForCertainCountry
  );
  app.post("/product/updateProductCategory",
    //PrivateRoute(Constant.role_admin),
    ProductController.UpdateProductCategory
  );
  //#endregion
  //#region LOT CONTROLLER
  // app.post(
  //   "/lot/assignIntendedUserToUnit",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   LotController.AssignIntendedUserToUnit
  // );
  // app.post(
  //   "/lot/uploadDeathCert",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   LotController.UploadDeathCertificateForLotIntendedUser
  // );
  // app.post(
  //   "/lot/checkInIntendedUserToUnit",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   LotController.CheckInIntendedUserToUnit
  // );
  // app.post(
  //   "/lot/removeIntendedUserToUnit",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   LotController.RemoveIntendedUserToUnit
  // );
  // app.post("/lot/getLotDetails", PrivateRoute([Constant.role_admin, Constant.role_agent]), LotController.GetLotDetails);
  // app.post("/lot/editLotDetails", PrivateRoute(Constant.role_admin), LotController.EditLotDetails);
  // app.post(
  //   "/lot/getLotBatchWithCondition",
  //   PrivateRoute([Constant.role_admin, Constant.role_agent]),
  //   LotController.GetLotBatchWithCondition
  // );
  // app.post(
  //   "/lot/batchEditLotDetailsSimple",
  //   PrivateRoute(Constant.role_admin),
  //   LotController.BatchEditLotDetailsSimple
  // );
  //#endregion
  //#region FORM CONTROLLER
  // app.post("/form/getAddendum", PrivateRoute(Constant.role_admin), FormController.GetAddendum);
  // app.post("/form/getPurchaseOrder", PrivateRoute(Constant.role_admin), FormController.GetPurchaseOrder);
  // app.post("/form/getMiscellaneousInvoice", PrivateRoute(Constant.role_admin), FormController.GetMiscellaneousInvoice);
  //#endregion
  //#region ANNOUNCEMENT CONTROLLER
  // app.post("/announcement/addAnnouncement", PrivateRoute(Constant.role_admin), AnnouncementController.AddAnnouncement);
  // app.post(
  //   "/announcement/editAnnouncement",
  //   PrivateRoute(Constant.role_admin),
  //   AnnouncementController.EditAnnouncement
  // );
  // app.post(
  //   "/announcement/deleteAnnouncement",
  //   PrivateRoute(Constant.role_admin),
  //   AnnouncementController.DeleteAnnouncement
  // );
  //#endregion
};
