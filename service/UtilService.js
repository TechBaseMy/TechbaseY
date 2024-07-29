const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const Log = require("../util/Log");
const MemberService = require("../service/MemberService");
const ProductService = require("../service/ProductService");
const Constants = require("../util/Constant");

class UtilService {
  static async getParameterValue(category) {
    const query = `
        SELECT * FROM tbl_Parameter WITH (NOLOCK) WHERE Category = :Category
    `;
    const result = await sequelize.query(query, {
      replacements: { Category: category },
      type: Sequelize.QueryTypes.SELECT,
    });
    return result;
  }
}
module.exports = UtilService;
