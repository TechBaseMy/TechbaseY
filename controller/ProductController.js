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
const MemberService = require("../service/MemberService");
const UtilService = require("../service/UtilService");

class ProductController {
  static async createProduct(req, res) {
    try {
      const body = req.body;

      await sequelize.transaction(async (transaction) => {
        await ProductService.insertProduct(body, req, transaction);
      });

      res.status(200).send({
        Success: true,
        Data: `${body.ProductCode} product is successfully created`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async CreateNewProductCategory(req, res) {
    try {
      const body = req.body;
      await ProductService.insertNewProductCategory(body, req);

      res.status(200).send({
        Success: true,
        Data: `New product category is successfully inserted.`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async GetProductList(req, res) {
    try {
      const body = req.body;
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

  static async GetFullProductDetail(req, res) {
    try {
      const body = req.body;
      const result = await ProductService.getFullProductDetailsByProductCode(
        body.ProductCode
      );

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

  static async GetSimpleProductDetail(req, res) {
    try {
      const body = req.body;
      const result = await ProductService.getProductDetailsForDisplay(body);

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

  static async GetValidProductCategoryList(req, res) {
    try {
      const result = await ProductService.getValidProductCategoryList();
      // Send the response
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

  static async GetFullProductCategoryList(req, res) {
    try {
      const result = await ProductService.getFullProductCategoryList();
      // Send the response
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

  static async GetSingleProductCategory(req, res) {
    try {
      const body = req.body;
      const result = await ProductService.getSingleProductCategory(
        body.ProductCategory
      );
      // Send the response
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

  static async UpdateProductBasic(req, res) {
    try {
      const body = req.body;
      await ProductService.updateProduct(body, req);

      res.status(200).send({
        Success: true,
        Data: `${body.ProductCode} product is successfully updated`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async UpdateProductDisplay(req, res) {
    try {
      const body = req.body;
      await ProductService.updateProductDisplay(body, req);

      res.status(200).send({
        Success: true,
        Data: `Displays for ${body.ProductCode} is successfully updated`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async UpdateProductImage(req, res) {
    try {
      const body = req.body;
      await ProductService.updateProductImage(body, req);

      res.status(200).send({
        Success: true,
        Data: `Images for ${body.ProductCode} is successfully updated`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async UpdateProductPricingByProductCode(req, res) {
    try {
      const body = req.body;

      await sequelize.transaction(async (transaction) => {
        await ProductService.updateProductPricingByProductID(
          body,
          req,
          transaction
        );
      });

      res.status(200).send({
        Success: true,
        Data: `Pricing for ${body.ProductCode} is successfully updated`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async UpdateProductPricingForCertainCountry(req, res) {
    try {
      const body = req.body;

      await sequelize.transaction(async (transaction) => {
        await ProductService.updateSingleProductPricingByCountry(
          body,
          req,
          transaction
        );
      });

      res.status(200).send({
        Success: true,
        Data: `Pricing of product ${body.ProductCode} in this given country has been successfully updated`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }

  static async UpdateProductCategory(req, res) {
    try {
      const body = req.body;
      await ProductService.updateProductCategory(body, req);

      res.status(200).send({
        Success: true,
        Data: `This product category is successfully updated`,
      });
    } catch (error) {
      console.error("Error:", error.message);
      console.error("Stack Trace:", error.stack);
      captureError(error, res);
    }
  }
}
module.exports = ProductController;
