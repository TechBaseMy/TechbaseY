const Oss = require("ali-oss");
const Log = require("../util/Log");
const { Readable } = require("stream");
const env = process.env.NODE_ENV || "development";
const config = require(__dirname + "/../config/config.json")[env].oss;
const { decrypt } = require("../lib/Encryptor");

class OSS {
  constructor() {
    const OSSOption = {
      region: decrypt(config.region),
      accessKeyId: decrypt(config.accessKeyId),
      accessKeySecret: decrypt(config.accessKeySecret),
      bucket: decrypt(config.bucket),
    };
    this.client = new Oss(OSSOption);

    this.baseUrl = `https://${this.client.options.bucket}.${this.client.options.region}.aliyuncs.com/`;
  }

  async uploadObject(fileName, file, req) {
    try {
      // since the data coming in contains formatting string such as data:application/pdf;base64,
      // therefore the string is split so that the string after the comma will be used to upload into OSS instead
      // this is done to prevent the formatting string from breaking the uploaded content.
      const base64FileValue = file.split(",")[1];
      const stream = Buffer.from(base64FileValue, "base64");
      const tmp = fileName.replace(" ", "_");
      const result = await this.client.put(fileName.replace(" ", "_"), stream);

      if (result !== undefined && result.res.headers.etag.length > 0) {
        return result.name;
      } else {
        return false;
      }
    } catch (e) {
      Log.LogError(req, "Failed to Upload File - " + fileName, "");
      return false;
    }
  }

  async createFolder(folderName, req) {
    try {
      // Ensure the folder name ends with a slash
      if (!folderName.endsWith("/")) {
        folderName += "/";
      }

      // Create an empty object with the folder name
      const result = await this.client.put(folderName, Buffer.from(""));
      console.log("Folder created successfully:", result);
      return true;
    } catch (e) {
      Log.LogError(req, "Failed to Create Folder - " + folderName, e.message);
      return false;
    }
  }

  async deleteObject(fileName, req) {
    try {
      const result = await this.client.delete(fileName);
      return true;
    } catch (e) {
      Log.LogError(req, "Failed to Delete File - " + fileName, "");
      return false;
    }
  }

  async deleteFolder(folderName, req) {
    try {
      // List all objects with the specified folder prefix
      const listResult = await this.client.list({
        prefix: folderName,
        delimiter: "/",
      });

      // Check if there are any objects in the folder
      if (listResult.objects.length > 0) {
        // Delete all objects in the folder
        const deletePromises = listResult.objects.map((obj) => this.client.delete(obj.name));
        await Promise.all(deletePromises);
      }

      // Check if there are any subfolders and delete them
      if (listResult.prefixes.length > 0) {
        const deleteFolderPromises = listResult.prefixes.map((subFolder) => this.deleteFolder(subFolder, req));
        await Promise.all(deleteFolderPromises);
      }

      return true;
    } catch (e) {
      Log.LogError(req, "Failed to Delete Folder - " + folderName, e.message);
      return false;
    }
  }

  async bucketisExist() {
    try {
      const result = await this.client.getBucketInfo("papanmemorial");
    } catch (error) {
      if (error.name === "NoSuchBucketError") {
        console.log("Bucket does not exist");
      } else {
        console.log(error);
      }
    }
  }

  async checkFolderExists(folderPath) {
    try {
      // List objects with the folder path as prefix
      const result = await this.client.list({
        prefix: folderPath,
        delimiter: "/",
      });

      // Check if any objects are returned
      if (result.objects && result.objects.length > 0) {
        return true;
      } else if (result.prefixes && result.prefixes.length > 0) {
        return true;
      } else {
        return false;
      }
    } catch (err) {
      console.error("Error checking folder existence:", err);
      return false;
    }
  }

