const crypto = require("crypto");
var fs = require("fs");

var fsw = fs.promises;
const { exec } = require("child_process");

const UPLOADED_FILE_PATH = "uploaded_file";

// handle error response
function handleErrorCatch(error) {
  const errorData = error?.response?.data?.error;
  const errorMessage = error?.message;
  const errorStatus = error?.status;

  return (
    errorData ??
    `contact support. code: ${errorStatus} message:${errorMessage} `
  );
}

function readFileSync(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf-8");
    return content;
  } catch (error) {
    console.log("error on readFileSync:", error);
    return null;
  }
}

// get File hash
async function getFileHashHex(filePath) {
  const fileBuffer = readFileSync(filePath);
  if (fileBuffer) {
    const hashSum = crypto.createHash("md5");
    hashSum.update(fileBuffer);
    // const hex = hashSum.digest("hex");
    // const base64 = hashSum.digest("base64");
    // const base64url = hashSum.digest("base64url");
    // const binary = hashSum.digest("binary");

    return hashSum.digest("binary");
  }
  return null;
}

function removeFileTemporary(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    console.log("error on removeFileTemporary:", error);
  }
}

async function getFileHash({ filePath, isUploadFile, file }) {
  console.log("9-run getFileHash");
  return new Promise((resolve, reject) => {
    exec(`md5sum "${filePath}"`, (error, stdout, stderr) => {
      if (error) {
        if (isUploadFile) {
          deleteIfUploadFileExist(filePath);
        }
        reject(error);
        return;
      }

      const hash = stdout.split(" ")[0];
      console.log("fileHash:", hash);

      resolve(hash);
    });
  });
}

function getFileExtensionFromName(fileName) {
  // EX: ".jpg"
  const lastDotIndex = fileName.lastIndexOf(".");
  if (lastDotIndex === -1) {
    return null; // No file extension found
  }

  const extension = fileName.slice(lastDotIndex + 1).toLowerCase();
  return `.${extension}`;
}

async function createFileTemp(filePath, file) {
  try {
    fs.writeFileSync(filePath, file);
  } catch (error) {
    console.log("error on createFileTemp", error);
    removeFileTemporary(filePath);
  }
}

// get File size
async function getFileSize(filePath, file, transmissionType) {
  console.log("3-run getFileSize");
  let size = null;
  // console.log({ filePath, file, transmissionType });
  // return;

  // try {
  //   const stats = fs.statSync(filePath);
  //   const fileSizeInBytes = stats.size;
  //   size = bytesToMegabytes(fileSizeInBytes);
  // } catch (error) {
  //   console.error(`Error getting file size: ${error.message}`);
  //   deleteIfUploadFileExist(filePath);
  // }

  if (transmissionType === "download") {
    try {
      const stats = fs.statSync(filePath);
      const fileSizeInBytes = stats.size;
      size = bytesToMegabytes(fileSizeInBytes);
    } catch (error) {
      console.error(`Error getting file size: ${error.message}`);
    }
  } else if (transmissionType === "upload") {
    const fileSizeInBytes = await getFileSizeInMegaBytes(filePath);
    size = fileSizeInBytes.toFixed(0);
    // removeFileTemporary(filePath);
  }
  if (!size && transmissionType === "upload") {
    deleteIfUploadFileExist(filePath);
  }
  console.log("FileSize:", size);
  return size;
}

// get File size as mb
async function getFileSizeInMegaBytes(filePath) {
  try {
    const stats = await fsw.stat(filePath);
    return stats.size / (1024 * 1024);
  } catch (error) {
    console.error(
      `Error getting file size on getFileSizeInMegaBytes: ${error.message}`
    );
  }
  return null;
}

function bytesToMegabytes(bytes) {
  return bytes / (1024 * 1024);
}

async function deleteIfUploadFileExist(filePath) {
  console.log("filePath on deleteIfUploadFileExist", filePath);
  try {
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      removeFileTemporary(filePath);
      UPLOADED_FILE_PATH = null;
    } else {
      console.log("not exist file in fs.statSync");
    }
  } catch (error) {
    console.log("on deleteIfUploadFileExist fs.statSync:", error);
  }

  // try {
  //   // Check if the file exists
  //   const stats = fs.stat(filePath);

  //   // If fs.stat doesn't throw, the file exists, attempt to delete it
  //   if (stats.isFile()) {
  //     removeFileTemporary(filePath);
  //     UPLOADED_FILE_PATH = null;
  //   } else {
  //     console.log("not exist file in fs.stat");
  //   }
  // } catch (error) {
  //   console.log("on deleteIfUploadFileExist fs.stat:", error);
  //   console.log("File uploaded not exist.");
  // }
}

module.exports = {
  getFileHash,
  readFileSync,
  getFileExtensionFromName,
  createFileTemp,
  getFileSize,
  handleErrorCatch,
  getFileHashHex,
  removeFileTemporary,
  deleteIfUploadFileExist,
};
