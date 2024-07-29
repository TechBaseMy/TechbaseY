"use strict";
const captureError = require("../lib/ErrorHandler/CaptureError");
const Models = require("../models");
const { z } = require("zod");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const ZodCustomValidator = require("../util/ZodCustomValidator");
const Util = require("../util/Util");
const { ValidateUser } = require("../lib/JWT");
const OSS = require("../lib/OSS");
const MemberService = require("../service/MemberService");
const EmailService = require("../service/EmailService");
const { encrypt } = require("../lib/Encryptor");
const { InsertRegistrationSales } = require("./SalesController");
const { VerifyForgetPasswordToken } = require("../lib/JWT");
const UtilService = require("../service/UtilService");

const addressSchema = z
  .object({
    addressOne: z.string(),
    addressTwo: z.string().optional(),
    addressThree: z.string().optional(),
    postCode: z.string().refine((value) => /^\d{5}$/.test(value), {
      message: "Invalid postcode Format, Only 5-digit numerics allowed",
    }),
    city: z.string(),
    country: z
      .number()
      .positive()
      .refine(async (value) => !(await MemberService.validateCountry(value)), {
        message: "Invalid country",
      }),
    state: z
      .number()
      .positive()
      .refine(async (value) => !(await MemberService.validateState(value)), {
        message: "Invalid state",
      }),
  })
  .transform((data) => {
    data.addressOne = data.addressOne === undefined ? null : data.addressOne.trim().toUpperCase();
    data.addressTwo = data.addressTwo === undefined ? null : data.addressTwo.trim().toUpperCase();
    data.addressThree = data.addressThree === undefined ? null : data.addressThree.trim().toUpperCase();
    data.postCode = data.postCode === undefined ? null : data.postCode.trim().toUpperCase();
    data.city = data.city === undefined ? null : data.city.trim().toUpperCase();
    data.country = data.country === undefined ? null : data.country;
    data.state = data.state === undefined ? null : data.state;
    return data;
  });

