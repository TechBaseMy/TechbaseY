const _ = require("lodash");
const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const Log = require("../util/Log");

class ProductService {
  static async getProductByProductCode(productCode) {
    const query = `
      SELECT TOP 1 * FROM tbl_Product WHERE ProductCode = :productCode AND IsDeleted = 0;
    `;
    const result = await sequelize.query(query, {
      replacements: { productCode: productCode },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0];
  }
  static async getProductDetailsByProductCode(productCode) {
    const query = `
    DECLARE @WAREHOUSE NVARCHAR(50) = N'W000001';
    SELECT 
      p.ID, p.ProductCode, p.ProductName, p.ProductCategoryID, p.ProductType as 'ProductTypeID',
      ISNULL(pc.CategoryName, '-') AS 'ProductCategoryName',
      ISNULL(pa.ParameterName, '-') AS 'ProductType', 
      CASE WHEN p.StatusX = '1' THEN 'ACTIVE' ELSE 'INACTIVE' END AS 'ProductStatus',
      ISNULL(st.StockQuantity, 0) AS 'Quantity', CONVERT(DECIMAL(18,2), ISNULL(p.Price, 0)) AS 'Price'
    FROM tbl_Product p WITH (NOLOCK)
    LEFT JOIN tbl_ProductDisplay pd WITH (NOLOCK) ON pd.IsDeleted = 0 AND pd.ProductID = p.ID
    LEFT JOIN tbl_ProductImage pim WITH (NOLOCK) ON pim.IsDeleted = 0 AND pim.ProductID = p.ID
    LEFT JOIN tbl_Product_Category pc WITH (NOLOCK) ON pc.IsDeleted = 0 AND pc.CategoryStatus = 'A' AND pc.ID = p.ProductCategoryID
    LEFT JOIN tbl_Parameter pa WITH (NOLOCK) ON pa.Category = 'ProductType' AND pa.ParameterValue = p.ProductType
    OUTER APPLY (
      SELECT
        SUM(ISNULL((CASE WHEN s.ToId = @WAREHOUSE THEN s.StockQuantity ELSE -(s.StockQuantity) END), 0)) AS 'StockQuantity'
      FROM tbl_Stock s WITH (NOLOCK)
      WHERE (s.ToId = @WAREHOUSE OR s.MemberID = @WAREHOUSE) AND s.IsDeleted = 0 AND s.ProductCode = p.ProductCode
    ) st 
    WHERE p.IsDeleted = 0 
      AND p.StatusX = 1
      AND p.ProductCode = :productCode
    `;
    const result = await sequelize.query(query, {
      replacements: { productCode: productCode },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0];
  }
  static async getProductIDByProductCode(productCode) {
    const query = `
      SELECT TOP 1 ID FROM tbl_Product WHERE ProductCode = :productCode AND IsDeleted = 0;
    `;
    const result = await sequelize.query(query, {
      replacements: { productCode: productCode },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.ID;
  }
  static async getProductDisplaysByProductCode(productCode){
    const query = `
      SELECT pd.ProductDisplayType 
      FROM tbl_Product p WITH (NOLOCK) 
      INNER JOIN tbl_ProductDisplay pd WITH (NOLOCK) ON pd.IsDeleted = 0 AND pd.ProductID = p.ID
      WHERE p.ProductCode = :productCode AND p.IsDeleted = 0;
    `;
    const result = await sequelize.query(query, {
      replacements: { productCode: productCode },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result.map(row => row.ProductDisplayType);
  }
  static async getProductImageByProductCode(productCode){
    const query = `
      SELECT TOP 1 pi.ImageLink 
      FROM tbl_Product p WITH (NOLOCK) 
      INNER JOIN tbl_ProductImage pi WITH (NOLOCK) ON pi.IsDeleted = 0 AND pi.ProductID = p.ID
      WHERE p.ProductCode = :productCode AND p.IsDeleted = 0;
    `;
    const result = await sequelize.query(query, {
      replacements: { productCode: productCode },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.ImageLink;
  }
  static async validateUnitID(unitID) {
    const query = `
    SELECT UnitID FROM tbl_UnitCollection WITH (NOLOCK) WHERE IsDeleted = 0 AND UnitID = :unitID
    `;
    const result = await sequelize.query(query, {
      replacements: { unitID: unitID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.UnitID === undefined || result[0]?.UnitID === null;
  }
  static async validateProductCode(productCode) {
    const query = `
    SELECT ProductCode FROM tbl_Product WITH (NOLOCK) WHERE IsDeleted = 0 AND ProductCode = :productCode
    `;
    const result = await sequelize.query(query, {
      replacements: { productCode: productCode },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.ProductCode === undefined || result[0]?.ProductCode === null;
  }
  static async getValidProductCategoryList(isLot) {
    let query;
    if (isLot){
      query = `
      SELECT ID AS 'Value', CategoryName AS 'DisplayName' 
      FROM tbl_Product_Category WITH (NOLOCK) 
      WHERE IsDeleted = 0 AND CategoryStatus = 'A' AND ID IN ('1', '10002')
      ORDER BY CategorySort;
      `;
    }
    else {
      query = `
      SELECT ID AS 'Value', CategoryName AS 'DisplayName' 
      FROM tbl_Product_Category WITH (NOLOCK) 
      WHERE IsDeleted = 0 AND CategoryStatus = 'A' AND ID NOT IN ('1', '10002')
      ORDER BY CategorySort;
      `;
    }
    
    const result = await sequelize.query(query, {
      replacements: {},
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
  static async getValidProductTypeList() {
    const query = `
    SELECT ParameterValue AS 'Value', ParameterName AS 'DisplayName'
    FROM tbl_Parameter WITH (NOLOCK)
    WHERE Category = 'ProductType'
    ORDER BY ParameterValue;
    `;
    const result = await sequelize.query(query, {
      replacement: {},
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
  // since no product will be added manually for registration sales,
  // exclude registration sales in dipslay type
  static async getValidProductDisplayType() {
    const query = `
    SELECT ParameterValue AS 'Value', ParameterName AS 'DisplayName'
    FROM tbl_Parameter WITH (NOLOCK) 
    WHERE Category = 'SalesType' AND ParameterValue <> '1'
    ORDER BY ParameterValue;
    `;
    const result = await sequelize.query(query, {
      replacement: {},
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
  static async getProductList(body) {
    const offset = (body.pageNumber - 1) * body.pageSize;
    const replacements = { offset: offset, pageSize: body.pageSize };

    let query = `
    FROM tbl_Product p WITH (NOLOCK)
    `;

    if (body.salesType != null && body.salesType !== 0) {
      query += `
        INNER JOIN (
        SELECT DISTINCT ProductID
        FROM tbl_ProductDisplay
        WHERE IsDeleted = 0
      `;
      if (Array.isArray(body.salesType)) {
        query += ` AND ProductDisplayType IN (:SalesType)`;
      } else {
        query += ` AND ProductDisplayType = :SalesType`;
      }
      query += `
        ) pd ON pd.ProductID = p.ID
      `;
      replacements.SalesType = body.salesType;
    }

    query += `
    LEFT JOIN tbl_ProductImage pim WITH (NOLOCK) ON pim.IsDeleted = 0 AND pim.ProductID = p.ID
    LEFT JOIN tbl_Product_Category pc WITH (NOLOCK) ON pc.IsDeleted = 0 AND pc.CategoryStatus = 'A' AND pc.ID = p.ProductCategoryID
    LEFT JOIN tbl_Parameter pa WITH (NOLOCK) ON pa.Category = 'ProductType' AND pa.ParameterValue = p.ProductType
    OUTER APPLY (
      SELECT
        SUM(ISNULL((CASE WHEN s.ToId = @WAREHOUSE THEN s.StockQuantity ELSE -(s.StockQuantity) END), 0)) AS 'StockQuantity'
      FROM tbl_Stock s WITH (NOLOCK)
      WHERE (s.ToId = @WAREHOUSE OR s.MemberID = @WAREHOUSE) AND s.IsDeleted = 0 AND s.ProductCode = p.ProductCode
    ) st 
    WHERE p.IsDeleted = 0 
      AND p.StatusX = 1
    `;
    if (body.productStatus != null && body.productStatus !== "") {
      query += `
      AND p.StatusX = :Status
      `;
      replacements.Status = body.productStatus;
    }

    if (body.productType != null && body.productType !== 0) {
      if (Array.isArray(body.productType)) {
        query += ` AND p.ProductType IN (:ProductType)`;
      } else {
        query += ` AND p.ProductType = :ProductType`;
      }
      replacements.ProductType = body.productType;
    }

    if (body.productCategory != null && body.productCategory !== 0) {
      if (Array.isArray(body.productCategory)) {
        query += ` AND p.ProductCategoryID IN (:CategoryID)`;
      } else {
        query += ` AND p.ProductCategoryID = :CategoryID`;
      }
      replacements.CategoryID = body.productCategory;
    }
    const countQuery = `
        DECLARE @WAREHOUSE NVARCHAR(50) = N'W000001';
        SELECT COUNT(*) AS Total
        ${query} 
    `;
    query = `
      DECLARE @WAREHOUSE NVARCHAR(50) = N'W000001';
      SELECT
        p.ID, p.ProductCode, p.ProductName, 
        ISNULL(pc.CategoryName, '-') AS 'ProductCategoryName',
        ISNULL(pa.ParameterName, '-') AS 'ProductType', 
        CASE WHEN p.StatusX = '1' THEN 'ACTIVE' ELSE 'INACTIVE' END AS 'ProductStatus',
        ISNULL(st.StockQuantity, 0) AS 'Quantity', CONVERT(DECIMAL(18,2), ISNULL(p.Price, 0)) AS 'Price'
      ${query}
    `;

    query += `
    ORDER BY p.Id
    OFFSET :offset ROWS
    FETCH NEXT :pageSize ROWS ONLY
    `;
    const result = await sequelize.query(query, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    const totalCount = await sequelize.query(countQuery, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    return { data: result, totalRows: totalCount[0].Total };
  }

  static async getFloorPlan() {
    const query = `
    SELECT UC.UnitID, UCT.UnitType, UC.PositionX, UC.PositionY, UC.ZoneX, UC.RowX, UC.AreaSize, UC.UnitStatusX, UC.DisplayStatusX, UC.ReferencePrice, UC.ReferenceContinuityFee FROM tbl_UnitCollection UC WITH (NOLOCK)
    LEFT JOIN tbl_UnitCategory UCT WITH (NOLOCK)
      ON UC.CategoryID = UCT.CategoryID AND UCT.IsDeleted = 0
    WHERE UC.IsDeleted = 0 
    `;
    const result = await sequelize.query(query, {
      replacements: {},
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
  static async getFloorPlanList(body) {
    const offset = (body.pageNumber - 1) * body.pageSize;
    const replacements = { offset: offset, pageSize: body.pageSize };

    let query = `
      FROM tbl_UnitCollection UC WITH (NOLOCK)
      LEFT JOIN tbl_UnitCategory UCT WITH (NOLOCK)
        ON UC.LotCategoryType = UCT.CategoryID AND UCT.IsDeleted = 0
      WHERE UC.IsDeleted = 0 
    `;

    if (body.unitStatus != null && body.unitStatus !== 0) {
      query += ` AND UC.UnitStatusX = :UnitStatus`;
      replacements.UnitStatus = body.unitStatus;
    }

    if (body.displayStatus != null && body.displayStatus !== 0) {
      query += ` AND UC.DisplayStatusX = :DisplayStatus`;
      replacements.DisplayStatus = body.displayStatus;
    }

    if (body.unitID != null && body.unitID !== "") {
      query += ` AND UC.unitID = :unitID`;
      replacements.unitID = body.unitID;
    }

    if (body.zone != null && body.zone !== "") {
      query += `
        AND UC.ZoneX = :Zone
      `;
      replacements.Zone = body.zone;
    }

    if (body.row != null && body.row !== "") {
      query += `
        AND UC.RowX = :Row
      `;
      replacements.Row = body.row;
    }

    if (body.hall != null && body.hall !== "") {
      query += `
        AND UC.Hall = :Hall
      `;
      replacements.Hall = body.hall;
    }

    if (body.block != null && body.block !== "") {
      query += `
        AND UC.BlockX = :Block
      `;
      replacements.Block = body.block;
    }

    if (body.side != null && body.side !== "") {
      query += `
        AND UC.Side = :Side
      `;
      replacements.Side = body.side;
    }

    let countQuery = `
    SELECT COUNT(*) AS Total
    ${query} 
    `;
    query = `
      SELECT UC.UnitID, UCT.UnitType, UC.PositionX, UC.PositionY, UC.ZoneX, UC.RowX, UC.AreaSize, 
      UC.UnitStatusX, UC.DisplayStatusX, UC.ReferencePrice, UC.ReferenceContinuityFee, UCT.UserCapacity,
      JSON_QUERY(COALESCE((
        SELECT IU.FullName, IU.ChineseName, IU.IC, IU.Relationship, IU.Gender, IU.AssignAt, IU.CheckInAt, IU.ID, IU.DeathCertificateUrl
        FROM tbl_Unit_IntendedUser IU WITH (NOLOCK) 
        WHERE IU.UnitID = UC.UnitID AND IU.IsDeleted = 0 AND IU.StatusX = 1
        FOR JSON PATH
      ), '[]')) AS IntendedUsers
      ${query}
    `;

    if(!_.isEmpty(_.omitBy(body.resident, _.isNil))){
      let residentQuery = ''
      
      if (body.resident.fullName != null && body.resident.fullName !== "") {
        residentQuery += `
          AND UPPER(IU.FullName) LIKE :FullName
        `;
        replacements.FullName = `%${body.resident.fullName}%`;
      }
      
      if (body.resident.chineseName != null && body.resident.chineseName !== "") {
        residentQuery += `
          AND IU.ChineseName LIKE :ChineseName
        `;
        replacements.ChineseName = `%${body.resident.chineseName}%`;
      }
      
      if (body.resident.ic != null && body.resident.ic !== "") {
        residentQuery += `
          AND IU.IC LIKE :IC
        `;
        replacements.IC = `%${body.resident.ic}%`;
      }
      
      if (body.resident.relationship != null && body.resident.relationship !== "") {
        residentQuery += `
          AND IU.Relationship = :Relationship
        `;
        replacements.Relationship = body.resident.relationship;
      }
      
      if (body.resident.gender != null && body.resident.gender !== "") {
        residentQuery += `
          AND IU.Gender = :Gender
        `;
        replacements.Gender = body.resident.gender;
      }

      if(residentQuery !== ""){
        countQuery = `
          WITH FilteredRecords AS (
            SELECT *
            FROM tbl_Unit_IntendedUser IU WITH (NOLOCK)
            WHERE IU.IsDeleted = 0 AND IU.StatusX = 1
            ${residentQuery}
          ),
          MainQuery AS (
            ${query}
            AND EXISTS (
              SELECT 1
              FROM FilteredRecords FR
              WHERE FR.UnitID = UC.UnitID
            )
          )
          SELECT COUNT(*) AS Total
          FROM MainQuery;
        `
        query = `
          WITH FilteredRecords AS (
            SELECT *
            FROM tbl_Unit_IntendedUser IU WITH (NOLOCK)
            WHERE IU.IsDeleted = 0 AND IU.StatusX = 1
            ${residentQuery}
          )
          ${query}
          AND EXISTS (
            SELECT 1
            FROM FilteredRecords FR
            WHERE FR.UnitID = UC.UnitID
          )
        `
      }
    }

    query += `
    ORDER BY UC.UnitID
    OFFSET :offset ROWS
    FETCH NEXT :pageSize ROWS ONLY
    `;
    const result = await sequelize.query(query, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    const totalCount = await sequelize.query(countQuery, {
      replacements: replacements,
      type: Sequelize.QueryTypes.SELECT,
    });
    return { data: result, totalRows: totalCount[0].Total };
  }
  static async insertTblProduct(body, req, t = null) {
    const query = `
    INSERT INTO tbl_Product (
      [ProductCode], [ProductName], [ProductCategoryID], [ProductType],
      [StatusX], [IsDeleted], [CreatedBy], [CreatedAt], [Price]
    ) VALUES (
      :ProductCode, :ProductName, :ProductCategoryID, :ProductType,
      1, 0, :CreatedBy, GETDATE(), :Price
    )
    SELECT SCOPE_IDENTITY() AS 'RES'
    `;
    const result = await sequelize.query(query, {
      replacements: {
        ProductCode: body.productCode,
        ProductName: body.productName,
        ProductCategoryID: body.productCategory,
        ProductType: body.productType,
        CreatedBy: body.createdBy,
        Price: body.productPrice,
      },
      type: Sequelize.QueryTypes.SELECT,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "INSERT PRODUCT", sql);
      },
    });

    return result[0].RES;
  }
  static async insertTblProductDisplay(body, req, t = null) {
    const query = `
    INSERT INTO tbl_ProductDisplay (
      [ProductID], [ProductDisplayType], [IsDeleted], [CreatedBy], [CreatedAt]
    ) VALUES (
      :ProductID, :ProductDisplayType, 0, :CreatedBy, GETDATE()
    )
    `;

    for (const displayType of body.productDisplayType) {
      await sequelize.query(query, {
        replacements: {
          ProductID: body.productID,
          ProductDisplayType: displayType,
          CreatedBy: body.createdBy,
        },
        type: Sequelize.QueryTypes.INSERT,
        transaction: t,
        logging: (sql, timing) => {
          Log.LogAction(req, "INSERT PRODUCT DISPLAY", sql);
        },
      });
    }
  }
  static async insertTblProductImage(body, req, t = null) {
    const query = `
    INSERT INTO tbl_ProductImage (
      [ProductID], [ImageLink], [IsDeleted], [CreatedBy], [CreatedAt]
    ) VALUES (
      :ProductID, :ImageLink, 0, :CreatedBy, GETDATE()
    )
    `;
    await sequelize.query(query, {
      replacements: {
        ProductID: body.productID,
        ImageLink: body.imageLink,
        CreatedBy: body.createdBy,
      },
      type: Sequelize.QueryTypes.INSERT,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "INSERT PRODUCT IMAGE", sql);
      },
    });
  }

  static async insertProduct(data, req, t = null) {
    data.productID = await this.insertTblProduct(data, req, t);

    if (data.productID == null || data.productID === "") {
      throw new Error("Product ID not retrieved after Insert!");
    } else {
      await this.insertTblProductDisplay(data, req, t);

      if (data.imageLink != null && data.imageLink !== "" && data.imageLink.includes("https")) {
        await this.insertTblProductImage(data, req, t);
      }
    }
  }

  static async updateProduct(data, req){
    const query = `
    UPDATE tbl_Product
      SET ProductName = :ProductName, ProductCategoryID = :ProductCategoryID,
          ProductType = :ProductType, StatusX = :Status, Price = :Price,
          UpdatedBy = :CreatedBy, UpdatedAt = GETDATE()
    WHERE IsDeleted = 0 AND ProductCode = :ProductCode
    `;

    await sequelize.query(query, {
      replacements: {
        ProductCode: data.productCode,
        ProductName: data.productName,
        ProductCategoryID: data.productCategory,
        ProductType: data.productType,
        Status: data.isActive ? "1" : "0",
        Price: data.productPrice,
        CreatedBy: data.createdBy,
      },
      type: Sequelize.QueryTypes.UPDATE,
      logging: (sql, timing) => {
        Log.LogAction(req, "UPDATE PRODUCT", sql);
      },
    });
  }

  static async updateProductDisplay(data, req, t = null){
    if (data.removedDisplay != null){
      if (Array.isArray(data.removedDisplay) && data.removedDisplay.length > 0) {
        const deleteQuery = `
          UPDATE tbl_ProductDisplay
            SET IsDeleted = 1, UpdatedBy = :CreatedBy, UpdatedAt = GETDATE()
          WHERE IsDeleted = 0 AND ProductID = :ProductID AND ProductDisplayType IN (:ProductDisplayType)
        `;
        
        await sequelize.query(deleteQuery, {
          replacements: {
            ProductID: data.productID,
            ProductDisplayType: data.removedDisplay,
            CreatedBy: data.createdBy,
          },
          type: Sequelize.QueryTypes.UPDATE,
          transaction: t,
          logging: (sql, timing) => {
            Log.LogAction(req, "REMOVE PRODUCT FROM CERTAIN DISPLAY TYPES", sql, t);
          },
        });
      }
    }

    if (data.productDisplayType != null){
      if (Array.isArray(data.productDisplayType) && data.productDisplayType.length > 0){
        await this.insertTblProductDisplay(data, req, t);
      }
    }
  }

  static async updateProductImage(data, req){  
    if ((await this.getProductImageByProductCode(data.productCode)) != null){
      const query = `
        UPDATE tbl_ProductImage
          SET ImageLink = :ImageLink, UpdatedBy = :CreatedBy, UpdatedAt = GETDATE()
        WHERE IsDeleted = 0 AND ProductID = :ProductID 
      `;

      await sequelize.query(query, {
        replacements: {
          ProductID: data.productID,
          ImageLink: data.imageLink,
          CreatedBy: data.createdBy,
        },
        type: Sequelize.QueryTypes.UPDATE,
        logging: (sql, timing) => {
          Log.LogAction(req, "UPDATE PRODUCT IMAGE", sql);
        },
      });
    }
    else {
      await this.insertTblProductImage(data, req);
    }
  }
}
module.exports = ProductService;
