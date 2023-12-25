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
  fs.unlinkSync(filePath);
}

async function getFileHash({ filePath, isUploadFile, file }) {
  let mFilePath = filePath;

  if (isUploadFile) {
    mFilePath = UPLOADED_FILE_PATH;
    // createFileTemp(filePath, file.data);
  }
  return new Promise((resolve, reject) => {
    exec(`md5sum "${mFilePath}"`, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }

      const hash = stdout.split(" ")[0];
      console.log("fileHash:", hash);
      if (isUploadFile) {
        removeFileTemporary(filePath);
      }
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
  let size = null;

  try {
    const stats = fs.statSync(filePath);
    const fileSizeInBytes = stats.size;
    size = bytesToMegabytes(fileSizeInBytes);
  } catch (error) {
    console.error(`Error getting file size: ${error.message}`);
  }

  // if (transmissionType === "download") {
  //   try {
  //     const stats = fs.statSync(filePath);
  //     const fileSizeInBytes = stats.size;
  //     size = bytesToMegabytes(fileSizeInBytes);
  //   } catch (error) {
  //     console.error(`Error getting file size: ${error.message}`);
  //   }
  // } else if (transmissionType === "upload") {
  //   createFileTemp(filePath, file.data);
  //   const fileSizeInBytes = await getFileSizeInMegaBytes(filePath);
  //   size = fileSizeInBytes.toFixed(0);
  //   removeFileTemporary(filePath);
  // }
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

module.exports = {
  getFileHash,
  readFileSync,
  getFileExtensionFromName,
  createFileTemp,
  getFileSize,
  handleErrorCatch,
  getFileHashHex,
  removeFileTemporary,
};
