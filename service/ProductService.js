const _ = require("lodash");
const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const QueryHandler = require("../lib/Query/QueryHandler");
const OSS = require("../lib/OSS");
const Log = require("../util/Log");

class ProductService {
  static async getFullProductInfoByProductCode(productCode) {
    return (await QueryHandler.executeQuery(38, {ProductCode: productCode}))[0];
  }
  static async getProductImageByProductID(productID){
    return (await QueryHandler.executeQuery(29, {ProductID: productID}));
  }
  static async getSingleProductCategory(categoryID){
    return (await QueryHandler.executeQuery(37, {ProductCategory: categoryID}));
  }
  static async getFullProductDetailsByProductCode(productCode){
    const productID = await this.getProductIDByProductCode(productCode);

    let product = await QueryHandler.executeQuery(25, {ProductID: productID});
    const productLanguage = await QueryHandler.executeQuery(26, {ProductID: productID});
    const productPackage = await QueryHandler.executeQuery(27, {ProductID: productID});
    const productDisplay = await QueryHandler.executeQuery(28, {ProductID: productID});
    const productImage = await this.getProductImageByProductID(productID);
    const productPricing = await QueryHandler.executeQuery(30, {ProductID: productID});

    product = product.map(p => {
      p.Language = productLanguage || [];
      p.Display = productDisplay || [];
      p.Image = productImage || [];
      p.Pricing = productPricing || [];
      p.Package = productPackage || [];
      return p;
    });

    return product;
  }
  static async getProductDetailsForDisplay(body){
    body.ProductID = await this.getProductIDByProductCode(body.ProductCode);

    let product = await QueryHandler.executeQuery(31, body);
    const productImage = await QueryHandler.executeQuery(32, body);

    product = product.map(p => {
      p.Image = productImage || [];
      return p;
    })
  }
  static async getProductIDByProductCode(productCode) {
    return (await QueryHandler.executeQuery(19, {ProductCode: productCode}))[0]?.ID;
  }
  static async getProductDisplaysByProductID(productID){
    return (await QueryHandler.executeQuery(28, {ProductID: productID}));
  }
  static async getProductImageByProductID(productID){
    return (await QueryHandler.executeQuery(29, {ProductID: productID}));
  }
  static async getValidProductCategoryList(){
    return (await QueryHandler.executeQuery(34, NULL));
  }
  static async getFullProductCategoryList(){
    return (await QueryHandler.executeQuery(35, NULL));
  }
  static async getProductList(body) {
    const result = await QueryHandler.executeQuery(24, body);
    const totalCount = await QueryHandler.executeQuery(40, body);
    return { data: result, totalRows: totalCount[0].Total };
  }
  static async insertTblProduct(body, req, t = null) {
    return (await QueryHandler.executeQuery(11, body, "INSERT PRODUCT", req, t))[0].RES;
  }
  static async insertTblProductDisplay(body, req, t = null) {
    for (const displayType of body.ProductDisplayType) {
      await QueryHandler.executeQuery(
        15, 
        {
          ProductID: body.ProductID,
          DisplayType: displayType,
          CreatedBy: body.CreatedBy,
        }, 
        "INSERT PRODUCT DISPLAY", req, t
      );
    }
  }
  static async insertTblProductImage(body, req, t = null) {
    for (const productImage of body.ProductImage) {
      await QueryHandler.executeQuery(
        12, 
        {
          ProductID: body.ProductID,
          Sort: productImage.Sort,
          FileUrl: productImage.FileUrl,
          CreatedBy: body.CreatedBy,
        }, 
        "INSERT PRODUCT IMAGE", req, t
      );
    }
  }
  static async insertTblProductPackage(body, req, t = null){
    for (const package of body.ProductPackage) {
      const productID = await this.getProductIDByProductCode(package.ProductCode);
      await QueryHandler.executeQuery(
        17, 
        {
          PackageID: body.ProductID,
          ProductID: productID,
          Quantity: package.Quantity,
          FocQuantity: package.FocQuantity,
          CreatedBy: body.CreatedBy,
        }, 
        "INSERT PRODUCT PACKAGE", req, t
      );
    }
  }
  static async insertTblProductLanguage(body, req, t = null){
    for (const language of body.ProductLanguage) {
      await QueryHandler.executeQuery(
        16, 
        {
          ProductID: body.ProductID,
          ProductName: language.ProductName,
          Description: language.Description,
          Language: language.Language,
          CreatedBy: body.CreatedBy,
        }, 
        "INSERT PRODUCT LANGUAGE", req, t
      );
    }
  }
  static async insertTblProductPricing(body, req, t = null){
    for (const pricing of body.ProductPricing) {
      await QueryHandler.executeQuery(
        13, 
        {
          ProductID: body.ProductID,
          Country: pricing.Country,
          ZoneID: pricing.ZoneID,
          MemberPV: pricing.MemberPV,
          MemberPrice: pricing.MemberPrice,
          RetailPV: pricing.RetailPV,
          RetailPrice: pricing.RetailPrice,
          StartDate: pricing.StartDate,
          CreatedBy: body.CreatedBy,
        }, 
        "INSERT PRODUCT PRICING", req, t
      );

      await QueryHandler.executeQuery(
        14, 
        {
          ProductID: body.ProductID,
          Country: pricing.Country,
          ZoneID: pricing.ZoneID,
          MemberPV: pricing.MemberPV,
          MemberPrice: pricing.MemberPrice,
          RetailPV: pricing.RetailPV,
          RetailPrice: pricing.RetailPrice,
          StartDate: pricing.StartDate,
          CreatedBy: body.CreatedBy,
        }, 
        "INSERT PRODUCT PRICING HISTORY", req, t
      );
    }
  }

