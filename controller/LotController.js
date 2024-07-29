"use strict";
const captureError = require("../lib/ErrorHandler/CaptureError");
const Models = require("../models");
const { z } = require("zod");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const ZodCustomValidator = require("../util/ZodCustomValidator");
const Util = require("../util/Util");
const { ValidateUser } = require("../lib/JWT");
const ProductService = require("../service/ProductService");
const LotService = require("../service/LotService");
const moment = require("moment-timezone");
const Constants = require("../util/Constant");
const { format } = require("date-fns-tz");
const OSS = require("../lib/OSS");

const createIntendedUserModule = ZodCustomValidator.customRefine(
  z
    .object({
      unitID: z.string().refine(
        async (data) => {
          if (data != null) {
            return !(await ProductService.validateUnitID(data || null));
          }
          return true;
        },
        { message: "Unit ID does not exists." }
      ),
      fullName: z.string().optional(),
      chineseName: z.string().optional(),
      identityNo: z.string().optional(),
      gender: z.enum(["M", "F"]).optional(),
      relationship: z.string().optional(),
      status: z
        .boolean()
        .optional()
        .transform(async () => true),
      assignAt: z
        .string()
        .optional()
        .refine(
          (str) => {
            try {
              if (str == null) {
                return true;
              }
              const date = new Date(str);
              return !isNaN(date.getTime());
            } catch (error) {
              return false;
            }
          },
          {
            message: "Invalid date format",
          }
        )
        .transform((data) => {
          if (data == null) {
            let date = moment().tz("Asia/Kuala_Lumpur").toDate();
            date = format(date, "yyyy-MM-dd HH:mm:ss.SSS");
            data = date;
          }
          return data;
        }),
      memberID: z.string().optional(),
      fileName: z.string().optional(),
      certFile: z.string().optional(),
    })
    .refine(
      async (data) => {
        const { fullName, chineseName, identityNo, gender, relationship } = data;
        return fullName || chineseName || identityNo || gender || relationship;
      },
      { message: "At least One Detail Field has to be Populated" }
    )
    .refine(
      async (data) => {
        if (data.relationship == null) {
          return true;
        }
        return !(await LotService.validateRelationship(data.relationship));
      },
      { message: "Relationship does not exists" }
    )
    .refine(
      async (data) => {
        if (data.identityNo == null) {
          return true;
        }
        return await LotService.validateIntendedUserIC(data.identityNo);
      },
      { message: "IC already exists" }
    )
    .refine(
      async (data) => {
        if (data.certFile != null && data.certFile !== "") {
          return data.fileName != null && data.fileName !== "";
        }
        else {
          return true;
        }
      },
      { message: "File name cannot be empty when upload certificate." }
    )
);

const uploadCertForLotIntendedUserSchema = ZodCustomValidator.customRefine(
  z.object({
    id: z.string().refine(
      async (data) => {
        if (data != null) {
          return (await LotService.getLotUnitIDByIntendedUserDataID(data)) != null;
        }
        return true;
      },
      { message: "This lot intended user ID does not exists." }
    ),
    fileName: z.string(),
    certFile: z.string(),
    createdBy: z.string(),
    unitID: z.string().optional(),
  })
)
.transform(
  async (data) => {
    data.unitID = (await LotService.getLotUnitIDByIntendedUserDataID(data.id))

    return data;
  }
);

const checkInIntendedUserSchema = ZodCustomValidator.customRefine(
  z.object({
    unitID: z.string().refine(
      async (data) => {
        if (data != null) {
          return !(await ProductService.validateUnitID(data || null));
        }
        return true;
      },
      { message: "Unit ID does not exists." }
    ),
    ID: z.string().optional(),
    checkInAt: z
      .string()
      .optional()
      .refine(
        (str) => {
          try {
            if (str == null) {
              return true;
            }
            const date = new Date(str);
            return !isNaN(date.getTime());
          } catch (error) {
            return false;
          }
        },
        {
          message: "Invalid date format",
        }
      )
      .transform(() => {
        let date = moment().tz("Asia/Kuala_Lumpur").toDate();
        date = format(date, "yyyy-MM-dd HH:mm:ss.SSS");
        return date;
      }),
    memberID: z.string().optional(),
  })
);

