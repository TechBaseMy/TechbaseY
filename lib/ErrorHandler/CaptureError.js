const Sentry = require("@sentry/node");
const _ = require("lodash");

async function captureError(error, res) {
  // if( process.env.NODE_ENV === "production" ){
  //   if( error instanceof Error ){
  //     Sentry.captureException( error )
  //   } else if( error.error ) {
  //     Sentry.captureException( new Error ( _.map( error.error, err => err.message ).toString() ))
  //   }
  // }
  if (!_.isUndefined(res)) {
    const errorMessages =
      (error.errors || error.error)?.map((validationError) => ({
        field:
          typeof validationError.path === "string"
            ? validationError.path
            : validationError.path.join("."),
        message: validationError.message,
      })) || {};

    return res.status(error.status || 422).send({
      Status: error.status || 422,
      Message: error.message,
      Info: errorMessages,
      Error_code: "",
    });
  }
}

module.exports = captureError;
