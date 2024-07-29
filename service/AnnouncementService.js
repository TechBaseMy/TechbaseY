const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const Log = require("../util/Log");

class AnnouncementService {
  static async validateAnnouncementID(announcementID){
    const query = `
    SELECT Id FROM tbl_Announcement WITH (NOLOCK) WHERE IsDeleted = 0 AND Id = :AnnouncementId
    `;
    const result = await sequelize.query(query, {
      replacements: { AnnouncementId: announcementID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.Id === undefined || result[0]?.Id === null;
  }

  static async getAnnouncementList(data){
    const offset = (data.pageNumber - 1) * data.pageSize;
    const replacements = { offset: offset, pageSize: data.pageSize };

    let query = `
    FROM tbl_Announcement WITH (NOLOCK) 
    WHERE IsDeleted = 0 
    `;

    if (data.dateFrom != null && data.dateFrom !== ""){
      query += `
        AND DisplayDate >= :DateFrom
      `;
      replacements.DateFrom = data.dateFrom;
    }

    if (data.dateTo != null && data.dateTo !== ""){
      query += `
        AND DisplayDate <= :DateTo
      `;
      replacements.DateTo = data.dateTo;
    }

    if (data.title != null && data.title !== ""){
      query += `
        AND Title LIKE :Title
      `;
      replacements.Title = `%${data.title}%`;
    }

    if (data.displayStatus != null && data.displayStatus !== ""){
      query += `
        AND IsPublished = :IsPublished
      `;
      replacements.IsPublished = data.displayStatus;
    }

    const countQuery = `
      SELECT COUNT(*) AS Total
      ${query} 
    `;

    query = `
    SELECT 
      [Id], [Title], CONVERT(VARCHAR, [DisplayDate], 103) AS 'startDisplayDate',  
      [Sort], [IsPublished] AS 'DisplayStatus',
      CASE WHEN [IsPublished] = 1 THEN 'DISPLAY' ELSE 'HIDDEN' END AS 'DisplayStatusName',
      [LinkUrl]
      ${query}
    `;

    query += `
    ORDER BY Sort DESC, Id DESC
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

  static async getAnnouncementDetails(announcementID){
    const query = `
    SELECT 
      [Id], [Title], CONVERT(VARCHAR, [DisplayDate], 103) AS 'startDisplayDate',  
      CONVERT(VARCHAR, [ExpiredAt], 103) AS 'ExpireDate', [Contentx] AS 'Content',
      [Sort], [IsPublished] AS 'DisplayStatus',
      CASE WHEN [IsPublished] = 1 THEN 'DISPLAY' ELSE 'HIDDEN' END AS 'DisplayStatusName', 
      [LinkUrl]
    FROM tbl_Announcement WITH (NOLOCK) 
    WHERE IsDeleted = 0 AND Id = :AnnouncementId
    `;
    const result = await sequelize.query(query, {
      replacements: { AnnouncementId: announcementID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0];
  }

  static async getAnnouncementLinkUrl(announcementID){
    const query = `
    SELECT [LinkUrl] 
    FROM tbl_Announcement WITH (NOLOCK) 
    WHERE IsDeleted = 0 AND Id = :AnnouncementId
    `;
    const result = await sequelize.query(query, {
      replacements: { AnnouncementId: announcementID },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result[0]?.LinkUrl;
  }

  static async addAnnouncement(data, req, t = null){
    const query = `
    INSERT INTO tbl_Announcement
    (
      [Title], [DisplayDate], [ExpiredAt], [Contentx], [IsPublished], [IsDeleted], [CreatedBy],
      [CreatedAt], [LinkUrl], [Sort]
    )
    VALUES
    (
      :Title, :DisplayDate, :ExpiredAt, :Content, :IsPublished, 0, :CreatedBy,
      GETDATE(), :LinkUrl, :Sort
    )
    `;

    await sequelize.query(query, {
      replacements: {
        Title: data.title,
        DisplayDate: data.startDisplayDate,
        ExpiredAt: data.expireDate || null,
        Content: data.content,
        IsPublished: data.isHidden ? "0" : "1",
        CreatedBy: data.createdBy,
        LinkUrl: data.img || null,
        Sort: data.sort,
      },
      type: Sequelize.QueryTypes.INSERT,
      transaction: t,
      logging: (sql, timing) => {
        Log.LogAction(req, "ADD ANNOUNCEMENT", sql, t);
      },
    });
  }

  static async editAnnoucement(data, req){
    const query = `
    UPDATE tbl_Announcement
    SET Title = :Title, DisplayDate = :DisplayDate, 
        ExpiredAt = (CASE WHEN :ExpiredAt = '' THEN NULL ELSE :ExpiredAt END),
        Contentx = :Content, IsPublished = :IsPublished, 
        LinkUrl = (CASE WHEN :LinkUrl IS NULL THEN LinkUrl ELSE :LinkUrl END),
        Sort = :Sort, UpdatedBy = :UpdatedBy, UpdatedAt = GETDATE()
    WHERE IsDeleted = 0 AND Id = :Id
    `;

    await sequelize.query(query, {
      replacements: {
        Id: data.announcementID,
        Title: data.title,
        DisplayDate: data.startDisplayDate,
        ExpiredAt: data.expireDate || "",
        Content: data.content,
        IsPublished: data.isHidden ? "0" : "1",
        UpdatedBy: data.createdBy,
        LinkUrl: data.img || null,
        Sort: data.sort,
      },
      type: Sequelize.QueryTypes.UPDATE,
      logging: (sql, timing) => {
        Log.LogAction(req, "EDIT ANNOUNCEMENT", sql);
      },
    });
  }

  static async deleteAnnouncement(data, req){
    const query = `
    UPDATE tbl_Announcement
    SET IsDeleted = 1, UpdatedBy = :UpdatedBy, UpdatedAt = GETDATE()
    WHERE IsDeleted = 0 AND Id = :Id
    `;

    await sequelize.query(query, {
      replacements: {
        Id: data.announcementID,
        UpdatedBy: data.updatedBy,
      },
      type: Sequelize.QueryTypes.UPDATE,
      logging: (sql, timing) => {
        Log.LogAction(req, "DELETE ANNOUNCEMENT", sql);
      },
    });
  }
}
module.exports = AnnouncementService;