const removeIntendedUserSchema = ZodCustomValidator.customRefine(
  z.object({
    unitID: z.string().refine(
      async (data) => {
        if (data != null) {
          return !(await ProductService.validateUnitID(data || null));
        }
        return true;
      },
      { message: "Unit ID does not exists." }
    ),
    ID: z.string().optional(),
    removedAt: z
      .string()
      .optional()
      .refine(
        (str) => {
          try {
            if (str == null) {
              return true;
            }
            const date = new Date(str);
            return !isNaN(date.getTime());
          } catch (error) {
            return false;
          }
        },
        {
          message: "Invalid date format",
        }
      )
      .transform(() => {
        let date = moment().tz("Asia/Kuala_Lumpur").toDate();
        date = format(date, "yyyy-MM-dd HH:mm:ss.SSS");
        return date;
      }),
    memberID: z.string().optional(),
  })
);

const getLotDetailsSchema = ZodCustomValidator.customRefine(
  z.object({
    unitID: z.string().refine(
      async (data) => {
        return !(await ProductService.validateUnitID(data));
      },
      { message: "Unit ID does not exists." }
    ),
  })
);

const editLotSchema = ZodCustomValidator.customRefine(
  z.object({
    unitID: z.string().refine(
      async (data) => {
        return !(await ProductService.validateUnitID(data));
      },
      { message: "Unit ID does not exists." }
    ),
    categoryID: z.enum(["1", "10002"]),
    categoryTypeID: z.number(),
    status: z.enum(["A", "C", "N", "B", "S"]),
    refPrice: z.number().nonnegative(),
    refContinuityFee: z.number().nonnegative(),
    positionX: z.number().positive(),
    positionY: z.number().positive(),
    zone: z.string(),
    row: z.string(),
    areaSize: z.string(),
    createdBy: z.string(),
    hall: z.string().optional(),
    block: z.string().optional(),
    side: z.string().optional(),
    level: z.number().optional(),
  })
)
  .refine(
    async (data) => {
      let existingStatus = await LotService.getLotStatus(data.unitID);

      // Flow:
      // 1. if the request status is same as existing status, return true
      // 2. if different, check if existing status is already sold or booked, if yes, then return false
      // 3. if existing status is not sold or booked, the statement would now check the requested status
      // 4. if requested status is sold or booked, return false as you cannot update status to sold or booked in this API.
      return data.status !== existingStatus
        ? existingStatus !== "S" && existingStatus !== "B" && data.status !== "S" && data.status !== "B"
        : true;
    },
    {
      message: "You cannot change lot status if it is already sold or booked nor change status into sold or booked.",
    }
  )
  .refine(
    async (data) => {
      return !(await LotService.validateLotCategoryType(data.categoryID, data.categoryTypeID));
    },
    {
      message: "Invalid category type ID for for selected category ID",
    }
  )
  .refine(
    async (data) => {
      return !(await LotService.checkIfLotLocationDetailDuplicated(data));
    },
    {
      message: "Another Lot is already using the current exact location of positionX, positionY, zone and row.",
    }
  );

const batchEditLotViewSchema = ZodCustomValidator.customRefine(
  z.object({
    pageNumber: z.number().positive(),
    pageSize: z.number().positive(),
    unitID: z.string().optional(),
    zone: z.string().optional(),
    row: z.string().optional(),
    hall: z.string().optional(),
    block: z.string().optional(),
    side: z.string().optional(),
  })
);

