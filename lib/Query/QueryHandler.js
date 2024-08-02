const Models = require("../../models");
const sequelize = Models.sequelize;
const Sequelize = Models.Sequelize;
const Log = require("../../util/Log"); // Assuming you have a Log module defined
const vm = require("vm");

class QueryHandler {
  static async executeAndLogQuery(req, sequelize, query, replacements, transaction) {
    try {
      await sequelize.query(query, {
        replacements,
        type: Sequelize.QueryTypes.INSERT,
        transaction,
        logging: (sql, timing) => {
          Log.LogAction(req, "INSERT Query", sql);
        },
      });
    } catch (error) {
      // Handle errors
      console.error("Error executing query:", error);
      throw error;
    }
  }
  static async evaluateExpression(expression) {
    try {
      const result = new Function(`return ${expression}`)();
      const returnResult = Boolean(result);
      return returnResult;
    } catch (error) {
      console.error("Invalid expression:", error);
      return false;
    }
  }

  static async evaluateExpression1(expression) {
    try {
      const result = new Function(`${expression}`)();
      return result;
    } catch (error) {
      console.error("Invalid expression:", error);
      return false;
    }
  }
  static replacePlaceholders(template, replacements) {
    let content = template;

    for (const key in replacements) {
      if (replacements.hasOwnProperty(key)) {
        const placeholder = `#${key}#`;
        content = content.split(placeholder).join(replacements[key]);
      }
    }

    return content;
  }

