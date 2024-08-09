const _ = require("lodash");
const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const QueryHandler = require("../lib/Query/QueryHandler");
const OSS = require("../lib/OSS");
const Log = require("../util/Log");

class ProductService {
  static async getFullProductInfoByProductCode(ProductCode) {
    return (await QueryHandler.executeQuery('PG010', {ProductCode}));
  }
  static async getProductImageByProductID(ProductID){
    return (await QueryHandler.executeQuery('PG006', {ProductID}));
  }
  static async getSingleProductCategory(ProductCategory){
    return (await QueryHandler.executeQuery('PCA005', {ProductCategory}))?.[0];
  }
  static async getFullProductDetailsByProductCode(productCode){
    const ProductID = await this.getProductIDByProductCode(productCode);

    let product = (await QueryHandler.executeQuery('PG002', {ProductID}))[0];
    const productLanguage = await QueryHandler.executeQuery('PG003', {ProductID});
    const productPackage = await QueryHandler.executeQuery('PG004', {ProductID});
    const productDisplay = await QueryHandler.executeQuery('PG005', {ProductID});
    const productImage = await this.getProductImageByProductID(ProductID);
    const productPricing = await QueryHandler.executeQuery('PG007', {ProductID});

    product.Language = productLanguage || [];
    product.Display = productDisplay.map(row => row.DisplayType) || [];
    product.Image = productImage || [];
    product.Pricing = productPricing || [];
    product.Package = productPackage || [];

    return product;
  }
  static async getProductDetailsForDisplay(body){
    body.ProductID = await this.getProductIDByProductCode(body.ProductCode);

    let product = (await QueryHandler.executeQuery(31, body))[0];
    const productImage = await QueryHandler.executeQuery(32, body);
    product.Image = productImage || [];

    return product;
  }
  static async getProductIDByProductCode(ProductCode) {
    return (await QueryHandler.executeQuery('PG008', {productCode}))?.[0]?.ID;
  }
  static async getProductDisplaysByProductID(ProductID){
    return (await QueryHandler.executeQuery('PG009', {ProductID}));
  }
  static async getValidProductCategoryList(){
    return (await QueryHandler.executeQuery('PCA002', []));
  }
  static async getFullProductCategoryList(){
    return (await QueryHandler.executeQuery('PCA003', []));
  }
  static async getProductList(body) {
    const result = await QueryHandler.executeQuery('PL001', body);
    const totalCount = await QueryHandler.executeQuery('PL002', body);

    return { data: result, totalRows: totalCount[0].Total };
  }
  static async insertTblProduct(body, req, t = null) {
    return (await QueryHandler.executeQuery('PC001', body, req, t))?.[0]?.RES;
  }
  static async insertTblProductDisplay(body, req, t = null) {
    for (const displayType of body.ProductDisplayType) {
      await QueryHandler.executeQuery(
        'PC004', 
        {
          ProductID: body.ProductID,
          DisplayType: displayType,
          CreatedBy: body.CreatedBy,
        }, 
        req, t
      );
    }
  }
  static async insertTblProductImage(body, req, t = null) {
    for (const productImage of body.ProductImage) {
      await QueryHandler.executeQuery(
        'PC002', 
        {
          ProductID: body.ProductID,
          Sort: productImage.Sort,
          FileUrl: productImage.FileUrl,
          CreatedBy: body.CreatedBy,
        }, 
        req, t
      );
    }
  }
  static async insertTblProductPackage(body, req, t = null){
    for (const pack of body.ProductPackage) {
      const productID = await this.getProductIDByProductCode(pack.ProductCode);
      await QueryHandler.executeQuery(
        'PC006', 
        {
          PackageID: body.ProductID,
          ProductID: productID,
          Quantity: pack.Quantity,
          FocQuantity: pack.FocQuantity,
          CreatedBy: body.CreatedBy,
        }, 
        req, t
      );
    }
  }
  static async insertTblProductLanguage(body, req, t = null){
    for (const language of body.ProductLanguage) {
      await QueryHandler.executeQuery(
        'PC005', 
        {
          ProductID: body.ProductID,
          ProductName: language.ProductName,
          Description: language.Description || null,
          Language: language.Language,
          CreatedBy: body.CreatedBy,
        }, 
        req, t
      );
    }
  }
  static async insertTblProductPricing(body, req, t = null){
    for (const pricing of body.ProductPricing) {
      await QueryHandler.executeQuery(
        'PC003', 
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
        req, t
      );

      await QueryHandler.executeQuery(
        'PC003A', 
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
        req, t
      );
    }
  }

