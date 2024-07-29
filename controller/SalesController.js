"use strict";
const captureError = require("../lib/ErrorHandler/CaptureError");
const Models = require("../models");
const { z, optional } = require("zod");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const ZodCustomValidator = require("../util/ZodCustomValidator");
const Util = require("../util/Util");
const { ValidateUser } = require("../lib/JWT");
const SalesService = require("../service/SalesService");
const MemberService = require("../service/MemberService");
const ProductService = require("../service/ProductService");
const { encrypt } = require("../lib/Encryptor");
const UtilService = require("../service/UtilService");
const { addDays } = require("date-fns");
const { format } = require("date-fns-tz");
const moment = require("moment-timezone");

const approveRejectSalesSchema = ZodCustomValidator.customRefine(
  z
    .object({
      salesID: z.string().refine(
        async (data) => {
          return !(await SalesService.validateSalesID(data));
        },
        { message: "Sales ID does not exists." }
      ),
      rejectedReason: z.string().optional(),
      isApproved: z.boolean(),
      memberID: z.string().optional(),
      agentID: z.string().optional(),
      isFirstSales: z.boolean().optional(),
    })
    .transform(async (data) => {
      data.isFirstSales = (await SalesService.validateIsFirstSales(data.salesID)).isFirstSales;
      return data;
    })
)
  .refine(
    (data) => {
      return !data.isApproved ? data.rejectedReason != null : true;
    },
    {
      message: "Rejected Reason cannot be Empty when a Sales is to be Rejected.",
    }
  )
  .refine(
    (data) => {
      return data.isFirstSales ? (data.isApproved ? data.agentID != null : true) : true;
    },
    {
      message: "Agent ID cannot be Empty if a Sales that is to be Approved is the First Sales of Agent.",
    }
  );

const insertInstallmentPaymentSchema = ZodCustomValidator.customRefine(
  z.object({
    salesID: z.string().refine(
      async (data) => {
        return !(await SalesService.checkIfSalesIsEligibleForInstallment(data));
      },
      { message: "Invalid Unit or FSP Sales or downpayment not yet approved, therefore not eligible for installment." }
    ),
    memberID: z.string().optional(),
    paymentType: z.string().refine(
      async (data) => {
        const parameterList = await UtilService.getParameterValue("PaymentType");
        return parameterList.map((parameter) => parameter.ParameterValue).includes(data);
      },
      {
        message: "Invalid Payment Type",
      }
    ), // [5] Cash, [2] Cash Wallet, [66] Cheque, [7] Card Payment, [88] iPay88, [100] Online Payment, [6] Redemption Wallet, [4] Voucher, [1] Wallet
    totalPrice: z.number(),
    paymentPurpose: z
      .string()
      .optional()
      .transform(async () => "2"),
    status: z
      .string()
      .optional()
      .transform(async () => "P"),
    fullname: z.string().optional(),
    contactNo: z.string().optional(),
    remarks: z.string().optional(),
    receipt: z.string().optional(),
  })
)
.refine(
  async (data) => {
    if (data.paymentType == "100") {
      return data?.receipt != null;
    }
    return true;
  },
  { message: "Receipt Cannot be Empty Online Transfer Payment." }
)
.transform(async (data) => {
  data.memberID = (await SalesService.getSalesBySalesID(data.salesID))[0].MemberId;
  return data;
});

