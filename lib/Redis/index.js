const redis = require("redis");
const { promisify } = require("util");
const Constant = require("../../util/Constant");

//////////////////////////////////////////////////////////
//                   IMPORTANT NOTE

// DO NOT QUIT OR DISCONNECT CONNECTION

// SDK PROBLEM WHILE HANDLING CONNECTION LIFETIME
//////////////////////////////////////////////////////////
class Redis {
  constructor() {
    const redisOptions = {
      socket: {
        host: "127.0.0.1", // Redis server host
        port: 6379, // Redis server port
      },
    };
    this.client = redis.createClient(redisOptions);
    this.client.on("error", (err) => {
      console.error("Redis Error:", err);
    });
    this.getAsync = promisify(this.client.get).bind(this.client);
  }
  //Default 20 minutes expiry
  async set(key, value, expirySeconds = Constant.token_expiry_seconds) {
    try {
      if (!this.client.isOpen){
        await new Promise((resolve, reject) => {
          this.client
            .connect()
            .then(() => {
               resolve();
             })
            .catch((err) => {
               reject(err);
             });
        });
      }

      await new Promise((resolve, reject) => {
        this.client
          .set(key, value, { EX: expirySeconds })
          .then(() => {
            resolve();
          })
          .catch((err) => {
            reject(err);
          });
      });
    } catch (err) {
      throw err;
    } 
  }

  async setObj(key, value, expirySeconds = Constant.token_expiry_seconds) {
    try {
      if (!this.client.isOpen){
        await new Promise((resolve, reject) => {
          this.client
            .connect()
            .then(() => {
               resolve();
             })
            .catch((err) => {
               reject(err);
             });
        });
      }


      await new Promise((resolve, reject) => {
        this.client
          .set(key, JSON.stringify(value), { EX: expirySeconds })
          .then(() => {
            resolve();
          })
          .catch((err) => {
            reject(err);
          });
      });
    } catch (err) {
      throw err;
    } 
  }

  async get(key) {
    try {
      if (!this.client.isOpen){
        await new Promise((resolve, reject) => {
          this.client
            .connect()
            .then(() => {
               resolve();
             })
            .catch((err) => {
               reject(err);
             });
        });
      }
      const result = await new Promise((resolve, reject) => {
        return this.client
          .get(key)
          .then((value) => {
            resolve(value);
          })
          .catch((err) => {
            reject(err);
          });
      }); 
      if (!result) {
        return null;
      }     
      return result;
    } catch (err) {
      throw err;
    } 
  }

  async getObj(key) {
    try {
      if (!this.client.isOpen){
        await new Promise((resolve, reject) => {
          this.client
            .connect()
            .then(() => {
               resolve();
             })
            .catch((err) => {
               reject(err);
             });
        });
      }
      const result = await new Promise((resolve, reject) => {
        return this.client
          .get(key)
          .then((value) => {
            resolve(value);
          })
          .catch((err) => {
            reject(err);
          });
      });
      if (!result) {
        return null;
      }      
      return JSON.parse(result);
    } catch (err) {
      throw err;
    } 
  }

  async del(key) {
    try {
      await new Promise((resolve, reject) => {
        this.client
          .connect()
          .then(() => {
            resolve();
          })
          .catch((err) => {
            reject(err);
          });
      });

      await new Promise((resolve, reject) => {
        this.client
          .del(key)
          .then(() => {
            resolve();
          })
          .catch((err) => {
            reject(err);
          });
      });
    } catch (err) {
      throw err;
    } 
  }
}

module.exports = new Redis();