  static async getQueryDetails(queryId) {
    const queryDetails = await sequelize.query(`SELECT * FROM tbl_Query WHERE Id = :queryId`, {
      replacements: { queryId },
      type: Sequelize.QueryTypes.SELECT,
    });

    let queryParameterID = queryDetails
      .filter((item) => item.QueryParameterID !== null)
      .map((item) => JSON.parse(item.QueryParameterID))
      .flat();
    queryParameterID = new Set(queryParameterID);
    let parameters = await sequelize.query(
      `
      SELECT *
          FROM [dbo].[tbl_QueryParameter]
      WHERE ID IN (:queryParameterID)
      `,
      {
        replacements: { queryParameterID: [...queryParameterID] },
        type: Sequelize.QueryTypes.SELECT,
      }
    );
    queryParameterID = parameters
      .filter((item) => item.ValidationQueryParameterID !== null)
      .map((item) => JSON.parse(item.ValidationQueryParameterID))
      .flat();
    if (queryParameterID.length > 0) {
      queryParameterID = new Set(queryParameterID);
      const parameters1 = await sequelize.query(
        `
    SELECT *
        FROM [dbo].[tbl_QueryParameter]
    WHERE ID IN (:queryParameterID)
    `,
        {
          replacements: { queryParameterID: [...queryParameterID] },
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      parameters = [...parameters, ...parameters1];
    }

    return { queryDetails: queryDetails[0], parameters: parameters };
  }

  static async validateParameter(param, inputParams, parameters) {
    const {
      ParameterName,
      ValidationQuery,
      ValidationQueryParameterID,
      ValidationQueryParameterOperator,
      ErrorMessage,
      DefaultValue,
    } = param;
    const paramValue = inputParams[ParameterName];
    const queryReplacement = {};
    if (ValidationQuery) {
      const validationReplacements = {};
      const validationParamIds = ValidationQueryParameterID ? JSON.parse(ValidationQueryParameterID) : [];

      for (const id of validationParamIds) {
        const validationParam = parameters.find((p) => p.Id == id);
        queryReplacement[validationParam.ParameterName] = "";
        if (validationParam.DefaultValue && paramValue == null) {
          paramValue = DefaultValue;
        }
        if (validationParam) {
          let validationParamValue = inputParams[validationParam.ParameterName];
          if (validationParam.DefaultValue && validationParamValue == null) {
            validationParamValue = validationParam.DefaultValue;
          }
          queryReplacement[validationParam.ParameterName] = validationParam.ReplaceSyntax;
          validationReplacements[validationParam.ParameterName] = validationParamValue;
        }
      }

      const validationResult = await sequelize.query(
        await QueryHandler.replacePlaceholders(ValidationQuery, queryReplacement),
        {
          replacements: validationReplacements,
          type: Sequelize.QueryTypes.SELECT,
        }
      );
      let evaluationResult = false;
      if (validationResult.length > 0) {
        //Seldom used - Used for validating paramValue against an array of result
        if (String(ValidationQueryParameterOperator) === "SOME") {
          evaluationResult = validationResult.some((obj) => String(obj[Object.keys(obj)[0]]) === String(paramValue));
        } else if (String(ValidationQueryParameterOperator) === "REPLACE") {
          const [firstItem] = validationResult;
          const firstValue = firstItem[Object.keys(firstItem)[0]];
          return firstValue;
        } else if (String(ValidationQueryParameterOperator) === "== 1") {
          const [firstItem] = validationResult;
          const firstValue = firstItem[Object.keys(firstItem)[0]];
          evaluationResult = firstValue === 1;
        } else {
          const [firstItem] = validationResult;
          const firstValue = firstItem[Object.keys(firstItem)[0]];
          evaluationResult = await QueryHandler.evaluateExpression(
            '"' + String(firstValue) + '"' + String(ValidationQueryParameterOperator) + '"' + String(paramValue) + '"'
          );
        }
      }
      if (!evaluationResult) {
        throw new Error(ErrorMessage || `Invalid value for ${ParameterName}`);
      }
      return;
    }
  }

  static async removeCondition(query, paramName) {
    // Escaping special characters in paramName for regex
    console.log("Before:", query);
    const escapedParamName = paramName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const frontPattern = new RegExp(`\\s+AND\\s+[^A]*?${escapedParamName}[^A]*?(?=\\s+AND|$)`, "gis");
    // Define a generic regex pattern to match the condition without AND at the front
    const backPattern = new RegExp(`.*?${escapedParamName}.*?(?=\\s+AND|$)`, "gis");
    // Remove the condition if it matches the front pattern
    query = query.replace(frontPattern, (match) => {
      console.log("Front pattern match found:", match);
      return "";
    });

    // Remove the condition if it matches the back pattern
    query = query.replace(backPattern, (match) => {
      console.log("Back pattern match found:", match);
      return "";
    });

    console.log("After:", query);

    return query;
  }

  static async constructQuery(queryDetails, parameters, inputParams) {
    let queryText = queryDetails.Query;
    const replacements = {};
    const queryParameterIDs = JSON.parse(queryDetails.QueryParameterID);

    const filteredArray = parameters.filter((obj) => {
      return queryParameterIDs.includes(parseInt(obj.Id, 10));
    });
    const queryReplacement = {};

    for (const param of filteredArray) {
      const {
        ParameterName,
        ParameterType,
        IsOptional,
        IsNullable,
        ValidationRegex,
        ReplaceSyntax,
        DefaultValue,
        TransformSyntax,
        ValidationQuery,
        ValidationQueryParameterID,
        ValidationQueryParameterOperator,
        ErrorMessage,
      } = param;

      if (inputParams[ParameterName] === undefined && !IsOptional) {
        throw new Error(`Missing required parameter: ${ParameterName}`);
      }
      if (DefaultValue && inputParams[ParameterName] == null) {
        inputParams[ParameterName] = DefaultValue;
      }
      //Currently only can transform based on own's value but no reliance on other key value
      // if (TransformSyntax) {
      //   let syntax = await QueryHandler.replacePlaceholders(TransformSyntax, inputParams);
      //   inputParams[ParameterName] = await QueryHandler.evaluateExpression1(syntax);
      // }
      let paramValue = inputParams[ParameterName];

      if (paramValue === undefined && IsOptional) {
        // const regex = new RegExp(
        //   `(?:AND\\s+)?\\b\\w+\\s*(=|IN|>|>=|<|<=|<>|!=|BETWEEN|LIKE)\\s*(:${ParameterName})`,
        //   "gi"
        // );
        // queryText = queryText.replace(regex, "1=1");
        // queryText = await QueryHandler.removeCondition(queryText, ParameterName);
        const replacedValue = await QueryHandler.validateParameter(param, inputParams, parameters);
        queryReplacement[ParameterName] = "";
        replacements[ParameterName] = replacedValue || paramValue;
      } else {
        if (paramValue === null && !IsNullable) {
          throw new Error(`Parameter ${ParameterName} cannot be null`);
        }

        if (
          ValidationRegex &&
          (ParameterType === "INTEGER" || ParameterType === "DECIMAL") &&
          ValidationRegex === "> 0" &&
          parseInt(paramValue, 10) <= 0
        ) {
          throw new Error(ErrorMessage || `Invalid value for ${ParameterName}`);
        }
        else if (
          ValidationRegex &&
          (ParameterType === "INTEGER" || ParameterType === "DECIMAL") &&
          ValidationRegex === ">= 0" &&
          parseInt(paramValue, 10) < 0
        ){
          throw new Error(ErrorMessage || `Invalid value for ${ParameterName}`);
        }

        if (ParameterType === "BIT" && parseInt(paramValue, 2) !== 0 && parseInt(paramValue, 2) !== 1) 
        {
          throw new Error(ErrorMessage || `${ParameterName} can only be either 0 or 1`)
        }

        if (ValidationRegex && !new RegExp(ValidationRegex).test(paramValue)) {
          throw new Error(ErrorMessage || `Invalid value for ${ParameterName}`);
        }

        if ((paramValue == null || paramValue === "") && !IsNullable && !IsOptional) {
          throw new Error(`Parameter ${ParameterName} cannot be empty`);
        }

        // Recursive validation
        const replacedValue = await QueryHandler.validateParameter(param, inputParams, parameters);
        queryReplacement[ParameterName] = ReplaceSyntax;
        replacements[ParameterName] = replacedValue || paramValue;
        // if the regex contains LIKE, modify the string to have %% to allow sql to query using LIKE clause
        replacements[ParameterName] = ValidationRegex && ValidationRegex === "LIKE" ? `%${replacements[ParameterName]}%` : replacements[ParameterName];
      }
    }
    queryText = await QueryHandler.replacePlaceholders(queryText, queryReplacement);

    return { queryText, replacements };
  }

  static async executeQuery(queryId, inputParams, action = "", req = null, t = null) {
    const { queryDetails, parameters } = await QueryHandler.getQueryDetails(queryId);

    try {
      const { queryText, replacements } = await QueryHandler.constructQuery(queryDetails, parameters, inputParams);

      let results;

      if (req != null && t != null){
        results = await sequelize.query(queryText, {
          replacements,
          type: Sequelize.QueryTypes[queryDetails.Type.toUpperCase()],
          transaction: t,
          logging: (sql, timing) => {
            Log.LogAction(req, action, sql);
          },
        });
      }
      else if (req != null && t == null){
        results = await sequelize.query(queryText, {
          replacements,
          type: Sequelize.QueryTypes[queryDetails.Type.toUpperCase()],
          logging: (sql, timing) => {
            Log.LogAction(req, action, sql);
          },
        });
      }
      else {
        results = await sequelize.query(queryText, {
          replacements,
          type: Sequelize.QueryTypes[queryDetails.Type.toUpperCase()],
        });
      }
      
      return results;
      
    } catch (error) {
      return { error: error.message };
    }
  }
}

module.exports = QueryHandler;