const pendingInstallmentFilterSchema = ZodCustomValidator.customRefine(
  z.object({
    agentID: z.string().optional(),
    salesID: z.string().optional(),
    transactionID: z.string().optional(),
    purchaserID: z.string().optional(),
    lotNo: z.string().optional(),
    salesType: z.number().optional().default(0),
    dateFrom: z
    .string()
    .optional()
    .refine(
      (str) => {
        if (str != null && str !== ""){
          try {
            const date = new Date(str);
            return !isNaN(date.getTime());
          } catch (error) {
              return false;
          }
        }
        else {
          return true
        }
      },
      {
        message: "Invalid date format on dateTo",
      }
    )
    .transform(
      (str) => {
        if (str != null && str !== ""){
          let date = moment.tz(str, "Asia/Kuala_Lumpur").toDate();
          date = format(date, "yyyy-MM-dd 00:00:00.000");
          return date;
        }
        else {
          return str;
        }
    }),
    dateTo: z
    .string()
    .optional()
    .refine(
      (str) => {
        if (str != null && str !== ""){
          try {
            const date = new Date(str);
            return !isNaN(date.getTime());
          } catch (error) {
              return false;
          }
        }
        else {
          return true
        }
      },
      {
        message: "Invalid date format on dateTo",
      }
    )
    .transform(
      (str) => {
        if (str != null && str !== ""){
          let date = moment.tz(str, "Asia/Kuala_Lumpur").toDate();
          date = format(date, "yyyy-MM-dd 23:59:59.997");
          return date;
        }
        else {
          return str;
        }
    }),
    pageNumber: z.number().positive(),
    pageSize: z.number().positive(),
  })
);

const approveRejectInstallmentSchema = ZodCustomValidator.customRefine(
  z.object({
    salesID: z.string().refine(
      async (data) => {
        return !(await SalesService.checkIfSalesIsEligibleForInstallment(data));
      },
      { message: "Invalid sales ID for installment payment." }
    ),
    transactionID: z.string(),
    isApproved: z.boolean(),
    createdBy: z.string().optional(),
  })
)
.refine(
  async (data) => {
    return !(await SalesService.validateSalesInstallmentPayment(data.salesID, data.transactionID));
  },
  { message: "This Transaction ID is not a pending installment that exists under this SalesID." }
);

const loanDetailsSchema = z.object({
  installmentMonth: z.number().positive(),
  sumPerInstallment: z.number().positive(),
  firstInstallment: z.number().optional(),
});

const lotSchema = ZodCustomValidator.customRefine(
  z.object({
    unitID: z.string().optional(),
    unitPrice: z.number().positive(),
    maintenanceFee: z.number().nonnegative(),
    unitDiscount: z.number().nonnegative(),
    downpayment: z.number().nonnegative(),
    bookingReceived: z.number().nonnegative().optional(),
    loanDetails: loanDetailsSchema,
  })
);

const cartItemSchema = ZodCustomValidator.customRefine(
  z.object({
    productCode: z.string().refine(
      async (productCode) => {
        return !(await ProductService.validateProductCode(productCode));
      },
      { message: "Product Code does not exists." }
    ),
    quantity: z.number().positive(),

    productID: z.string().optional(),
    productName: z.string().optional(),
    singlePrice: z.number().optional(),
    singlePV: z.number().optional().default(0),
    totalPrice: z.number().optional(),
    totalPV: z.number().optional().default(0),
    isService: z.boolean().optional(),
    paymentDetails: lotSchema.optional(),
  })
).transform(async (data) => {
  const product = await ProductService.getProductByProductCode(data.productCode);
  data.isService = product.ProductCategoryID === "10003" || product.ProductCategoryID === "10004";
  data.productID = product.ID;
  data.productName = product.ProductName;
  data.singlePrice = product.Price;
  data.totalPrice = product.Price * data.quantity;
  data.singlePV = 0;
  data.totalPV = 0;
  if (data.paymentDetails) {
    data.paymentDetails.unitPrice = data.totalPrice;
  }
  return data;
});

