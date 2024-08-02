const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const Log = require("../util/Log");
const MemberService = require("../service/MemberService");
const ProductService = require("../service/ProductService");
const Constants = require("../util/Constant");

class UtilService {
  static async getParameterValue(language = 'EN', category) {
    return (await QueryHandler.executeQuery(39, {Language: language, ParameterCategory: category}));
  }
}
module.exports = UtilService;