  async checkFolderOrFileExists(path) {
    try {
      // Normalize the path to ensure no trailing slashes
      if (path.endsWith("/")) {
        path = path.slice(0, -1);
      }

      // List objects with the path as prefix
      const result = await this.client.list({
        prefix: path,
        delimiter: "/",
      });

      // Check if any objects are returned for folders or files
      const objectsExist = result.objects && result.objects.length > 0;
      const prefixesExist = result.prefixes && result.prefixes.length > 0;

      if (objectsExist || prefixesExist) {
        // Check if the exact path exists as a file
        const exactFilePath = result.objects.find((obj) => obj.name === path);
        if (exactFilePath) {
          return exactFilePath.name;
        }

        // Check if the exact path exists as a folder
        const exactFolderPath = result.prefixes.find((prefix) => prefix === `${path}/`);
        if (exactFolderPath) {
          return exactFolderPath;
        }
      }

      // Return null if nothing is found
      return null;
    } catch (err) {
      console.error("Error checking folder or file existence:", err);
      return null;
    }
  }

  // list out every file or folder under the specified directory
  // however, this is pretty directory specific.
  // Let's say you have direcotry: A/B/C.txt,
  // if you try to find B, it wont be able to find it,
  // but if you try to find A/B, it will return it correctly.
  async listDirectoryContents(directory) {
    const listObjects = async (prefix) => {
      const items = [];
      let continuationToken = null;

      do {
        const res = await this.client.list({
          prefix,
          delimiter: "/",
          continuationToken,
        });

        if (res.objects) {
          res.objects.forEach((obj) => {
            if (obj.name !== prefix) {
              items.push({ type: "file", name: obj.name });
            }
          });
        }

        if (res.prefixes) {
          res.prefixes.forEach((p) => {
            if (p !== prefix) {
              items.push({ type: "directory", name: p });
            }
          });
        }

        continuationToken = res.nextContinuationToken;
      } while (continuationToken);

      return items;
    };

    const buildTree = async (prefix) => {
      const items = await listObjects(prefix);

      const result = {};

      for (const item of items) {
        const name = item.name.replace(prefix, "").replace(/\/$/, ""); // Remove trailing slash for directories
        const fullPath = item.name;

        if (name) {
          if (item.type === "directory") {
            result[name] = {
              DirectoryPath: `${fullPath}`.endsWith("/") ? `${fullPath}`.slice(0, -1) : `${fullPath}`,
              ChildItems: await buildTree(fullPath),
            };
          } else {
            result[name] = {
              DirectoryPath: `${this.baseUrl}${fullPath}`.endsWith("/")
                ? `${this.baseUrl}${fullPath}`.slice(0, -1)
                : `${this.baseUrl}${fullPath}`,
            };
          }
        } else {
          // Handle the case where the name is an empty string
          Object.assign(result, await buildTree(fullPath));
        }
      }

      return result;
    };

    try {
      const result = await buildTree(directory);

      // THIS IS ADDED SO THAT THE RESULTED DIRECTORY PATH WILL BE EMPTY IF GIVEN TARGET DIRECTORY IS INVALID.
      // ETC: Product/TEST002 IS VALID, THUS WILL RETURN DIRECTORY.
      // BUT TEST002 BY ITSELF IS NOT, THUS WILL RETURN "".
      let targetDirectory = await this.checkFolderOrFileExists(directory);
      if (targetDirectory != null) {
        targetDirectory = targetDirectory.endsWith("/") ? targetDirectory.slice(0, -1) : targetDirectory;
      }

      return {
        DirectoryPath: targetDirectory == null ? "" : `${this.baseUrl}${targetDirectory}`,
        ChildItems: result,
      };
    } catch (error) {
      console.error(`Error listing directory contents for ${directory}:`, error.message);
      throw error; // Re-throw the error after logging
    }
  }
  // gets single exact file according to the search criteria
  async returnFullFilePathDirectory(parentDirectory = "", filename) {
    try {
      // List objects in the specified directory
      const result = await this.client.list({
        prefix: parentDirectory + "/",
        delimiter: "/",
      });

      // Find the file in the listed objects
      const file = result.objects.find((obj) => obj.name.endsWith(filename));

      if (file) {
        const fullurl = this.baseUrl + file.name;
        return fullurl; // Return the full path of the file
      } else {
        console.log("File not found");
        return null;
      }
    } catch (error) {
      console.error("Error listing objects:", error);
      return null;
    }
  }