const pendingPaymentListFilterSchema = ZodCustomValidator.customRefine(
  z.object({
    pageNumber: z.number().positive(),
    pageSize: z.number().positive(),
    agentID: z.string().optional(),
    purchaserID: z.string().optional(),
    lotNo: z.string().optional(),
    salesType: z.number().optional().default(0),
    paymentPurpose: z.number().optional().default(0),
    dateFrom: z
    .string()
    .optional()
    .refine(
      (str) => {
        if (str != null && str !== ""){
          try {
            const date = new Date(str);
            return !isNaN(date.getTime());
          } catch (error) {
              return false;
          }
        }
        else {
          return true
        }
      },
      {
        message: "Invalid date format on dateTo",
      }
    )
    .transform(
      (str) => {
        if (str != null && str !== ""){
          let date = moment.tz(str, "Asia/Kuala_Lumpur").toDate();
          date = format(date, "yyyy-MM-dd 00:00:00.000");
          return date;
        }
        else {
          return str;
        }
    }),
    dateTo: z
    .string()
    .optional()
    .refine(
      (str) => {
        if (str != null && str !== ""){
          try {
            const date = new Date(str);
            return !isNaN(date.getTime());
          } catch (error) {
              return false;
          }
        }
        else {
          return true
        }
      },
      {
        message: "Invalid date format on dateTo",
      }
    )
    .transform(
      (str) => {
        if (str != null && str !== ""){
          let date = moment.tz(str, "Asia/Kuala_Lumpur").toDate();
          date = format(date, "yyyy-MM-dd 23:59:59.997");
          return date;
        }
        else {
          return str;
        }
    }),
  })
);

const getTransactionHistorySchema = ZodCustomValidator.customRefine(
  z.object({
    pageNumber: z.number().positive(),
    pageSize: z.number().positive(),

    agentID: z.string().optional(),
    salesID: z.string().optional(),
    purchaserIDName: z.string().optional(),
    lotNo: z.string().optional(),
    status: z.string().optional(),
    paymentPurpose: z.number().optional().default(0),
    dateFrom: z.string().optional().default("2001-01-01"),
    dateTo: z.string().optional().default("3001-01-01"),
  })
);

const getPaymentListSchema = ZodCustomValidator.customRefine(
  z.object({
    pageNumber: z.number().positive(),
    pageSize: z.number().positive(),

    agentID: z.string().optional(),
    salesID: z.string().optional(),
    purchaserIDName: z.string().optional(),
    lotNo: z.string().optional(),
    status: z.enum(["O", "U", "C"]).optional(),
    category: z.enum(["1", "10002", "10003"]).optional(),
    dateFrom: z
    .string()
    .optional()
    .refine(
      (str) => {
        if (str != null && str !== ""){
          try {
            const date = new Date(str);
            return !isNaN(date.getTime());
          } catch (error) {
              return false;
          }
        }
        else {
          return true
        }
      },
      {
        message: "Invalid date format on dateFrom",
      }
    )
    .transform(
      (str) => {
        if (str != null && str !== ""){
          let date = moment.tz(str, "Asia/Kuala_Lumpur").toDate();
          date = format(date, "yyyy-MM-dd 00:00:00.000");
          return date;
        }
        else {
          return null;
        }
    }),
    dateTo: z
    .string()
    .optional()
    .refine(
      (str) => {
        if (str != null && str !== ""){
          try {
            const date = new Date(str);
            return !isNaN(date.getTime());
          } catch (error) {
              return false;
          }
        }
        else {
          return true
        }
      },
      {
        message: "Invalid date format on dateTo",
      }
    )
    .transform(
      (str) => {
        if (str != null && str !== ""){
          let date = moment.tz(str, "Asia/Kuala_Lumpur").toDate();
          date = format(date, "yyyy-MM-dd 23:59:59.997");
          return date;
        }
        else {
          return null;
        }
    }),
  })
)
.transform(
  (data) => {
    if (data.status != null && data.status !== ""){
      switch (data.status){
        case "O":
          data.status = "Overdue";
          break;

        case "U":
          data.status = "Up to date";
          break;

        case "C":
          data.status = "Completed";
          break;

        default:
          data.status = null;
          break;
      }
    }

    return data;
  }
);