const batchEditLotSchema = ZodCustomValidator.customRefine(
  z.object({
    status: z.enum(["A", "C", "N"]),
    refPrice: z.number().nonnegative(),
    refContinuityFee: z.number().nonnegative(),
    createdBy: z.string(),
    unitID: z.string().optional(),
    zone: z.string().optional(),
    row: z.string().optional(),
    hall: z.string().optional(),
    block: z.string().optional(),
    side: z.string().optional(),
  })
);

class LotController {
  static async AssignIntendedUserToUnit(req, res) {
    let body;
    try {
      body = await createIntendedUserModule.parseAsync(req.body);
      body.memberID = req.MemberID;

      if (body.certFile != null && body.certFile !== ""){
        const uploadRes = await OSS.UploadDeathCert(body, req);

        if (Object.keys(uploadRes).length > 0) {
          body.certFile = uploadRes.deathCertFile;
        }
      }

      await sequelize.transaction(async (transaction) => {
        // await LotService.updateTblUnitIntendedUserStatus(body, req, transaction);
        await LotService.insertToTblUnitIntendedUser(body, req, transaction);
      });
      res.status(200).send({
        Success: true,
        Data: `${body.fullName} is successfully assigned to ${body.unitID}`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async UploadDeathCertificateForLotIntendedUser(req, res){
    let body;
    try {
      body = await uploadCertForLotIntendedUserSchema.parseAsync(req.body);

      if (body.certFile != null && body.certFile !== ""){
        const uploadRes = await OSS.UploadDeathCert(body, req);

        if (Object.keys(uploadRes).length > 0) {
          body.certFile = uploadRes.deathCertFile;
        }
      }

      await LotService.updateDeathCertificateForLotIntendedUser(body, req);

      res.status(200).send({
        Success: true,
        Data: "Death certificate successfully uploaded and updated.",
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async CheckInIntendedUserToUnit(req, res) {
    let body;
    try {
      body = await checkInIntendedUserSchema.parseAsync(req.body);
      body.memberID = req.MemberID;
      await sequelize.transaction(async (transaction) => {
        // await LotService.updateTblUnitIntendedUserStatus(body, req, transaction);
        await LotService.updateTblUnitIntendedUserStatus(
          {
            isCheckIn: true,
            status: true,
            ...body,
          },
          req,
          transaction
        );
      });
      res.status(200).send({
        Success: true,
        Data: `All Selected Intended User is Successfully Checked In to ${body.unitID}`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async RemoveIntendedUserToUnit(req, res) {
    let body;
    try {
      body = await removeIntendedUserSchema.parseAsync(req.body);
      body.memberID = req.MemberID;
      await sequelize.transaction(async (transaction) => {
        // await LotService.updateTblUnitIntendedUserStatus(body, req, transaction);
        await LotService.updateTblUnitIntendedUserStatus(
          {
            status: false,
            ...body,
          },
          req,
          transaction
        );
      });
      res.status(200).send({
        Success: true,
        Data: `All Selected Intended User is Successfully Removed from ${body.unitID}`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async GetLotDetails(req, res) {
    try {
      const body = await getLotDetailsSchema.parseAsync(req.body);
      const result = await LotService.GetLotDetails(body.unitID);

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

  static async EditLotDetails(req, res) {
    try {
      const body = await editLotSchema.parseAsync(req.body);
      await sequelize.transaction(async (transaction) => {
        await LotService.EditLotDetails(body, req, transaction);
      });

      res.status(200).send({
        Success: true,
        Data: `${body.unitID} is successfully updated!`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async GetLotBatchWithCondition(req, res) {
    try {
      const body = await batchEditLotViewSchema.parseAsync(req.body);
      const result = await LotService.getLotListForBatchUpdate(body);

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

  static async BatchEditLotDetailsSimple(req, res) {
    try {
      const body = await batchEditLotSchema.parseAsync(req.body);
      await sequelize.transaction(async (transaction) => {
        await LotService.batchUpdateLotDetails(body, req, transaction);
      });

      res.status(200).send({
        Success: true,
        Data: "ACTION SUCCESSFUL!",
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
}

module.exports = LotController;