const createMemberSchema = ZodCustomValidator.customRefine(
  z
    .object({
      memberID: z.string().optional(),
      displayName: z.string().optional(),
      username: z.string().optional(),
      password: z
        .string()
        .optional()
        .transform((data) => {
          return data != null ? encrypt(data) : data;
        }),
      role: z.string().refine(
        async (data) => {
          const parameterList = await UtilService.getParameterValue("Role");
          return parameterList.map((parameter) => parameter.ParameterValue).includes(data);
        },
        {
          message: "Invalid Role",
        }
      ), // C for Customer, M for Agent, AD for Admin
      ranking: z.string().optional(),
      firstName: z.string(),
      lastName: z.string().optional(),
      fullName: z.string().optional(),
      chineseName: z.string().optional(),
      identityType: z.string().refine(
        async (data) => {
          const parameterList = await UtilService.getParameterValue("IdentityType");
          return parameterList.map((parameter) => parameter.ParameterValue).includes(data);
        },
        {
          message: "Invalid Identity Type",
        }
      ), // IC for IC, CR for Corporate Registry, P for Passport, O for Other
      identityNo: z.string(),
      gender: z.enum(["M", "F"]),
      DOB: z.string().refine(
        (str) => {
          try {
            const date = new Date(str);
            return !isNaN(date.getTime()); //
          } catch (error) {
            return false;
          }
        },
        {
          message: "Invalid date format",
        }
      ),
      nationality: z
        .number()
        .positive()
        .refine(async (value) => !(await MemberService.validateCountry(value)), { message: "Invalid country" }),
      email: z.string().email(),
      mobile: z.string(),
      mobileCode: z.string().default("6"),
      mobile2: z.string().optional(),
      mobileCode2: z.string().default("6").optional(),
      maritalStatus: z
        .string()
        .optional()
        .refine(
          async (data) => {
            if (data == null) {
              return true;
            }
            const parameterList = await UtilService.getParameterValue("Marriage");
            return parameterList.map((parameter) => parameter.ParameterValue).includes(data);
          },
          {
            message: "Invalid Marital Status",
          }
        ), // S for Single, M for Married, D for Divorced, W for Widowed
      religion: z.string().optional(),
      isKYC: z.boolean().default(false),
      isCriminal: z.boolean().default(false),
      isBankruptcy: z.boolean().default(false),
      bankCode: z
        .string()
        .min(8, "Bank Code must be at least 8 characters long")
        .max(11, "Bank Code must be at most 11 characters long")
        .optional(),
      bankName: z.string().optional(),
      bankBranch: z.string().nullable().optional().default(null),
      bankAccountNo: z.string().optional(),
      bankAccountHolder: z.string().optional(),
      status: z
        .string()
        .optional()
        .refine(
          async (data) => {
            if (data == null) {
              return true;
            }
            const parameterList = await UtilService.getParameterValue("MemberStatus");
            return parameterList.map((parameter) => parameter.ParameterValue).includes(data);
          },
          {
            message: "Invalid Member Status",
          }
        )
        .transform(async () => "A"), // A for Active, S for Suspend, P for Pending, T for Terminated
      sponsorID: z.string().refine(
        async (memberID) => {
          return !(await MemberService.validateMemberID(memberID));
        },
        { message: "Sponsor ID does not exists." }
      ),
      sponsorIndex: z.string().optional(),
      level: z.number().optional(),
      residentialAddress: addressSchema,
      mailingAddress: addressSchema,
      beneficiaryName: z.string().optional(),
      beneficiaryIC: z.string().optional(),
      beneficiaryContact: z.string().optional(),
      beneficiaryRelationship: z.string().optional(),

      paymentType: z
        .string()
        .optional()
        .refine(
          async (data) => {
            const parameterList = await UtilService.getParameterValue("PaymentType");
            return parameterList.map((parameter) => parameter.ParameterValue).includes(data);
          },
          {
            message: "Invalid Payment Type",
          }
        ), // [5] Cash, [2] Cash Wallet, [66] Cheque, [7] Card Payment, [88] iPay88, [100] Online Payment, [6] Redemption Wallet, [4] Voucher, [1] Wallet
      remarks: z
        .string()
        .optional()
        .transform((data) => (data == null ? null : data)),
      receipt: z.string().optional(),

      //File Upload
      ICFront: z.string().optional(),
      ICBack: z.string().optional(),
      companyProfile: z.string().optional(),
      sec14: z.string().optional(),
      sec17: z.string().optional(),
      sec51: z.string().optional(),
      sec46: z.string().optional(),
      memorandum: z.string().optional(),
      accounts: z.string().optional(),
    })
    .refine(
      async (data) => {
        if (data.role == "AD") {
          return data?.username != null || data?.password != null;
        }
        return true;
      },
      { message: "Username and Password Cannot be Empty for Admin." }
    )
    .refine(
      async (data) => {
        if (data.role == "M") {
          return data?.password != null;
        }
        return true;
      },
      { message: "Password Cannot be Empty for Agent." }
    )
    .refine(
      async (data) => {
        if (data.role == "M" && data.paymentType == "100") {
          return data?.receipt != null;
        }
        return true;
      },
      { message: "Receipt Cannot be Empty for Agent Registration with Online Transfer." }
    )
    .refine(
      async (data) => {
        if (data.role == "C") {
          return data?.religion != null || data?.chineseName != null;
        }
        return true;
      },
      { message: "Religion and Chinese Name Cannot be Empty for Customer." }
    )
    .refine(
      async (data) => {
        if (data.role != "AD") {
          return data?.paymentType != null;
        }
        return true;
      },
      { message: "Payment Type Cannot be Empty Roles other than Admin." }
    )
    .refine(
      async (data) => {
        return await MemberService.validateIC(data.identityNo, data.role);
      },
      { message: "IC already exists" }
    )
    .refine(
      async (data) => {
        return await MemberService.validateUsername(data.username, data.role);
      },
      { message: "Username already exists" }
    )
    .refine(
      async (data) => {
        if (data.role != "M") {
          return true;
        }
        const result = await MemberService.findBank(data.bankCode);
        return result[0]?.BankName === undefined || result[0]?.BankName === null;
      },
      { message: "Invalid Bank Code" }
    )
    .refine(
      async (data) => {
        if (data.identityType === "CR") {
          // If identity type is CR, check the file upload fields
          const requiredFields = [
            data.companyProfile,
            data.sec14,
            data.sec17,
            data.sec51,
            data.sec46,
            data.memorandum,
            data.accounts,
          ];
          // All required fields should be non-empty
          return requiredFields.every((field) => field !== undefined && field !== null);
        } else {
          // If identity type is not CR, check ICFront and ICBack
          return data.ICFront !== undefined && data.ICBack !== undefined;
        }
      },
      {
        message: (data) =>
          data.identityType === "CR"
            ? "When identity type is CR, all file upload fields (except ICFront and ICBack) must be provided."
            : "When identity type is not CR, ICFront and ICBack must be provided.",
      }
    )
).transform(async (data) => {
  data.username = data.role === "AD" ? data.username : data.identityNo;
  data.DOB = new Date(data.DOB);
  data.memberID = await MemberService.generateMemberID(data.role === "C" ? "C" : "M");
  if (data.bankCode != null) {
    let result = await MemberService.findBank(data.bankCode);
    data.bankName = result.BankName;
  }
  const { sponsorIndex, level } = await MemberService.getSponsorIndex(data.sponsorID);
  (data.sponsorIndex = sponsorIndex + `~${data.memberID}~`), (data.level = level + 1);

  data.ranking = data.role === "C" ? "0" : data.role === "M" ? "10" : data.role === "AD" ? "99" : "0";
  data.status = data.role === "M" ? "P" : data.status;
  data.fullName = data.firstName + data.lastName != null ? " " + data.lastName : "";

  return data;
});