const reuploadReceiptSchema = ZodCustomValidator.customRefine(
  z
    .object({
      salesID: z.string().refine(
        async (data) => {
          return !(await SalesService.validateSalesID(data));
        },
        { message: "Sales ID does not exists." }
      ),
      createdBy: z.string(),
      receipt: z.string(),
      transactionID: z.string(),
      hasExistingRecord: z.boolean().optional(),
    })
    .refine(
      async (data) => {
        return !(await SalesService.validateSalesTransactionID(data.salesID, data.transactionID));
      },
      { message: "This Transaction ID is either not pending or does not exists in this Sales ID!" }
    )
    .transform(async (data) => {
      data.hasExistingRecord = await SalesService.checkIfTransactionHasExistingReceipt(data.transactionID);

      return data;
    })
);

const getOrderDetailSchema = ZodCustomValidator.customRefine(
  z.object({
    salesID: z.string().refine(
      async (data) => {
        return !(await SalesService.validateSalesID(data));
      },
      { message: "Sales ID does not exists." }
    ),
  })
);

const getOrderListFilterSchema = ZodCustomValidator.customRefine(
  z.object({
    pageNumber: z.number().positive(),
    pageSize: z.number().positive(),
    agentCode_Name_IC: z.string().optional(),
    purchaserID_Name: z.string().optional(),
    uniqueCode: z.string().optional(),
    salesId: z.string().optional(),
    salesDateFrom: z.string().optional().default("2001-01-01"),
    salesDateTo: z.string().optional().default("3001-01-01"),
    bookingDateFrom: z.string().optional(),
    bookingDateTo: z.string().optional(),
    categoryID: z.string().optional(),
    status: z.string().array().optional().default([]),
    isTerminatedForRefund: z.string().optional(),
    salesType: z
      .union([z.number(), z.array(z.number())])
      .optional()
      .default(0),
  })
);

const validateIsFirstSalesSchema = ZodCustomValidator.customRefine(z.object({ salesID: z.string() }));

const insertRefundSchema = ZodCustomValidator.customRefine(
  z
    .object({
      refundID: z.string().optional(),
      salesID: z.string().refine(
        async (data) => {
          const result = await SalesService.getSalesBySalesID(data);
          if (result.length > 0) {
            if (result[0].SalesType === "6" || result[0].SalesType === "7") {
              return result[0].StatusX === "CCL";
            } else if (result[0].SalesType !== "1") {
              return true;
            }
          }
          return false;
        },
        { message: "Sales ID does not exists or not valid or is yet to be cancelled booking sales." }
      ),
      refundDate: z.string().optional(),
      amount: z.number(),
      memberID: z.string().optional(),
      isBooking: z.boolean().optional(),
      isFullyRefund: z.boolean().optional(),
    })
    .refine(
      async (data) => {
        return (await SalesService.validateRefundAmount(data.salesID)) >= data.amount;
      },
      { message: "Amount to be Refunded is More than the Actual Collected Amount." }
    )
    .transform(async (data) => {
      const result = await SalesService.getSalesBySalesID(data.salesID);
      data.isBooking = result[0].SalesType === "6" || result[0].SalesType === "7";
      const paidAmount = await SalesService.validateRefundAmount(data.salesID);
      data.isFullyRefund = paidAmount === data.amount;
      return data;
    })
);

const addAuthorizedRepresentativeSchema = ZodCustomValidator.customRefine(
  z.object({
    salesID: z.string().refine(
      async (data) => {
        return !(await SalesService.validateSalesID(data));
      },
      { message: "Sales ID does not exists." }
    ),
    authorizedFullName: z.string(),
    authorizedIC: z.string(),
    authorizedMobileNo: z.string(),
    memberID: z.string().optional(),
  })
);

