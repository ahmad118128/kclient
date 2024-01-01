const crypto = require("crypto");
var fs = require("fs");

var fsw = fs.promises;
const { exec } = require("child_process");

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
    console.log("error on readFileSync:", error.message);
    return null;
  }
}

// get File hash
async function getFileHashHex(filePath) {
  const fileBuffer = readFileSync(filePath);
  if (fileBuffer) {
    const hashSum = crypto.createHash("md5");
    hashSum.update(fileBuffer);

    return hashSum.digest("binary");
  }
  return null;
}

function removeFileTemporary(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    console.log("error on removeFileTemporary:", error.message);
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
    console.log("error on createFileTemp", error.message);
    removeFileTemporary(filePath);
  }
}

// get File size
async function getFileSize(filePath, file, transmissionType) {
  console.log("3-run getFileSize");
  let size = null;

  try {
    const stats = fs.statSync(filePath);
    const fileSizeInBytes = stats.size;
    size = bytesToMegabytes(fileSizeInBytes);
    console.log("-----------------", size);
  } catch (error) {
    console.error(`------------////: ${error.message}`);
    if (transmissionType === "upload") {
      removeFileTemporary(filePath);
    }
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

async function ifExistFile(filePath) {
  let result = false;

  try {
    const stats = fs.statSync(filePath);
    if (stats.isFile()) {
      result = true;
    } else {
      console.log("not exist file in fs.statSync");
    }
  } catch (error) {
    console.log("on deleteIfUploadFileExist:", error.message);
  }
  return result;
}

async function deleteIfUploadFileExist(filePath) {
  console.log("filePath on deleteIfUploadFileExist", filePath);
  const hasFile = ifExistFile(filePath);
  if (hasFile) {
    removeFileTemporary(filePath);
  }
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
  ifExistFile,
};
