const crypto = require("crypto");

class Util {
  static flattenArray(data) {
    let result = [];

    for (let i = 0; i < data.length; i++) {
      const value = data[i];

      if (Array.isArray(value) && value.length > 1) {
        result = result.concat(Util.flattenArray(value));
      } else if (Array.isArray(value)) {
        result.push(value[0]);
      }
      else {
        result.push(value);
      }
    }

    return result;
  }

  static generateRandomString (length){
    return crypto.randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
  }
}

module.exports = Util;