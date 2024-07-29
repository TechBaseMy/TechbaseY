"use strict";
const captureError = require("../lib/ErrorHandler/CaptureError");
const Models = require("../models");
const { z, optional } = require("zod");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const ZodCustomValidator = require("../util/ZodCustomValidator");
const Util = require("../util/Util");
const AnnouncementService = require("../service/AnnouncementService");
const { format } = require("date-fns-tz");
const moment = require("moment-timezone");
const OSS = require("../lib/OSS");

const addAnnouncementSchema = ZodCustomValidator.customRefine(
  z.object({
    title: z.string(),
    startDisplayDate: z
      .string()
      .refine(
          (str) => {
          try {
              const date = new Date(str);
              return !isNaN(date.getTime());
          } catch (error) {
              return false;
          }
          },
          {
              message: "Invalid date format on startDisplayDate",
          }
      )
      .transform(
        (str) => {
          let date = moment().tz("Asia/Kuala_Lumpur").toDate();
          if (str != null && str !== ""){
            date = moment.tz(str, "Asia/Kuala_Lumpur").toDate();
          }
          date = format(date, "yyyy-MM-dd HH:mm:ss.SSS");
          return date;
      }),
    expireDate: z
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
          message: "Invalid date format on expireDate",
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
    isHidden: z.boolean().default(false),
    sort: z.number().nonnegative(),
    createdBy: z.string(),
    content: z.string(),
    imgName: z.string().optional(),
    img: z.string().optional(),
  })
);

const editAnnouncementSchema = ZodCustomValidator.customRefine(
  z.object({
    announcementID: z.string().refine(
      async (data) => {
        return !(await AnnouncementService.validateAnnouncementID(data)); 
      },
      {
        message: "Invalid announcement!",
      }
    ),
    title: z.string(),
    startDisplayDate: z
      .string()
      .refine(
        (str) => {
        try {
            const date = new Date(str);
            return !isNaN(date.getTime());
        } catch (error) {
            return false;
        }
        },
        {
            message: "Invalid date format on startDisplayDate",
        }
      )
      .transform(
        (str) => {
          if (str != null && str !== ""){
            let date = moment.tz(str, "Asia/Kuala_Lumpur").toDate();
            date = format(date, "yyyy-MM-dd HH:mm:ss.SSS");
            return date;
          }
          else {
            return str;
          }
      }),
    expireDate: z
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
          message: "Invalid date format on expireDate",
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
    isHidden: z.boolean().default(false),
    sort: z.number().nonnegative(),
    createdBy: z.string(),
    content: z.string(),
    imgName: z.string().optional(),
    img: z.string().optional(),
  })
);

const announcementListFilterSchema = ZodCustomValidator.customRefine(
  z.object({
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
    title: z.string().optional(),
    displayStatus: z.enum(["0", "1"]).optional(),
    pageNumber: z.number().positive(),
    pageSize: z.number().positive(),
  })
);

const announcementDetailsSchema = ZodCustomValidator.customRefine(
  z.object({
    announcementID: z.string().refine(
      async (data) => {
        return !(await AnnouncementService.validateAnnouncementID(data)); 
      },
      {
        message: "Invalid announcement!",
      }
    ),
  })
);

const deleteAnnouncementSchema = ZodCustomValidator.customRefine(
  z.object({
    announcementID: z.string().refine(
      async (data) => {
        return !(await AnnouncementService.validateAnnouncementID(data)); 
      },
      {
        message: "Invalid announcement!",
      }
    ),
    updatedBy: z.string(),
  })
);

class AnnouncementController {
  static async AddAnnouncement(req, res){
    try {
      const body = await addAnnouncementSchema.parseAsync(req.body);

      if (body.img != null && body.img !== "") {
        const uploadRes = await OSS.UploadAnnouncementImage(body, req);

        if (Object.keys(uploadRes).length > 0) {
          body.img = uploadRes.announcementImage;
        }
      }

      await sequelize.transaction(async (transaction) => {
        await AnnouncementService.addAnnouncement(body, req, transaction);
      });

      res.status(200).send({
        Success: true,
        Data: "New announcement successfully inserted",
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async EditAnnouncement(req, res){
    try {
      const body = await editAnnouncementSchema.parseAsync(req.body);

      if (body.img != null && body.img !== "") {
        if (!body.img.includes("https")){
          const uploadRes = await OSS.UploadAnnouncementImage(body, req);

          if (Object.keys(uploadRes).length > 0) {
            body.img = uploadRes.announcementImage;
          }
        }
      }

      await AnnouncementService.editAnnoucement(body, req);
      
      res.status(200).send({
        Success: true,
        Data: `Announcement with ID of ${body.announcementID} is successfully updated`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async DeleteAnnouncement(req, res){
    try {
      const body = await deleteAnnouncementSchema.parseAsync(req.body);
      await AnnouncementService.deleteAnnouncement(body, req);

      res.status(200).send({
        Success: true,
        Data: `Announcement with ID of ${body.announcementID} is successfully deleted`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async GetAnnouncementDetails(req, res){
    try {
      const body = await announcementDetailsSchema.parseAsync(req.body);
      const result = await AnnouncementService.getAnnouncementDetails(body.announcementID);

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

  static async GetAnnouncementList(req, res){
    try {
      const body = await announcementListFilterSchema.parseAsync(req.body);
      const result = await AnnouncementService.getAnnouncementList(body);

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
}
module.exports = AnnouncementController;