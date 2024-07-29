const Models = require("../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const Constants = require("../util/Constant");

const getBrowserInfo = (userAgent) => {
  // Regular expressions to match different browsers and versions
  try {
    const browserRegex = {
      Chrome: /Chrome\/([0-9.]+)/,
      Firefox: /Firefox\/([0-9.]+)/,
      Safari: /Version\/([0-9.]+)/,
      Edge: /Edge\/([0-9.]+)/,
      InternetExplorer: /MSIE ([0-9.]+)/,
      Opera: /Opera\/([0-9.]+)/,
    };

    // Try to match user agent against known browsers
    for (const [browser, regex] of Object.entries(browserRegex)) {
      const match = userAgent.match(regex) ?? null;
      if (match) {
        return { browser, version: match[1] };
      }
    }

    // If no match found, return 'Unknown' browser and version
    return { browser: userAgent, version: "Unknown" };
  } catch (error) {
    return { browser: userAgent, version: "Unknown" };
  }
};

const truncateString = (str, maxLength = 150) => {
  if (str.length > maxLength) {
    return str.slice(0, maxLength);
  }
  return str;
};

class Log {
  static async LogRequest(req, res, next) {
    const currentUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
    Constants.setCurrentUrl(currentUrl);
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];
    const { browser, version } = getBrowserInfo(userAgent);
    const requestBody = JSON.stringify(req.body);
    const requestBodyString = requestBody.length > 2000 ? requestBody.slice(0, 2000) + "==TRUNCATED" : requestBody;

    const url = req.url;

    const query = `
      INSERT INTO [tbl_Log_Request] ([ActionRequestBody], [ActionURL], [ActionIP], [ActionBrowser], [ActionBrowserVersion])
      VALUES (:ReqBody, :Url, :IP, :Browser, :BrowserVersion)
    `;
    const result = await sequelize.query(query, {
      replacements: {
        ReqBody: requestBodyString,
        Url: String(url),
        IP: String(ip),
        Browser: truncateString(String(browser)),
        BrowserVersion: truncateString(String(version)),
      },
      type: Sequelize.QueryTypes.INSERT,
    });
    next();
  }
  static async LogResponse(req, res, next) {
    // Capture the start time of the request
    const startTime = Date.now();

    // Store the original res.json function
    const originalJson = res.json;

    // Override the res.json function to capture response data
    res.json = function (body) {
      // Restore the original res.json function
      res.json = originalJson;

      // Capture the response body
      const responseBody = body;

      // Calculate the time taken for the request to complete
      const duration = Date.now() - startTime;

      // Log the response body and the time taken
      console.log("Response sent to client:");
      console.log("Response Body:", responseBody);
      console.log("Time taken:", duration, "ms");

      // Return the response as usual
      return originalJson.call(res, body);
    };

    // Proceed to the next middleware or route handler
    next();
  }

  static async LogAction(req, actionType, sql, t = null) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];
    const { browser, version } = getBrowserInfo(userAgent);
    const requestBody = req.body;
    const url = req.url;
    const queryWithoutPrefix = sql.replace(/^Executing \([^)]+\): /, "");

    const query = `
      INSERT INTO [tbl_Log_Action] ([ActionUserID], [ActionType], [ActionSQL], [ActionURL], [ActionIP], [ActionBrowser], [ActionBrowserVersion])
      VALUES ('ECOMM', :ActionType, :SQL, :Url, :IP, :Browser, :BrowserVersion)
    `;
    const result = await sequelize.query(query, {
      replacements: {
        ActionType: String(actionType),
        SQL: String(queryWithoutPrefix),
        Url: String(url),
        IP: String(ip),
        Browser: String(browser),
        BrowserVersion: String(version),
      },
      transaction: t,
      type: Sequelize.QueryTypes.INSERT,
    });
  }

  static async LogError(req, message, sql) {
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];
    const { browser, version } = getBrowserInfo(userAgent);
    const url = req.url;
    const queryWithoutPrefix = sql.replace(/^Executing \([^)]+\): /, "");

    const query = `
      INSERT INTO [tbl_Log_Error] (ErrorUserID, ErrorMessage, ErrorSQL, ErrorUrl, ErrorIP, ErrorBrowser, ErrorBrowserVersion)
      VALUES ('ECOMM', :Message, :SQL, :Url, :IP, :Browser, :BrowserVersion)
    `;
    const result = await sequelize.query(query, {
      replacements: {
        Message: String(message),
        SQL: String(queryWithoutPrefix),
        Url: String(url),
        IP: String(ip),
        Browser: String(browser),
        BrowserVersion: String(version),
      },
      type: Sequelize.QueryTypes.INSERT,
    });
  }
}
module.exports = Log;