  // returns a list of files that fulfill the search requirement
  async findMatchingFilesInDirectory(searchString) {
    try {
      // List objects in the specified directory
      const result = await this.client.list({
        prefix: "",
        delimiter: "/",
      });

      // Find all files in the listed objects that match the filename
      const files = result.objects.filter((obj) => obj.name.includes(searchString));

      if (files.length > 0) {
        const fileList = files.map((file) => file.name);
        return fileList; // Return the list of the files
      } else {
        console.log("Files not found");
        return [];
      }
    } catch (error) {
      console.error("Error listing objects:", error);
      return [];
    }
  }

  async getFileExtensionFromBase64(base64String) {
    // Regular expression to match the MIME type in the base64 string
    const mimeRegex = /^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*$/;

    // Execute the regular expression to extract the MIME type
    const matches = base64String.match(mimeRegex);

    if (matches && matches.length > 1) {
      const mimeType = matches[1];
      return await this.mimeTypeToExtension(mimeType);
    }

    return "";
  }

  async mimeTypeToExtension(mimeType) {
    // A map of common MIME types to file extensions
    const mimeToExt = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/bmp": ".bmp",
      "image/webp": ".webp",
      "image/svg+xml": ".svg",
      "image/tiff": ".tiff",
      "image/x-icon": ".ico",
      "application/pdf": ".pdf",
      "application/zip": ".zip",
      "text/plain": ".txt",
      "text/html": ".html",
      "text/css": ".css",
      "text/javascript": ".js",
      "application/json": ".json",
      "application/xml": ".xml",
      // Add more MIME types and their corresponding extensions as needed
    };