const cancelBookingSalesSchema = ZodCustomValidator.customRefine(
  z.object({
    salesID: z.string()
    .refine(
      async (data) => {
        return (await SalesService.validateBookingSalesID(data));
      },
      { message: "Invalid booking sales ID." }
    )
    .refine(
      async (data) => {
        const result = await SalesService.getSalesBySalesID(data);
        return result[0].StatusX !== "RF";
      },
      { message: "You cannot cancel a refunded booking sales!" }
    ),
    status: z.string().optional().transform(async () => "CCL"),
    createdBy: z.string()
  })
);

////////////////////////////////////////////////////////////////
//            Will be used by other controllers
const insertSalesSchema = ZodCustomValidator.customRefine(
  z
    .object({
      salesID: z
        .string()
        .optional()
        .transform(async () => await SalesService.generateSalesID()),
      salesType: z.string().refine(
        async (data) => {
          const parameterList = await UtilService.getParameterValue("SalesType");
          return parameterList.map((parameter) => parameter.ParameterValue).includes(data);
        },
        {
          message: "Invalid Payment Type",
        }
      ), // [1]Registration / [2]UnitSales / [3]FSPSales / [4]MerchandiseSales / [5]MISCPayment / [6]UnitBooking / [7]FSPBooking

      unitID: z.string().optional(),
      memberID: z.string().optional(),
      purchaserID: z.string().optional(),
      salesByID: z.string().refine(
        async (memberID) => {
          const res = await MemberService.getUserRole(memberID);
          return res != null && res !== "C";
        },
        { message: "Invalid sales by ID." }
      ),
      totalPrice: z.number().nonnegative().optional(),
      totalPV: z.number().optional(),
      paymentType: z.string().refine(
        async (data) => {
          const parameterList = await UtilService.getParameterValue("PaymentType");
          return parameterList.map((parameter) => parameter.ParameterValue).includes(data);
        },
        {
          message: "Invalid Payment Type",
        }
      ), // [5] Cash, [2] Cash Wallet, [66] Cheque, [7] Card Payment, [88] iPay88, [100] Online Payment, [6] Redemption Wallet, [4] Voucher, [1] Wallet
      remarks: z.string().optional(),
      status: z
        .string()
        .optional()
        .transform(async () => "P"),
      unitPayable: z.number().nonnegative().optional().default(0),
      bindUnitSalesID: z.string().optional(),
      bindUnitBookingID: z.string().optional(),
      introducerDetail: z.string().optional(),
      authorizedFullName: z.string().optional(),
      authorizedIC: z.string().optional(),
      authorizedMobileNo: z.string().optional(),
      bookingExpiry: z
        .string()
        .optional()
        .transform(() => {
          let now = moment().tz("Asia/Kuala_Lumpur").toDate();
          now = addDays(now, 7);
          const formattedExpiryDate = format(now, "yyyy-MM-dd HH:mm:ss.SSS");
          return formattedExpiryDate;
        }),

      fullname: z.string().optional(),
      contactNo: z.string().optional(),

      receipt: z.string().optional(),
      paymentPurpose: z.string().optional(),
      transactionID: z.string().optional(),
      isMailToPurchaserId: z.boolean().default(false),
      mailToPurchaserId: z.string().optional(),
      items: z.array(cartItemSchema).optional(),
      lot: lotSchema.optional(),
    })
    .refine(
      async (data) => {
        if (data.salesType === "1") {
          return true;
        } else {
          return !(await MemberService.validateCustomer(data.purchaserID));
        }
      },
      { message: "Purchaser ID is not customer or does not exists." }
    )
    .refine(
      async (data) => {
        if (data.salesType !== "6" && data.salesType !== "7") {
          // if this is not a booking sales, cannot set mail to purchaserId as true.
          return !(data.isMailToPurchaserId === true);
        } else {
          return true;
        }
      },
      { message: "Only booking related sales allow mail to purchaser ID option." }
    )
    .refine(
      async (data) => {
        if (data.salesType === "5") {
          return true;
        } else {
          return !(await MemberService.validateAgent(data.memberID));
        }
      },
      { message: "This agent does not exists." }
    )
    .refine(
      async (data) => {
        if (data.salesType === "3" || data.salesType === "4" || data.salesType === "7") {
          return data.items;
        }
        return true;
      },
      { message: "Please insert some items" }
    )
    .refine(
      async (data) => {
        if (
          data.salesType !== "1" &&
          data.salesType !== "5" &&
          data.salesType !== "3" &&
          data.salesType !== "7" &&
          data.salesType !== "4"
        ) {
          return !(await ProductService.validateUnitID(data.unitID || null));
        }
        return true;
      },
      { message: "Unit ID does not exists." }
    )
    .refine(
      async (data) => {
        if (data.salesType === "3") {
          if (data.bindUnitSalesID != null) {
            return !(await SalesService.validateSalesID(data.bindUnitSalesID || null));
          }
        }
        return true;
      },
      { message: "Bind Unit Sales ID does not exists." }
    )
    .refine(
      async (data) => {
        if (data.salesType === "2" || data.salesType === "3") {
          if (data.bindUnitBookingID != null) {
            return await SalesService.validateBookingSalesID(data.bindUnitBookingID || null);
          }
        }
        return true;
      },
      { message: "Bind Unit Booking ID does not exists." }
    )
    .refine(
      async (data) => {
        if (data.paymentType == "100") {
          return data?.receipt != null;
        }
        return true;
      },
      { message: "Receipt Cannot be Empty Online Transfer Payment." }
    )
    .refine(
      async (data) => {
        if (data.salesType === "5") {
          return data?.paymentPurpose != null;
        }
        return true;
      },
      { message: "Payment Purpose Cannot be Empty for Misc Sales." }
    )
    .refine(
      async (data) => {
        if (data.salesType === "3") {
          if (data.items != null && data.items.length > 0) {
            for (let i = 0; i < data.items.length; i++) {
              if (data.items[i].paymentDetails == null && data.items[i].isService) {
                return false;
              }
            }
            return true;
          } else {
            return false;
          }
        }
        return true;
      },
      { message: "Payment Detail In Item Array Cannot be Empty for FSP Sales." }
    )
    .transform(async (data) => {
      data.totalPrice = data.totalPrice == null ? 0 : data.totalPrice;
      data.mailToPurchaserId = data.isMailToPurchaserId ? data.purchaserID : null;
      data.unitPayable = 0;

      switch (data.salesType) {
        case "1":
          data.paymentPurpose = "7"; //Register
          data.purchaserID = null;
          data.bookingExpiry = null;
          break;
        case "2":
          data.paymentPurpose = "1"; //Downpayment
          data.bookingExpiry = null;
          break;
        case "3":
          data.paymentPurpose = "3"; //Service
          data.bookingExpiry = null;
          break;
        case "4":
          data.paymentPurpose = "4"; //Urn
          data.bookingExpiry = null;
          break;
        case "5":
          data.memberID = null; //MISC
          break;
        case "6":
          data.paymentPurpose = "9"; //Booking
          break;
        case "7":
          data.paymentPurpose = "9"; //Booking
          break;
        default: // Default to Inputted Payment Purpose for Misc Sales
          break;
      }

      if (data.lot != null) {
        data.lot.unitID = data.unitID;
        const total = data.lot.unitPrice + data.lot.maintenanceFee;
        const payable = total - data.lot.unitDiscount;
        data.unitPayable += payable;
        data.lot.loanDetails.firstInstallment =
          payable -
          data.lot.downpayment -
          (data.lot.loanDetails.installmentMonth - 1) * data.lot.loanDetails.sumPerInstallment;
        data.totalPrice += total;
      }

      if (data.items != null && data.items.length > 0) {
        for (let i = 0; i < data.items.length; i++) {
          if (data.salesType !== "7") {
            data.totalPrice += data.items[i].totalPrice;
          }
          if (data.items[i].paymentDetails != null) {
            data.items[i].paymentDetails.unitID = data.unitID;
            const total = data.items[i].paymentDetails.unitPrice + data.items[i].paymentDetails.maintenanceFee;
            const payable = total - data.items[i].paymentDetails.unitDiscount;
            data.unitPayable += payable;
            data.items[i].paymentDetails.loanDetails.firstInstallment =
              payable -
              data.items[i].paymentDetails.downpayment -
              (data.items[i].paymentDetails.loanDetails.installmentMonth - 1) *
                data.items[i].paymentDetails.loanDetails.sumPerInstallment;
            if (data.bindUnitBookingID != null) {
              const bookingSales = (await SalesService.getSalesBySalesID(data.bindUnitBookingID))[0];
              if (data.items[i].paymentDetails != null) {
                data.items[i].paymentDetails.bookingReceived = bookingSales.TotalPrice;
              }
            } else {
              if (data.items[i].paymentDetails != null) {
                data.items[i].paymentDetails.bookingReceived = 0;
              }
            }
          }
        }
      }

      if (data.bindUnitBookingID != null) {
        const bookingSales = (await SalesService.getSalesBySalesID(data.bindUnitBookingID))[0];
        data.totalPrice -= bookingSales.TotalPrice;
        if (data.lot != null) {
          data.lot.bookingReceived = bookingSales.TotalPrice;
        }
      } else {
        if (data.lot != null) {
          data.lot.bookingReceived = 0;
        }
      }

      data.totalPV = 0;
      return data;
    })
);

