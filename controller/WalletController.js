"use strict";
const captureError = require("../lib/ErrorHandler/CaptureError");
const Models = require("../models");
const { z } = require("zod");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const ZodCustomValidator = require("../util/ZodCustomValidator");
const Util = require("../util/Util");
const { ValidateUser } = require("../lib/JWT");
const WalletService = require("../service/WalletService");
const MemberService = require("../service/MemberService");
const UtilService = require("../service/UtilService");

class WalletController{

}
module.exports = WalletController;