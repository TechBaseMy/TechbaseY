"use strict";
const captureError = require("../lib/ErrorHandler/CaptureError");
const Models = require("../models");
const { z } = require("zod");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const ZodCustomValidator = require("../util/ZodCustomValidator");
const OSS = require("../lib/OSS");
const Util = require("../util/Util");
const { ValidateUser } = require("../lib/JWT");
const ProductService = require("../service/ProductService");
const MemberService = require("../service/MemberService");
const UtilService = require("../service/UtilService");

const createProductSchema = ZodCustomValidator.customRefine(
  z.object({
    productID: z.string().optional(),
    productCode: z.string().refine(
      async (productCode) => {
        return await ProductService.validateProductCode(productCode);
      },
      { message: "This product code already exists." }
    ),
    productName: z.string(),
    productCategory: z.string().refine(
      async (category) => {
        return (await ProductService.getValidProductCategoryList(false)).map((cat) => cat.Value).includes(category);
      },
      { message: "Invalid product category." }
    ),
    productType: z.string().refine(
      async (type) => {
        const parameterList = await UtilService.getParameterValue("ProductType");
        return parameterList.map((parameter) => parameter.ParameterValue).includes(type);
      },
      { message: "Invalid product type." }
    ),
    productPrice: z.number().nonnegative().default(0),
    productDisplayType: z.array(z.string()).refine(
      async (displayTypes) => {
        const validDisplayTypes = await ProductService.getValidProductDisplayType();
        return displayTypes.every((type) => validDisplayTypes.map((t) => t.Value).includes(type));
      },
      { message: "One or more invalid product display types." }
    ),
    imageName: z.string().optional(),
    imageLink: z.string().optional(),
    createdBy: z.string(),
  })
);

const getProductListSchema = ZodCustomValidator.customRefine(
  z.object({
    pageNumber: z.number().positive(),
    pageSize: z.number().positive(),
    productStatus: z
      .string()
      .optional()
      .refine(
        async (stat) => {
          return stat != null ? stat === "0" || stat === "1" : true;
        },
        { message: "Product status value if not empty, must be either 0 (Inactive) or 1 (Active)." }
      ),
    salesType: z
      .union([z.number(), z.array(z.number())])
      .optional()
      .default(0),
    productType: z
      .union([z.number(), z.array(z.number())])
      .optional()
      .default(0),
    productCategory: z
      .union([z.number(), z.array(z.number())])
      .optional()
      .default(0),
  })
);

const getProductDetailSchema = ZodCustomValidator.customRefine(
  z.object({
    productCode: z.string(),
  })
);

const getFloorPlanListSchema = ZodCustomValidator.customRefine(
  z.object({
    pageNumber: z.number().positive(),
    pageSize: z.number().positive(),
    unitStatus: z.string().optional(),
    displayStatus: z.string().optional(),
    unitID: z.string().optional(),
    zone: z.string().optional(),
    row: z.string().optional(),
    hall: z.string().optional(),
    block: z.string().optional(),
    side: z.string().optional(),
    resident: z.object({
      fullName: z.string().optional(),
      chineseName: z.string().optional(),
      ic: z.string().optional(),
      relationship: z.string().optional(),
      gender: z.string().optional()
    }).optional(),
  })
);

const updateProductSchema = ZodCustomValidator.customRefine(
  z.object({
    productCode: z.string().refine(
      async (productCode) => {
        return !(await ProductService.validateProductCode(productCode));
      },
      { message: "This product code does not exists." }
    ),
    productName: z.string(),
    productCategory: z.string().refine(
      async (category) => {
        return (await ProductService.getValidProductCategoryList(false)).map((cat) => cat.Value).includes(category);
      },
      { message: "Invalid product category." }
    ),
    productType: z.string().refine(
      async (type) => {
        const parameterList = await UtilService.getParameterValue("ProductType");
        return parameterList.map((parameter) => parameter.ParameterValue).includes(type);
      },
      { message: "Invalid product type." }
    ),
    productPrice: z.number().nonnegative().default(0),
    isActive: z.boolean().default(false),
    createdBy: z.string(),
  })
);