  static async insertProduct(data, req, t = null) {
    data.ProductID = await this.insertTblProduct(data, req, t);

    if (data.ProductID == null || data.ProductID === "") {
      throw new Error("Product ID not retrieved after Insert!");
    } else {

      if (data.ProductDisplayType != null && data.ProductDisplayType.length() > 0){
        await this.insertTblProductDisplay(data, req, t);
      }

      if (data.ProductLanguage != null && data.ProductLanguage.length() > 0){
        await this.insertTblProductLanguage(data, req, t);
      }

      if (data.ProductPackage != null && data.ProductPackage.length() > 0){
        await this.insertTblProductPackage(data, req, t);
      }

      if (data.ProductPricing != null && data.ProductPricing.length() > 0) {
        await this.insertTblProductPricing(data, req, t);
      }

      if (data.ProductImage != null && data.ProductImage.length() > 0){
        try {
          for (let imgIndex in data.ProductImage) {
            if (data.ProductImage.hasOwnProperty(imgIndex)) {
              // Prepare the image data for upload
              // if base64 string starts with data:, then it's a valid file base64
              if (data.ProductImage[imgIndex].FileUrl.Contains("data:")){
                const imageData = data.ProductImage[imgIndex].FileUrl;
                const imageUploadBody = {
                  productCode: data.ProductCode,
                  imageIndex: imgIndex,
                  imageBase64: imageData,
                };
                const uploadRes = await OSS.UploadProductImage(imageUploadBody, req);
        
                if (Object.keys(uploadRes).length > 0) {
                    // Assign the returned OSS URL to the respective FileUrl
                    data.ProductImage[imgIndex].FileUrl = uploadRes.productImage;
                    await this.insertTblProductImage(data, req, t);
                }
              }
            }
          }
        }
        catch (error){
          await OSS.deleteFolder("Product/" + data.ProductCode, req); 
          //throw the error to controller
          throw new Error(error);
        }
      }
    }

    return data.ProductCode;
  }

  static async insertNewProductCategory(data, req){
    await QueryHandler.executeQuery(33, data, "CREATE NEW PRODUCT CATEGORY", req);
  }

  static async updateProduct(data, req){
    await QueryHandler.executeQuery(18, data, "UPDATE PRODUCT", req);
  }

  static async updateProductDisplay(data, req, t = null){
    data.ProductID = await this.getProductIDByProductCode(data.ProductCode);

    await QueryHandler.executeQuery(22, data, "REMOVE OLD PRODUCT DISPLAY TYPES", req, t);

    if (data.ProductDisplayType != null && data.ProductDisplayType.length() > 0){
      if (Array.isArray(data.ProductDisplayType) && data.ProductDisplayType.length > 0){
        await this.insertTblProductDisplay(data, req, t);
      }
    }
  }

  static async updateProductImage(data, req){  
    data.ProductID = await this.getProductIDByProductCode(data.ProductCode);
    await QueryHandler.executeQuery(23, data, "REMOVE OLD PRODUCT IMAGES", req, t);

    if (data.ProductImage != null && data.ProductImage.length() > 0){
      try {
        for (let imgIndex in data.ProductImage) {
          if (data.ProductImage.hasOwnProperty(imgIndex)) {
            // Prepare the image data for upload
            // if base64 string starts with data:, then it's a valid file base64
            if (data.ProductImage[imgIndex].FileUrl.Contains("data:")){
              const imageData = data.ProductImage[imgIndex].FileUrl;
              const imageUploadBody = {
                productCode: data.ProductCode,
                imageIndex: imgIndex,
                imageBase64: imageData,
              };
              const uploadRes = await OSS.UploadProductImage(imageUploadBody, req);
      
              if (Object.keys(uploadRes).length > 0) {
                  // Assign the returned OSS URL to the respective FileUrl
                  data.ProductImage[imgIndex].FileUrl = uploadRes.productImage;
                  await this.insertTblProductImage(data, req, t);
              }
            }
          }
        }
      }
      catch (error){
        await OSS.deleteFolder("Product/" + data.ProductCode, req); 
        //throw the error to controller
        throw new Error(error);
      }
    }
  }

  static async updateProductPricingByProductID(data, req, t = null){
    data.ProductID = await this.getProductIDByProductCode(data.ProductCode);

    await QueryHandler.executeQuery(20, data, "REMOVE OLD PRODUCT PRICING BY PRODUCT ID", req, t);

    if (data.ProductPricing == null || data.ProductPricing.length() < 0){
      throw new Error("Product Pricing request body cannot be empty!");
    }
    else {
      if (Array.isArray(data.ProductPricing) && data.ProductPricing.length > 0){
        await this.insertTblProductPricing(data, req, t);
      }
    }
  }

  static async updateSingleProductPricingByCountry(data, req, t = null){
    data.ProductID = await this.getProductIDByProductCode(data.ProductCode);
    await QueryHandler.executeQuery(21, data, "UPDATE PRODUCT SINGLE PRICING BASED ON GIVEN COUNTRY", req, t);
  }

  static async updateProductCategory(data, req){
    await QueryHandler.executeQuery(36, data, "UPDATE PRODUCT CATEGORY", req);
  }
}
module.exports = ProductService;