    return mimeToExt[mimeType] || null;
  }

  async UploadReceipt(data, req) {
    try {
      let receiptName = "Receipt/" + data.transactionID + (await this.getFileExtensionFromBase64(data.receipt));

      const receiptUpload = await this.uploadObject(receiptName, data.receipt, req);
      if (!receiptUpload) {
        throw new Error("Upload failed for Receipt");
      }

      return { receipt: this.baseUrl + receiptName };
    } catch (error) {
      console.error("Error during upload:", error);
      return {};
    }
  }

  async UploadMemberKYC(data, req) {
    try {
      let targetFolder = "Member/" + data.memberID;
      if (await this.createFolder(targetFolder, req)) {
        if (data.identityType === "CR") {
          let companyProfileName =
            targetFolder + "/CompanyProfile" + (await this.getFileExtensionFromBase64(data.companyProfile));
          let sec14Name = targetFolder + "/Sec14" + (await this.getFileExtensionFromBase64(data.sec14));
          let sec17Name = targetFolder + "/Sec17" + (await this.getFileExtensionFromBase64(data.sec17));
          let sec51Name = targetFolder + "/Sec51" + (await this.getFileExtensionFromBase64(data.sec51));
          let sec46Name = targetFolder + "/Sec46" + (await this.getFileExtensionFromBase64(data.sec46));
          let memorandumName = targetFolder + "/Memorandum" + (await this.getFileExtensionFromBase64(data.memorandum));
          let accountsName = targetFolder + "/Accounts" + (await this.getFileExtensionFromBase64(data.accounts));

          const uploadResults = await Promise.all([
            this.uploadObject(companyProfileName, data.companyProfile, req),
            this.uploadObject(sec14Name, data.sec14, req),
            this.uploadObject(sec17Name, data.sec17, req),
            this.uploadObject(sec51Name, data.sec51, req),
            this.uploadObject(sec46Name, data.sec46, req),
            this.uploadObject(memorandumName, data.memorandum, req),
            this.uploadObject(accountsName, data.accounts, req),
          ]);

          if (uploadResults.includes(false)) {
            throw new Error("One or more uploads failed for identityType CR");
          }

          return {
            cp: this.baseUrl + companyProfileName,
            s14: this.baseUrl + sec14Name,
            s17: this.baseUrl + sec17Name,
            s51: this.baseUrl + sec51Name,
            s46: this.baseUrl + sec46Name,
            memo: this.baseUrl + memorandumName,
            acc: this.baseUrl + accountsName,
          };
        } else {
          let icFrontName = targetFolder + "/ICFront" + (await this.getFileExtensionFromBase64(data.ICFront));
          let icBackName = targetFolder + "/ICBack" + (await this.getFileExtensionFromBase64(data.ICBack));

          const icFrontUpload = await this.uploadObject(icFrontName, data.ICFront, req);
          if (!icFrontUpload) {
            throw new Error("Upload failed for ICFront");
          }

          const icBackUpload = await this.uploadObject(icBackName, data.ICBack, req);
          if (!icBackUpload) {
            throw new Error("Upload failed for ICBack");
          }

          return { icFront: icFrontUpload, icBack: icBackUpload };
        }
      } else {
        return {};
      }
    } catch (error) {
      console.error("Error during upload:", error);
      return {};
    }
  }

  async UploadProductImage(data, req) {
    try {
      let hasFolder = false;
      let targetFolder = "Product/" + data.productCode;
      let res = {};

      hasFolder = await this.checkFolderExists(targetFolder);

      if (!hasFolder) {
        hasFolder = await this.createFolder(targetFolder, req);
      }

      if (!hasFolder) {
        throw new Error(`${data.productCode} folder does not exists in OSS!`);
      } else {
        let productImageName = data.imageName === "" || data.imageName == null ? "Image_1" : data.imageName;
        let productImageDirectory =
          targetFolder + "/" + productImageName + (await this.getFileExtensionFromBase64(data.imageLink));
        const bUploadProductImage = await this.uploadObject(productImageDirectory, data.imageLink, req);
        if (!bUploadProductImage) {
          throw new Error("Upload failed for product image");
        }

        res["productImage"] = this.baseUrl + bUploadProductImage;
      }

      return res;
    } catch (error) {
      console.error("Error during upload:", error);
      return {};
    }
  }

  async UploadAnnouncementImage(data, req) {
    try {
      let imageName = data.imgName || data.announcementId || data.title;
      let targetFile = "Announcements/" + imageName;
      let res = {};

      let announcementImageDirectory = targetFile + (await this.getFileExtensionFromBase64(data.img));
      const bUploadAnnouncementImage = await this.uploadObject(announcementImageDirectory, data.img, req);
      if (!bUploadAnnouncementImage) {
        throw new Error("Upload failed for announcement image");
      }

      res["announcementImage"] = this.baseUrl + bUploadAnnouncementImage;

      return res;
    } catch (error) {
      console.error("Error during upload:", error);
      return {};
    }
  }

  async UploadDeathCert(data, req) {
    try {
      let fileName = data.unitID + "_" + data.fileName;
      let targetFile = "Death_Certificate/" + fileName;
      let res = {};

      let deathCertFileDirectory = targetFile + (await this.getFileExtensionFromBase64(data.certFile));
      const bUploadDeathCertFile = await this.uploadObject(deathCertFileDirectory, data.certFile, req);
      if (!bUploadDeathCertFile) {
        throw new Error("Upload failed for Death Certificate!");
      }

      res["deathCertFile"] = this.baseUrl + bUploadDeathCertFile;

      return res;
    } catch (error) {
      console.error("Error during upload:", error);
      return {};
    }
  }
}
module.exports = new OSS();