const updateProductDisplaySchema = ZodCustomValidator.customRefine(
  z.object({
    productID: z.string().optional(),
    productCode: z.string().refine(
      async (productCode) => {
        return !(await ProductService.validateProductCode(productCode));
      },
      { message: "This product code does not exists." }
    ),
    productDisplayType: z.array(z.number())
    .refine(
      (displayTypes) => {
        return displayTypes.length > 0;
      },
      { message: "product display type cannot be empty!" }
    )
    .refine(
      async (displayTypes) => {
        const validDisplayTypes = await ProductService.getValidProductDisplayType();
        return displayTypes.every((type) => validDisplayTypes.map((t) => Number(t.Value)).includes(type));
      },
      { message: "One or more invalid product display types." }
    ),
    removedDisplay: z.array(z.number()).optional(),
    createdBy: z.string(),
  })
)
.transform(
  async (data) => {
    data.productID = (await ProductService.getProductIDByProductCode(data.productCode));
    return data;
  }
)
.transform(
  async (data) => {
    let existingDisplay = (await ProductService.getProductDisplaysByProductCode(data.productCode));
    data.removedDisplay = existingDisplay.filter((item) => !data.productDisplayType.includes(item));
    data.productDisplayType = data.productDisplayType.filter((item) => !existingDisplay.includes(item));
    return data;
  }
);

const updateProductImageSchema = ZodCustomValidator.customRefine(
  z.object({
    productID: z.string().optional(),
    productCode: z.string().refine(
      async (productCode) => {
        return !(await ProductService.validateProductCode(productCode));
      },
      { message: "This product code does not exists." }
    ),
    imageName: z.string().optional(),
    imageLink: z.string().optional(),
    createdBy: z.string(),
  })
)
.transform(
  async (data) => {
    data.productID = (await ProductService.getProductIDByProductCode(data.productCode));
    return data;
  }
);