class SalesController {
  static async InsertSales(req, res) {
    try {
      const body = await insertSalesSchema.parseAsync(req.body);
      await sequelize.transaction(async (transaction) => {
        await SalesService.insertSales(body, req, transaction);
      });
      res.status(200).send({
        Success: true,
        Data: { salesID: body.salesID },
        Message: `${body.salesID} sales is successfully inserted`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async InsertRegistrationSales(
    memberID,
    req,
    transaction = null,
    paymentType = null,
    remarks = null,
    receipt = null
  ) {
    let query =
      "SELECT TOP 1 * FROM tbl_Product WITH (NOLOCK) WHERE ProductType = 99 AND IsDeleted = 0 AND StatusX = 1";
    let result = await sequelize.query(query, {
      replacements: {},
      type: Sequelize.QueryTypes.SELECT,
    });
    const cartItem = {
      productCode: result[0].ProductCode,
      quantity: 1,
      productID: result[0].ID,
      productName: result[0].ProductName,
      singlePrice: result[0].Price,
      singlePV: 0,
      totalPrice: result[0].Price,
      totalPV: 0,
    };
    const data = {
      salesType: "1",
      memberID: memberID,
      purchaserID: memberID,
      salesByID: memberID,
      paymentType: paymentType || "5",
      status: "P",
      items: [cartItem], // Array of cartItem objects
    };
    if (remarks != null) {
      data.remarks = remarks;
    }
    if (receipt != null) {
      data.receipt = receipt;
    }
    const body = await insertSalesSchema.parseAsync(data);
    await SalesService.insertSales(body, req, transaction);
  }

  static async InsertRefund(req, res) {
    try {
      let body = await insertRefundSchema.parseAsync(req.body);
      body.memberID = req.MemberID;

      await sequelize.transaction(async (transaction) => {
        await SalesService.insertTblRefund(body, req, transaction);
        if (body.isBooking) {
          await SalesService.updateBookingSalesStatus({ salesID: body.salesID, status: "RF" }, req, transaction);
          await SalesService.updateUnitCollectionStatus({ salesID: body.salesID, status: "A" }, req, transaction);
        } else if (!body.isBooking && body.isFullyRefund) {
          await SalesService.updateUnitCollectionStatus({ salesID: body.salesID, status: "A" }, req, transaction);
        }
      });
      res.status(200).send({
        Success: true,
        Data: `${body.salesID} sales is successfully refunded`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async InsertInstallmentPayment(req, res) {
    try {
      const body = await insertInstallmentPaymentSchema.parseAsync(req.body);
      await sequelize.transaction(async (transaction) => {
        await SalesService.insertTblSalesPayment(body, req, transaction);
      });
      res.status(200).send({
        Success: true,
        Data: `${body.salesID} sales payment is successfully inserted`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async ApproveRejectSales(req, res) {
    try {
      let body = await approveRejectSalesSchema.parseAsync(req.body);
      body.memberID = body.memberID == null ? req.MemberID : body.memberID;
      await sequelize.transaction(async (transaction) => {
        await SalesService.approveRejectSales(body, req, transaction);
      });
      res.status(200).send({
        Success: true,
        Data: `${body.salesID} sales payment is successfully ` + (body.isApproved ? `approved` : `rejected`),
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async ApproveRejectInstallment(req, res){
    try {
      let body = await approveRejectInstallmentSchema.parseAsync(req.body);
      body.createdBy = body.createdBy == null || body.createdBy === "" ? req.MemberID : body.createdBy;

      await sequelize.transaction(async (transaction) => {
        await SalesService.approveRejectInstallmentPayments(body, req, transaction);
      });
      res.status(200).send({
        Success: true,
        Data: `Installment ${body.transactionID} is successfully ` + (body.isApproved ? `approved` : `rejected`),
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async ValidateIsFirstSales(req, res) {
    try {
      let body = await validateIsFirstSalesSchema.parseAsync(req.body);
      const result = await SalesService.validateIsFirstSales(body.salesID);
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

  static async GetPendingInstallmentPaymentList(req, res){
    try {
      const body = await pendingInstallmentFilterSchema.parseAsync(req.body);
      const result = await SalesService.getPendingInstallmentPaymentList(body);

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

  static async GetPendingPaymentApprovalList(req, res) {
    try {
      const body = await pendingPaymentListFilterSchema.parseAsync(req.body);
      const result = await SalesService.getPendingPaymentList(body);

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

  static async GetTransactionHistory(req, res) {
    try {
      const body = await getTransactionHistorySchema.parseAsync(req.body);
      const result = await SalesService.getTransactionHistory(body, req);

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

  static async GetPaymentList(req, res) {
    try {
      const body = await getPaymentListSchema.parseAsync(req.body);
      const result = await SalesService.getPaymentList(body, req);

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

  static async ReuploadPaymentReceipt(req, res) {
    try {
      const body = await reuploadReceiptSchema.parseAsync(req.body);
      await sequelize.transaction(async (transaction) => {
        await SalesService.ReuploadReceipt(body, req, transaction);
      });
      res.status(200).send({
        Success: true,
        Data: `Receipt is successfully updated for ${body.salesID}.`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async GetOrderDetails(req, res) {
    try {
      const body = await getOrderDetailSchema.parseAsync(req.body);
      const result = await SalesService.GetOrderDetails(body.salesID);

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

  static async GetOrderList(req, res) {
    try {
      const body = await getOrderListFilterSchema.parseAsync(req.body);
      const result = await SalesService.getOrderList(body, req);

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

  static async AddAuthorizedRepresentative(req, res) {
    try {
      let body = await addAuthorizedRepresentativeSchema.parseAsync(req.body);
      body.memberID = req.MemberID;
      await sequelize.transaction(async (transaction) => {
        await SalesService.addAuthorizedRepresentativeToSales(body, req, transaction);
      });
      res.status(200).send({
        Success: true,
        Data: `Authorized representative is successfully added to ${body.salesID}`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async CancelBookingSales(req, res){
    try {
      let body = await cancelBookingSalesSchema.parseAsync(req.body);
      await sequelize.transaction(async (transaction) => {
        await SalesService.cancelBookingSales(body, req, transaction);
      });
      res.status(200).send({
        Success: true,
        Data: `${body.salesID} successfully cancelled.`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
}
module.exports = SalesController;