const viewMemberListSchema = z.object({
  role: z
    .string()
    .optional()
    .refine(
      async (data) => {
        if (data == null) {
          return true;
        }
        const parameterList = await UtilService.getParameterValue("Role");
        return parameterList.map((parameter) => parameter.ParameterValue).includes(data);
      },
      {
        message: "Invalid Role",
      }
    ), // C for Customer, M for Agent, AD for Admin
  isKYC: z.boolean().optional(),
  agentOrPurchaserID: z.string().optional(),
  name: z.string().optional(),
  ic: z.string().optional(),
  pageNumber: z.number(),
  pageSize: z.number(),
})
.refine(
  async (data) => {
    if (data.agentOrPurchaserID != null && data.agentOrPurchaserID !== ""){
      const result = await MemberService.getUserRole(data.agentOrPurchaserID);
      // IF THE FILTERED USER IS A CUSTOMER, INPUT ROLE FILTER MUST BE "C"
      // TO AVOID CUSTOMER TO BE FILTERED INTO LIST ON MEMBER LIST INSTEAD OF CUSTOMER LIST
      // IF FILTERED USER IS NOT CUSTOMER, IGNORE ROLE INPUT.
      return result != null && result === "C" ? data.role != null && data.role === "C" : true;
    }
    else {
      return true;
    }
  },
  { message: "Role parameter must be filtered appropriately in order to filter customer!" }
);

const forgetPasswordSchema = z.object({
  username: z.string(),
});

const toggleMemberKYCSchema = z.object({
  memberID: z.string().refine(
    async (memberID) => {
      return !(await MemberService.validateMemberID(memberID));
    },
    { message: "Member ID does not exists." }
  ),
  status: z.boolean(),
});

const verifyForgetPasswordSchema = ZodCustomValidator.customRefine(
  z.object({
    token: z.string(),
  })
);

const forgetChangePasswordSchema = ZodCustomValidator.customRefine(
  z.object({
    token: z.string(),
    password: z.string().transform((data) => encrypt(data)),
  })
);

const changePasswordSchema = ZodCustomValidator.customRefine(
  z.object({
    memberID: z.string().refine(
      async (memberID) => {
        return !(await MemberService.validateMemberID(memberID));
      },
      { message: "Member ID does not exists." }
    ),
    password: z.string().transform((data) => encrypt(data)),
  })
);

const getMemberDetailSchema = ZodCustomValidator.customRefine(
  z.object({
    memberID: z.string().refine(
      async (memberID) => {
        return !(await MemberService.validateMemberID(memberID));
      },
      { message: "Member ID does not exists." }
    ),
  })
);

const getPendingApprovalMemberListSchema = ZodCustomValidator.customRefine(
  z.object({
    pageNumber: z.number(),
    pageSize: z.number(),
    signUpDateFrom: z.string().optional().default("2001-01-01"),
    signUpDateTo: z.string().optional().default("3001-01-01"),
    memberID_Name_IC: z.string().optional(),
    role: z.string().optional(),
    memberStatus: z.string().optional(),
    identityType: z.string().optional(),
    kycStatus: z.string().optional(),
  })
);

const memberSponsorTreeSchema = ZodCustomValidator.customRefine(
  z.object({
    memberID: z.string().refine(
      async (memberID) => {
        // if it is null or undefined, it means that it is not customer
        return (await MemberService.validateCustomer(memberID));
      },
      { message: "Member ID does not exists." }
    ),
    searchMemberID: z.string().optional(),
  })
)
.refine(
  async (data) => {
    if (data.searchMemberID != null && data.searchMemberID !== ""){
      return data.searchMemberID != data.memberID ? (await MemberService.validateDownline(data.memberID, data.searchMemberID)) : true;
    }
    else {
      return true;
    }
  },
  {
    message: "searchMemberID is either invalid member or not a downline of member ID",
  }
)
.transform(
  (data) => {
    if (data.searchMemberID === undefined || data.searchMemberID === null || data.searchMemberID === ""){
      data.searchMemberID = data.memberID;
    }

    return data;
  }
);