  static async insertProduct(data, req, t = null) {
    data.ProductID = await this.insertTblProduct(data, req, t);

    if (data.ProductID == null || data.ProductID === ""){
      throw new Error("New Product ID failed to be retrieved. Please contact customer support.");
    } else {
      if (data.ProductDisplayType != null && data.ProductDisplayType.length > 0){
        await this.insertTblProductDisplay(data, req, t);
      }

      if (data.ProductLanguage != null && data.ProductLanguage.length > 0){
        await this.insertTblProductLanguage(data, req, t);
      }

      if (data.ProductPackage != null && data.ProductPackage.length > 0){
        await this.insertTblProductPackage(data, req, t);
      }

      if (data.ProductPricing != null && data.ProductPricing.length > 0) {
        await this.insertTblProductPricing(data, req, t);
      }

      if (data.ProductImage != null && data.ProductImage.length > 0){
        try {
          for (let imgIndex in data.ProductImage) {
            if (data.ProductImage.hasOwnProperty(imgIndex)) {
              // Prepare the image data for upload
              // if base64 string starts with data:, then it's a valid file base64
              if (data.ProductImage[imgIndex].FileUrl.includes("data:")){
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
              else {
                throw new Error("Invalid FileUrl format. Please insert base64 formatted string with 'data:[fileType]/[Extension];' format to ensure valid file upload.");
              }
            }
          }
        }
        catch (error){
          await OSS.deleteFolder("Product/" + data.ProductCode, req); 
          throw new Error(error);
        }
      }
    }

    return data.ProductCode;
  }

  static async insertNewProductCategory(data, req){
    await QueryHandler.executeQuery('PCA001', data, req);
  }

  static async updateProduct(data, req){
    await QueryHandler.executeQuery('PU001', data, req);
  }

  static async updateProductDisplay(data, req, t = null){
    data.ProductID = await this.getProductIDByProductCode(data.ProductCode);

    await QueryHandler.executeQuery('PU004', data, req, t);

    if (data.ProductDisplayType != null && data.ProductDisplayType.length > 0){
      if (Array.isArray(data.ProductDisplayType) && data.ProductDisplayType.length > 0){
        await this.insertTblProductDisplay(data, req, t);
      }
    }
  }

  static async updateProductImage(data, req){  
    data.ProductID = await this.getProductIDByProductCode(data.ProductCode);
    await QueryHandler.executeQuery('PU005', data, req);

    if (data.ProductImage != null && data.ProductImage.length > 0){
      try {
        for (let imgIndex in data.ProductImage) {
          if (data.ProductImage.hasOwnProperty(imgIndex)) {
            // Prepare the image data for upload
            // if base64 string starts with data:, then it's a valid file base64
            if (data.ProductImage[imgIndex].FileUrl.includes("data:")){
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
                  await this.insertTblProductImage(data, req);
              }
            }
            else {
              throw new Error("Invalid FileUrl format. Please insert base64 formatted string with 'data:[fileType]/[Extension];' format to ensure valid file upload.");
            }
          }
        }
      }
      catch (error){
        await OSS.deleteObject("Product/" + data.ProductCode, req); 
        //throw the error to controller
        throw new Error(error);
      }
    }
  }

  static async updateProductPricingByProductID(data, req, t = null){
    data.ProductID = await this.getProductIDByProductCode(data.ProductCode);

    await QueryHandler.executeQuery('PU002', data, req, t);

    if (data.ProductPricing == null || data.ProductPricing.length < 0){
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
    await QueryHandler.executeQuery('PU003', data, req, t);
  }

  static async updateProductCategory(data, req){
    await QueryHandler.executeQuery('PCA004', data, req);
  }
}
module.exports = ProductService;
