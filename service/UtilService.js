const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const Log = require("../util/Log");
const MemberService = require("../service/MemberService");
const ProductService = require("../service/ProductService");
const QueryHandler = require("../lib/Query/QueryHandler");
const Constants = require("../util/Constant");

class UtilService {
  static async getParameterValue(language = 'EN', category) {
    return (await QueryHandler.executeQuery('Q003', {Language: language, ParameterCategory: category}));
  }
  static async getBankLists(Nationality){
    return (await QueryHandler.executeQuery('Q006', {Nationality}));
  }
}
module.exports = UtilService;