class MemberController {
  static async InsertMember(req, res) {
    let transaction;
    let memberID;
    try {
      const body = await createMemberSchema.parseAsync(req.body);
      memberID = body.memberID;

      const uploadRes = await OSS.UploadMemberKYC(body, req);

      if (Object.keys(uploadRes).length > 0) {
        if (body.identityType === "CR") {
          body.companyProfile = uploadRes.cp;
          body.sec14 = uploadRes.s14;
          body.sec17 = uploadRes.s17;
          body.sec46 = uploadRes.s46;
          body.sec51 = uploadRes.s51;
          body.memorandum = uploadRes.memo;
          body.accounts = uploadRes.acc;
        } else {
          body.ICFront = uploadRes.icFront;
          body.ICBack = uploadRes.icBack;
        }
        await sequelize.transaction(async (transaction) => {
          const mainResult = await MemberService.createMember(body, req, transaction);
          if (body.role === "M") {
            await InsertRegistrationSales(memberID, req, transaction, body.paymentType, body.remarks, body.receipt);
          }
        });
        res.status(200).send({
          Success: true,
          Data: `${memberID} account is successfully registered`,
        });
      } else {
        res.status(422).send({
          Success: true,
          Data: `${memberID} account failed to registered`,
        });
      }
    } catch (error) {
      if (memberID != null) {
        //delete every documents that are uploaded just now
        await OSS.deleteFolder("Member/" + memberID, req);
      }
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async ViewMemberList(req, res) {
    try {
      const body = await viewMemberListSchema.parseAsync(req.body);

      const mainResult = await MemberService.findMembers(body);
      res.status(200).send({
        Success: true,
        Data: mainResult.data,
        Total: mainResult.totalRows,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async ToggleMemberKYC(req, res) {
    try {
      const body = await toggleMemberKYCSchema.parseAsync(req.body);

      const mainResult = await MemberService.updateKYC(body, req);
      res.status(200).send({
        Success: true,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async GetMemberDetail(req, res) {
    try {
      const body = await getMemberDetailSchema.parseAsync(
        Object.entries(req.body).length === 0 ? { memberID: req.MemberID } : req.body
      );
      const result = await MemberService.findMemberByMemberID(body.memberID);
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

  static async GetMemberName(req, res) {
    try {
      const body = await getMemberDetailSchema.parseAsync(req.body);
      const result = await MemberService.findMemberByMemberID(body.memberID);
      res.status(200).send({
        Success: true,
        Data: result.Fullname,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async GetSponsorTree(req, res){
    try {
      const body = await memberSponsorTreeSchema.parseAsync(req.body);
      const result = await MemberService.getSponsorTree(body.searchMemberID);
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

  static async ForgetPassword(req, res) {
    try {
      const body = await forgetPasswordSchema.parseAsync(req.body);

      const mainResult = await EmailService.forgetPasswordEmail(body.username);
      if (mainResult) {
        res.status(200).send({
          Success: true,
        });
      } else {
        throw new Error("An Unknown Error occurred");
      }
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async VerifyForgetPassword(req, res) {
    try {
      const body = await verifyForgetPasswordSchema.parseAsync(req.body);
      if ((await VerifyForgetPasswordToken(body)).status) {
        res.status(200).send({
          Success: true,
        });
      } else {
        res.status(401).send({
          status: 401,
          message: "Invalid Forget Password Access Token",
          info: {},
          error_code: "",
        });
      }
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async ForgetPasswordChange(req, res) {
    try {
      const body = await forgetChangePasswordSchema.parseAsync(req.body);
      const result = await VerifyForgetPasswordToken(body);
      if (result.status) {
        body.memberID = result.memberID;
        await MemberService.changePassword(body);
        res.status(200).send({
          Success: true,
        });
      } else {
        res.status(401).send({
          status: 401,
          message: "Invalid Forget Password Access Token",
          info: {},
          error_code: "",
        });
      }
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async ChangePassword(req, res) {
    try {
      const body = await changePasswordSchema.parseAsync(req.body);
      await MemberService.changePassword(body);
      res.status(200).send({
        Success: true,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async GetPendingApprovalMemberList(req, res) {
    try {
      const body = await getPendingApprovalMemberListSchema.parseAsync(req.body);
      const result = await MemberService.getPendingApprovalMemberList(body);
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

  static async GetMemberUploadedKYCDocument(req, res) {
    try {
      const body = await getMemberDetailSchema.parseAsync(
        Object.entries(req.body).length === 0 ? { memberID: req.MemberID } : req.body
      );
      const result = await MemberService.getUploadedDocumentByMemberID(body.memberID);
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
}
module.exports = MemberController;
