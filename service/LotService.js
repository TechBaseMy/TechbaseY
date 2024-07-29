const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const smtp = require("../util/email");
const config = require("../config/config.json")["smtp"];
const { ForgetPasswordToken } = require("../lib/JWT");
const { decrypt, validateMonoEndpoint, decryptMono } = require("../lib/Encryptor");
const Constants = require("../util/Constant");
const Log = require("../util/Log");
const { literal } = require("zod");

class LotService {
  static async validateIntendedUserIC(ic) {
    const query = `
        SELECT IC FROM tbl_Unit_IntendedUser WITH (NOLOCK) WHERE IsDeleted = 0 AND IC = :IC;
    `;
    const result = await sequelize.query(query, {
      replacements: { IC: ic },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.IC === undefined || result[0]?.IC === null;
  }

  static async getLotUnitIDByIntendedUserDataID(id) {
    const query = `
        SELECT UnitID FROM tbl_Unit_IntendedUser WITH (NOLOCK) WHERE IsDeleted = 0 AND ID = :ID;
    `;
    const result = await sequelize.query(query, {
      replacements: { ID: id },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.UnitID;
  }

  static async getLotStatus(unitID) {
    const query = `
      SELECT UnitStatusX FROM tbl_UnitCollection WITH (NOLOCK) WHERE UnitID = :UnitID AND IsDeleted = 0;
    `;
    const result = await sequelize.query(query, {
      replacements: { UnitID: unitID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.UnitStatusX;
  }

  static async validateLotCategoryType(categoryID, categoryTypeID) {
    const query = `
      DECLARE @UNITTYPE VARCHAR(10) = (CASE WHEN :CategoryID = 1 THEN 'N' WHEN :CategoryID = '10002' THEN 'B' ELSE 'NIL' END);
      SELECT CategoryID FROM tbl_UnitCategory WITH (NOLOCK) WHERE IsDeleted = 0 AND UnitType = @UNITTYPE AND CategoryID = :CategoryTypeID;
    `;
    const result = await sequelize.query(query, {
      replacements: { CategoryID: categoryID, CategoryTypeID: categoryTypeID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.CategoryID === undefined || result[0]?.CategoryID === null;
  }

  static async checkIfLotLocationDetailDuplicated(data) {
    const query = `
      SELECT TOP 1
        UnitID
      FROM tbl_UnitCollection WITH (NOLOCK)
      WHERE IsDeleted = 0 AND PositionX = :PositionX AND PositionY = :PositionY
            AND ZoneX = :Zone AND RowX = :Row AND UnitID <> :UnitID;
    `;

    const result = await sequelize.query(query, {
      replacements: {
        UnitID: data.unitID,
        PositionX: data.positionX,
        PositionY: data.positionY,
        Zone: data.zone,
        Row: data.row,
      },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.UnitID != null;
  }

  static async validateRelationship(relationship) {
    const query = `
        select ParameterName_EN from tbl_Parameter WITH (NOLOCK) where Category = 'Relationship' AND ParameterValue = :relationship
    `;
    const result = await sequelize.query(query, {
      replacements: { relationship: relationship },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.ParameterName_EN === undefined || result[0]?.ParameterName_EN === null;
  }

  static async insertToTblUnitIntendedUser(body, req, t = null) {
    const query = `
    INSERT INTO [dbo].[tbl_Unit_IntendedUser] (
      [UnitID],[FullName],[ChineseName],[IC],[Gender],[Relationship],[StatusX],[AssignAt], [CreatedBy], [DeathCertificateUrl]
    ) VALUES (
      :UnitID, :FullName, :ChineseName, :IC, :Gender,
      :Relationship, :StatusX, :AssignAt, :CreatedBy, :DeathCertificateUrl
    );
  `;
    await sequelize.query(query, {
      replacements: {
        UnitID: body.unitID,
        FullName: body.fullName || null,
        ChineseName: body.chineseName || null,
        IC: body.identityNo || null,
        Gender: body.gender || null,
        Relationship: body.relationship || null,
        StatusX: body.status,
        AssignAt: body.assignAt,
        CreatedBy: body.memberID,
        DeathCertificateUrl: body.certFile || null,
      },
      type: Sequelize.QueryTypes.INSERT,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "INSERT UNIT INTENDED USER", sql, t);
      },
    });
  }

  static async updateTblUnitIntendedUserStatus(body, req, t = null) {
    let replacements = {
      UnitID: body.unitID,
      Status: body.status,
      UpdatedBy: body.memberID,
      CheckInAt: body.checkInAt || null,
      RemovedAt: body.removedAt || null,
    };
    let query = `
    UPDATE [dbo].[tbl_Unit_IntendedUser] SET [StatusX] = :Status, [CheckInAt] = :CheckInAt, [RemovedAt] = :RemovedAt, [UpdatedBy] = :UpdatedBy, [UpdatedAt] = GETDATE() WHERE [UnitID] = :UnitID AND IsDeleted = 0
  `;
    if (body.ID != null) {
      query += ` AND [ID] = :ID`;
      replacements.ID = body.ID;
    }
    // if (body.isCheckIn != null && body.isCheckIn) {
    //   query += ` AND [RemovedAt] IS NULL`;
    // }
    await sequelize.query(query, {
      replacements: replacements,
      type: Sequelize.QueryTypes.UPDATE,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "EDIT UNIT INTENDED USER", sql, t);
      },
    });
  }

  static async updateDeathCertificateForLotIntendedUser(body, req){
    const query = `
      UPDATE tbl_Unit_IntendedUser 
      SET DeathCertificateUrl = :DeathCertificateUrl, UpdatedBy = :CreatedBy, UpdatedAt = GETDATE()
      WHERE ID = :ID
    `;

    await sequelize.query(query, {
      replacements: {
        ID: body.id,
        DeathCertificateUrl: body.certFile,
        CreatedBy: body.createdBy,
      },
      type: Sequelize.QueryTypes.UPDATE,
      logging: (sql, timing) => {
        Log.LogAction(req, "UPLOAD DEATH CERTIFICATE FILE FOR LOT INTENDED USER", sql);
      },
    });
  }

  static async GetLotDetails(unitID) {
    const query = `
    SELECT 
      c.UnitID AS 'LotNo', c.CategoryID AS 'LotCategory', c.LotCategoryType, u.[Description] AS 'LotCategoryTypeName',
      CASE WHEN c.UnitStatusX = 'B' THEN 1 ELSE 0 END AS 'IsBooked', ISNULL(c.ActiveBookingID, '-') AS 'ActiveBookID',
      CASE WHEN c.UnitStatusX = 'S' THEN 1 ELSE 0 END AS 'IsSold', ISNULL(c.ActiveSalesID, '-') AS 'ActiveSalesID',
      CASE WHEN c.DisplayStatusX = 'N' THEN 'NOT AVAILABLE'
        WHEN c.DisplayStatusX = 'A' THEN 'AVAILABLE'
        WHEN c.DisplayStatusX = 'C' THEN 'IN CONSTRUCTION'
        WHEN c.DisplayStatusX = 'S' THEN 'SOLD'
        WHEN c.DisplayStatusX = 'B' THEN 'BOOKED' END AS 'DisplayStatus',
      c.ReferencePrice, c.ReferenceContinuityFee, c.PositionX, c.PositionY, c.ZoneX, c.RowX, c.AreaSize,
      ISNULL(c.Hall, '-') AS 'Hall', ISNULL(c.BlockX, '-') AS 'BlockX', ISNULL(c.Side, '-') AS 'Side', ISNULL(c.LevelX, '-') AS 'Level'
    FROM tbl_UnitCollection c WITH (NOLOCK)
    INNER JOIN tbl_UnitCategory u WITH (NOLOCK) ON u.IsDeleted = 0 AND u.CategoryID = c.LotCategoryType
    WHERE c.IsDeleted = 0 AND c.UnitID = :UnitID
    `;

    const result = await sequelize.query(query, {
      replacements: { UnitID: unitID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
  static async EditLotDetails(data, req, t = null) {
    const query = `
    UPDATE tbl_UnitCollection SET
      CategoryID = :CategoryID, LotCategoryType = :CategoryTypeID, 
      UnitStatusX = :Status, DisplayStatusX = :Status, ReferencePrice = :RefPrice, 
      ReferenceContinuityFee = :RefContinuityFee, PositionX = :PositionX, PositionY = :PositionY,
      ZoneX = :Zone, RowX = :Row, AreaSize = :AreaSize, 
      Hall = (CASE WHEN :Hall IS NULL THEN Hall ELSE :Hall END), 
      BlockX = (CASE WHEN :Block IS NULL THEN Block ELSE :Block END), 
      Side = (CASE WHEN :Side IS NULL THEN Side ELSE :Side END), 
      LevelX = (CASE WHEN :Level IS NULL THEN Level ELSE :Level END), 
      UpdatedBy = :CreatedBy, UpdatedAt = GETDATE()
    WHERE IsDeleted = 0 AND UnitID = :UnitID
    `;

    await sequelize.query(query, {
      replacements: {
        UnitID: data.unitID,
        CategoryID: data.categoryID,
        CategoryTypeID: data.categoryTypeID,
        Status: data.status,
        RefPrice: data.refPrice,
        RefContinuityFee: data.refContinuityFee,
        PositionX: data.positionX,
        PositionY: data.positionY,
        Zone: data.zone,
        Row: data.row,
        AreaSize: data.areaSize,
        Hall: data.hall || null,
        Block: data.block || null,
        Side: data.side || null,
        Level: data.level || null,
        CreatedBy: data.createdBy,
      },
      type: Sequelize.QueryTypes.UPDATE,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "EDIT LOT INFO", sql, t);
      },
    });
  }
  static async getLotListForBatchUpdate(data) {
    const offset = (data.pageNumber - 1) * data.pageSize;
    const replacements = { offset: offset, pageSize: data.pageSize };

    let query = `
    FROM tbl_UnitCollection c WITH (NOLOCK)
    INNER JOIN tbl_UnitCategory u WITH (NOLOCK) ON u.IsDeleted = 0 AND u.CategoryID = c.LotCategoryType
    WHERE c.IsDeleted = 0
    `;

    if (data.unitID != null && data.unitID !== "") {
      query += `
        AND c.UnitID = :UnitID
      `;
      replacements.UnitID = data.unitID;
    }

    if (data.zone != null && data.zone !== "") {
      query += `
        AND c.ZoneX = :Zone
      `;
      replacements.Zone = data.zone;
    }

    if (data.row != null && data.row !== "") {
      query += `
        AND c.RowX = :Row
      `;
      replacements.Row = data.row;
    }

    if (data.hall != null && data.hall !== "") {
      query += `
        AND c.Hall = :Hall
      `;
      replacements.Hall = data.hall;
    }

    if (data.block != null && data.block !== "") {
      query += `
        AND c.BlockX = :Block
      `;
      replacements.Block = data.block;
    }

    if (data.side != null && data.side !== "") {
      query += `
        AND c.Side = :Side
      `;
      replacements.Side = data.side;
    }

    const countQuery = `
        SELECT COUNT(*) AS Total
        ${query} 
    `;

    query = `
      SELECT 
        c.UnitID AS 'LotNo', c.CategoryID AS 'LotCategory', c.LotCategoryType, u.[Description] AS 'LotCategoryTypeName',
        CASE WHEN c.UnitStatusX = 'B' THEN 1 ELSE 0 END AS 'IsBooked', ISNULL(c.ActiveBookingID, '-') AS 'ActiveBookID',
        CASE WHEN c.UnitStatusX = 'S' THEN 1 ELSE 0 END AS 'IsSold', ISNULL(c.ActiveSalesID, '-') AS 'ActiveSalesID',
        CASE WHEN c.DisplayStatusX = 'N' THEN 'NOT AVAILABLE'
          WHEN c.DisplayStatusX = 'A' THEN 'AVAILABLE'
          WHEN c.DisplayStatusX = 'C' THEN 'IN CONSTRUCTION'
          WHEN c.DisplayStatusX = 'S' THEN 'SOLD'
          WHEN c.DisplayStatusX = 'B' THEN 'BOOKED' END AS 'DisplayStatus',
        c.ReferencePrice, c.ReferenceContinuityFee, c.PositionX, c.PositionY, c.ZoneX, c.RowX, c.AreaSize,
        ISNULL(c.Hall, '-') AS 'Hall', ISNULL(c.BlockX, '-') AS 'BlockX', ISNULL(c.Side, '-') AS 'Side', ISNULL(c.LevelX, '-') AS 'Level'
      ${query}
    `;

    query += `
    ORDER BY c.Id
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
  static async batchUpdateLotDetails(data, req, t = null) {
    const replacements = {};

    let query = `
    UPDATE c
    SET c.UnitStatusX = CASE WHEN c.UnitStatusX IN ('S', 'B') THEN c.UnitStatusX ELSE :Status END, 
      c.DisplayStatusX = CASE WHEN c.DisplayStatusX IN ('S', 'B') THEN c.DisplayStatusX ELSE :Status END, 
      c.ReferencePrice = :RefPrice, 
      c.ReferenceContinuityFee = :RefContinuityFee, c.UpdatedBy = :CreatedBy, c.UpdatedAt = GETDATE()
    FROM tbl_UnitCollection c 
    WHERE c.IsDeleted = 0 AND c.UnitStatusX NOT IN ('S', 'B')
    `;

    replacements.Status = data.status;
    replacements.RefPrice = data.refPrice;
    replacements.RefContinuityFee = data.refContinuityFee;
    replacements.CreatedBy = data.createdBy;

    if (data.unitID != null && data.unitID !== "") {
      query += `
        AND c.UnitID = :UnitID
      `;
      replacements.UnitID = data.unitID;
    }

    if (data.zone != null && data.zone !== "") {
      query += `
        AND c.ZoneX = :Zone
      `;
      replacements.Zone = data.zone;
    }

    if (data.row != null && data.row !== "") {
      query += `
        AND c.RowX = :Row
      `;
      replacements.Row = data.row;
    }

    if (data.hall != null && data.hall !== "") {
      query += `
        AND c.Hall = :Hall
      `;
      replacements.Hall = data.hall;
    }

    if (data.block != null && data.block !== "") {
      query += `
        AND c.BlockX = :Block
      `;
      replacements.Block = data.block;
    }

    if (data.side != null && data.side !== "") {
      query += `
        AND c.Side = :Side
      `;
      replacements.Side = data.side;
    }

    await sequelize.query(query, {
      replacements: replacements,
      type: Sequelize.QueryTypes.UPDATE,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "BATCH EDIT LOT INFO", sql, t);
      },
    });
  }
}
module.exports = LotService;
