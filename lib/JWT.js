const jwt = require("jsonwebtoken");
const Constant = require("../util/Constant");
const { encrypt } = require("../lib/Encryptor");
const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const Redis = require("../lib/Redis");
const QueryHandler = require("./Query/QueryHandler");

async function ValidateUser(body) {
  body.Password = body?.Password == null ? null : encrypt(body?.Password);
  let tmpUser = await QueryHandler.executeQuery('LG01', body);

  if (tmpUser.length > 0) {
    //Save to Redis
    const redisData = await Redis.getObj(tmpUser[0].memberID + " - " + Constant.proj_name);
    const token = jwt.sign(
      {
        ID: tmpUser[0].memberID,
      },
      Constant.key,
      { expiresIn: String(Constant.token_expiry_seconds) + "s" }
    );
    // If Single Login user and No token is Stored
    if (!redisData && tmpUser[0].IsSingleLogin !== 0) {
      await Redis.setObj(tmpUser[0].memberID + " - " + Constant.proj_name, { token: [token] });
    }
    // If Multi Login user and No token is Stored
    else if (!redisData && tmpUser[0].IsSingleLogin === 0) {
      await Redis.setObj(tmpUser[0].memberID + " - " + Constant.proj_name, { token: [token] });
    }
    // If Multi Login user and Token with the MemberID key is present
    else if (redisData && tmpUser[0].IsSingleLogin === 0) {
      redisData.token.push(token);
      await Redis.setObj(tmpUser[0].memberID + " - " + Constant.proj_name, redisData);
    }
    // If Single Login user and Token with the MemberID key is present
    else {
      await Redis.setObj(tmpUser[0].memberID + " - " + Constant.proj_name, { token: [token] });
    }

    return token;
  } else {
    return null;
  }
}

function PrivateRoute(roles) {
  return async (req, res, next) => {
    try {
      if (typeof roles === "string") {
        roles = parseInt(roles, 10);
      }
      const secret = Constant.key;
      let token = req.headers.authorization.split(" ").pop();
      let decoded = jwt.verify(token, secret);
      if (decoded) {
        const query = `
            SELECT M.MemberID AS 'memberID', L.AuthorityLevel, L.FirstLogin, L.IsSingleLogin 
                FROM tbl_Login L WITH (NOLOCK) 
                INNER JOIN tbl_MemberInfo M WITH (NOLOCK) ON M.IsDeleted = 0 AND M.Username = L.LoginUsername
				INNER JOIN tbl_RoleControl RC WITH (NOLOCK) ON RC.IsDeleted = 0 AND RC.IsAllowedLogin = 1 AND L.LoginRole = RC.RoleID
                WHERE M.MemberID = :MemberID AND L.LoginStatus = 1 AND M.StatusX IN ('A', 'I') 
        `;
        const tmpUser = await sequelize.query(query, {
          replacements: { MemberID: decoded.ID },
          type: Sequelize.QueryTypes.SELECT,
        });

        if ((roles == null || roles.length == 0) && tmpUser.length > 0) {
          //Attach MemberID to Request Object
          req.MemberID = decoded.ID;

          //Validate Redis
          let redisData = await Redis.getObj(tmpUser[0].memberID + " - " + Constant.proj_name);
          if (redisData && redisData.token.includes(token)) {
            const currentTime = Math.floor(Date.now() / 1000);
            //Refresh Token if Within 5 minutes of expiration
            const tokenExp = decoded.exp;
            let isRefresh = false;
            if (tokenExp - currentTime < Constant.token_refresh_within_seconds) {
              redisData.token = redisData.token.filter((element) => element !== token);
              token = jwt.sign(
                {
                  ID: decoded.ID,
                },
                Constant.key,
                { expiresIn: String(Constant.token_expiry_seconds) + "s" }
              );
              if (tmpUser[0].IsSingleLogin === 0) {
                redisData.token.push(token);
              } else {
                redisData = { token: [token] };
              }
              await Redis.setObj(tmpUser[0].memberID + " - " + Constant.proj_name, redisData);
            }
          } else {
            return res.status(401).send({
              status: 401,
              message: "Invalid Access Token",
              info: {},
              error_code: "",
            });
          }

          res.setHeader("authorization", token);
          next();
          return;
        } else if ((roles == null || roles.length == 0) && tmpUser.length == 0) {
          return res.status(401).send({
            status: 401,
            message: "Invalid Access Token",
            info: {},
            error_code: "",
          });
        }

        if (roles != null && roles <= tmpUser[0].AuthorityLevel) {
          //Attach MemberID to Request Header
          req.MemberID = decoded.ID;

          //Validate Redis
          let redisData = await Redis.getObj(tmpUser[0].memberID + " - " + Constant.proj_name);
          if (redisData && redisData.token.includes(token)) {
            const currentTime = Math.floor(Date.now() / 1000);
            //Refresh Token if Within 5 minutes of expiration
            const tokenExp = decoded.exp;
            let isRefresh = false;
            if (tokenExp - currentTime < Constant.token_refresh_within_seconds) {
              redisData.token = redisData.token.filter((element) => element !== token);
              token = jwt.sign(
                {
                  ID: decoded.ID,
                },
                Constant.key,
                { expiresIn: String(Constant.token_expiry_seconds) + "s" }
              );
              if (tmpUser[0].IsSingleLogin === 0) {
                redisData.token.push(token);
              } else {
                redisData = { token: [token] };
              }
              await Redis.setObj(tmpUser[0].memberID + " - " + Constant.proj_name, redisData);
            }
          } else {
            return res.status(401).send({
              status: 401,
              message: "Invalid Access Token",
              info: {},
              error_code: "",
            });
          }
          res.setHeader("authorization", token);
          next();
          return;
        } else {
          return res.status(401).send({
            status: 401,
            message: "Insufficient permissions",
            info: {},
            error_code: "",
          });
        }
      } else {
        return res.status(401).send({
          status: 401,
          message: "Invalid Access Token",
          info: {},
          error_code: "",
        });
      }
    } catch (error) {
      return res.status(401).send({
        status: 401,
        message: error.message,
        info: {},
        error_code: "",
      });
    }
  };
}

async function ForgetPasswordToken(data) {
  try {
    const token = jwt.sign(
      {
        ID: data.memberID,
        name: data.name,
        email: data.email,
      },
      Constant.key,
      { expiresIn: String(Constant.reset_pass_token_expiry_seconds) + "s" }
    );

    await Redis.setObj(
      data.memberID + "_ResetPassword" + " - " + Constant.proj_name,
      { token: token },
      Constant.reset_pass_token_expiry_seconds
    );
    const decodedToken = jwt.verify(token, Constant.key);
    const issuedAt = new Date(decodedToken.iat * 1000);
    const expiresAt = new Date(decodedToken.exp * 1000);
    return { token, issuedAt, expiresAt };
  } catch (error) {
    console.log(error);
    return null;
  }
}

async function VerifyForgetPasswordToken(data) {
  try {
    let decoded = jwt.verify(data.token, Constant.key);
    let redisData = await Redis.getObj(decoded.ID + "_ResetPassword" + " - " + Constant.proj_name);
    if (redisData != null) {
      if (data.token === redisData.token) {
        return { memberID: decoded.ID, status: true };
      }
    }
    return { status: false };
  } catch (error) {
    console.log(error);
    return { status: false };
  }
}

module.exports = { PrivateRoute, ValidateUser, ForgetPasswordToken, VerifyForgetPasswordToken };