class ProductController {
  static async GetFloorPlan(req, res) {
    try {
      const mainResult = await ProductService.getFloorPlan();

      const groupedByZone = mainResult.reduce((acc, unit) => {
        const { ZoneX, PositionX } = unit;
        if (!acc[ZoneX]) {
          acc[ZoneX] = {};
        }
        if (!acc[ZoneX][PositionX]) {
          acc[ZoneX][PositionX] = [];
        }
        acc[ZoneX][PositionX].push(unit);
        return acc;
      }, {});
      for (const zone in groupedByZone) {
        for (const posX in groupedByZone[zone]) {
          groupedByZone[zone][posX].sort((a, b) => a.PositionY - b.PositionY);
        }
      }
      res.status(200).send({
        Success: true,
        Data: groupedByZone,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async GetFloorPlanList(req, res) {
    try {
      const body = await getFloorPlanListSchema.parseAsync(req.body);
      const { data, totalRows } = await ProductService.getFloorPlanList(body);

      const groupedUnits = data.map( row => ({...row, IntendedUsers: JSON.parse(row.IntendedUsers)}))

      res.status(200).send({
        Success: true,
        Data: { data: groupedUnits, totalRows },
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async GetBookingList(req, res) {
    try {
      const query = `
        SELECT UC.UnitID, S.MemberId AS 'AgentID', M1.Fullname AS 'PurchaseName', S.TotalPV, S.TotalPrice, 
        S.SalesDate AS 'ReceiveDate', ISNULL(CONVERT(varchar, S.BookingExpiry, 105), '-') AS 'BookingExpiry', ISNULL(CONVERT(varchar, R.RefundDate, 105), '-') AS 'RefundDate',
        ISNULL(S.RejectedReasons, '-') AS 'RejectedReasons', S.StatusX, ISNULL(S.MailToPurchaserID, '-') AS 'MailToPurchaserID', ISNULL(IU.DeathCertificateUrl, '-') AS 'DeathCertificateUrl'
        FROM tbl_UnitCollection UC WITH (NOLOCK)
        LEFT JOIN tbl_Sales S WITH (NOLOCK)
        ON UC.ActiveBookingID = S.SalesId AND S.IsDeleted = 0
        LEFT JOIN tbl_MemberInfo M1 WITH (NOLOCK) 
        ON M1.MemberId = S.PurchaserID AND M1.IsDeleted = 0
        LEFT JOIN tbl_Unit_IntendedUser IU WITH (NOLOCK) 
        ON IU.UnitID = UC.UnitID AND IU.StatusX = 1
        LEFT JOIN tbl_Refund R WITH (NOLOCK)
        ON R.RelateSalesID = S.SalesId AND R.IsDeleted = 0
        WHERE UC.IsDeleted = 0 AND UC.UnitStatusX = 'B' OR UC.DisplayStatusX = 'B';
      `;
      const result = await sequelize.query(query, {
        replacements: {},
        type: Sequelize.QueryTypes.SELECT,
      });

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

  static async createProduct(req, res) {
    let productCode;
    try {
      const body = await createProductSchema.parseAsync(req.body);
      productCode = body.productCode;

      if (body.imageLink != null && body.imageLink !== "") {
        const uploadRes = await OSS.UploadProductImage(body, req);

        if (Object.keys(uploadRes).length > 0) {
          body.imageLink = uploadRes.productImage;
        }
      }

      await sequelize.transaction(async (transaction) => {
        await ProductService.insertProduct(body, req, transaction);
      });
      res.status(200).send({
        Success: true,
        Data: `${body.productCode} product is successfully created`,
      });
    } catch (error) {
      await OSS.deleteFolder("Product/" + productCode, req);
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async getProductList(req, res) {
    try {
      const body = await getProductListSchema.parseAsync(req.body);
      const result = await ProductService.getProductList(body);

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

  static async getProductDetail(req, res) {
    try {
      const body = await getProductDetailSchema.parseAsync(req.body);
      const result = await ProductService.getProductDetailsByProductCode(body.productCode);

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

  static async getProductCreationSetup(req, res) {
    try {
      // Fetch data from the services
      const [categories, types, displayTypes] = await Promise.all([
        ProductService.getValidProductCategoryList(false),
        ProductService.getValidProductTypeList(),
        ProductService.getValidProductDisplayType(),
      ]);

      // Structure the result
      const result = {
        categories,
        types,
        displayTypes,
      };

      // Send the response
      res.status(200).send({
        Success: true,
        Data: result,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
    }
  }

  static async UpdateProductBasic(req, res){
    try {
      const body = await updateProductSchema.parseAsync(req.body);
      await ProductService.updateProduct(body, req);
      
      res.status(200).send({
        Success: true,
        Data: `${body.productCode} product is successfully updated`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async UpdateProductDisplay(req, res){
    try {
      const body = await updateProductDisplaySchema.parseAsync(req.body);
      await ProductService.updateProductDisplay(body, req);

      res.status(200).send({
        Success: true,
        Data: `Display for ${body.productCode} is successfully updated`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async UpdateProductImage(req, res){
    try {
      const body = await updateProductImageSchema.parseAsync(req.body);

      if (body.imageLink != null && body.imageLink !== "") {
        if (!body.imageLink.includes("https")){
          const uploadRes = await OSS.UploadProductImage(body, req);

          if (Object.keys(uploadRes).length > 0) {
            body.imageLink = uploadRes.productImage;
          }
        }
      }

      await ProductService.updateProductImage(body, req);

      res.status(200).send({
        Success: true,
        Data: `Image for ${body.productCode} is successfully updated`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
}
module.exports = ProductController;
