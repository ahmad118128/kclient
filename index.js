//// Application Variables ////
const CUSTOM_USER = process.env.CUSTOM_USER || "abc@abc.abc";
const PASSWORD = process.env.PASSWORD || "abc";
const FILE_SERVER_HOST =
  process.env.FILE_SERVER_HOST || "http://192.168.200.2:8001";
const MANAGER_HOST = process.env.MANAGER_HOST || "http://192.168.200.2:8000";

// // local for inside network
// const CUSTOM_USER = "radmehr.h@test1.local";
// const PASSWORD = "qqqqqq1!";
// const FILE_SERVER_HOST = "http://192.168.1.107:8001"; // javad
// const MANAGER_HOST = "http://192.168.1.109:8000"; // hooman

// local constiables for outside network
// const CUSTOM_USER = "radmehr.h@npdco.local";
// const PASSWORD = "P@$$w0rd";
// const FILE_SERVER_HOST = "https://sandbox.npd-co.com";
// const MANAGER_HOST = "https://daas.npd-co.com";

const IS_ADMIN = process.env.IS_ADMIN || false;
const SUBFOLDER = process.env.SUBFOLDER || "/";
const TITLE = process.env.TITLE || "KasmVNC Client";
const FM_HOME = process.env.FM_HOME || "/config";

let chunkFileBuffer = [];
let chunkFileSize = 0;

let UPLOADED_FILE_PATH = null;
const TEMP_DIRECTORY = "/tmp/";
const UPLOAD_DIRECTORY = "/config/Desktop/upload/";
let scannedFileInfo = null;
var socketIO = require("socket.io");
const path = require("path");
const axios = require("axios");
const FormData = require("form-data");
var express = require("express");
var app = require("express")();
var http = require("http").Server(app);
const mime = require("mime-types");
var fsw = require("fs").promises;
var fs = require("fs");
var baseRouter = express.Router();

// Audio init
var audioEnabled = true;
var PulseAudio = require("pulseaudio2");
var pulse = new PulseAudio();

pulse.on("error", function (error) {
  console.log(error.message);
  audioEnabled = false;
  console.log(
    "Kclient was unable to init audio, it is possible your host lacks support!!!!"
  );
});

const {
  getFileHash,
  getFileExtensionFromName,
  getFileSize,
  handleErrorCatch,
  deleteIfUploadFileExist,
  ifExistFile,
} = require("./functions.js");

//// Server Paths Main ////
app.engine("html", require("ejs").renderFile);
app.engine("json", require("ejs").renderFile);
baseRouter.use("/public", express.static(__dirname + "/public"));
baseRouter.use("/vnc", express.static("/usr/share/kasmvnc/www/"));

baseRouter.get("/", function (req, res) {
  res.render(__dirname + "/public/index.html", { title: TITLE });
});

baseRouter.get("/favicon.ico", function (req, res) {
  res.sendFile(__dirname + "/public/favicon.ico");
});

baseRouter.get("/manifest.json", function (req, res) {
  res.render(__dirname + "/public/manifest.json", { title: TITLE });
});

//// Web File Browser ////
// Send landing page
baseRouter.get("/files", function (req, res) {
  res.sendFile(__dirname + "/public/filebrowser.html");
});

// Websocket comms //
io = socketIO(http, {
  path: SUBFOLDER + "files/socket.io",
  maxHttpBufferSize: 500000000,
});

// file browser socket connection
io.on("connection", async function (socket) {
  let id = socket.id;

  //// Functions ////

  // Open default location
  async function checkAuth(password) {
    getFiles(FM_HOME);
  }

  // Emit to user
  function send(command, data) {
    io.sockets.to(id).emit(command, data);
  }

  // Get file list for directory
  async function getFiles(directory) {
    try {
      let items = await fsw.readdir(directory);
      if (items.length > 0) {
        let dirs = [];
        let files = [];
        for await (let item of items) {
          let fullPath = directory + "/" + item;
          if (fs.lstatSync(fullPath).isDirectory()) {
            dirs.push(item);
          } else {
            files.push(item);
          }
        }
        send("renderfiles", [dirs, files, directory]);
      } else {
        send("renderfiles", [[], [], directory]);
      }
    } catch (error) {
      send("renderfiles", [[], [], directory]);
    }
  }

  // Send file to client
  async function downloadFile(res, OK) {
    console.log("run downloadFile.");
    if (OK !== "OK") return; // prevent download form client

    const file = res.file;
    // let fileName = file.split("/").slice(-1)[0];
    let fileName = res.fileName;

    let fileBuffer = await fsw.readFile(file);
    send("sendfile", [fileBuffer, fileName]);
    const directoryPath = path.dirname(file);
    deleteFiles([file, directoryPath]);
  }

  // Write client sent file
  async function uploadFile({ render, filePath, directory }, OK) {
    console.log("run uploadFile.");
    if (OK !== "OK") {
      return;
    } // prevent upload form client

    const fileName = filePath.split("/").slice(-1)[0];
    const mFilePath = `${UPLOAD_DIRECTORY}${fileName}`;

    console.log({
      render,
      fileName,
      directory,
      filePath,
      mFilePath,
      UPLOAD_DIRECTORY,
    });
    // let directory = res.directory;
    // let filePath = res.filePath;
    // // let data = res.data;
    // let render = res.render;
    // let dirArr = filePath.split("/");
    // let folder = filePath.replace(dirArr[dirArr.length - 1], "");
    // const resultUploaded = await moveFileToDirectory({
    //   sourceFilePath: filePath,
    //   targetDir: UPLOAD_DIRECTORY,
    //   targetFilePath: mFilePath,
    // });
    // // await fsw.mkdir(folder, { recursive: true });
    // // await fsw.writeFile(filePath, Buffer.from(data));
    // if (resultUploaded) {
    //   console.log("resultUploaded true");
    // } else {
    //   console.log("resultUploaded false");

    //   return;
    // }
    // if (render) {
    //   getFiles(directory);
    // }
    // send("check-file-is-clean", {
    //   downloadBtnIndex: false,
    //   step: "UPLOAD_SUCCESS",
    //   isUploadFile: true,
    // });
  }

  // Delete files
  async function deleteFiles(res) {
    console.log("run deleteFiles.");
    let item = res[0];
    let directory = res[1];
    item = item.replace("|", "'");
    if (fs.lstatSync(item).isDirectory()) {
      await fsw.rm(item, { recursive: true });
    } else {
      await fsw.unlink(item);
    }
    getFiles(directory);
  }

  // Create a folder
  async function createFolder(res) {
    let dir = res[0];
    let directory = res[1];
    if (!fs.existsSync(dir)) {
      await fsw.mkdir(dir);
    }
    getFiles(directory);
  }

  // login user
  async function requestLogin({ isUploadFile, downloadBtnIndex, filePath }) {
    console.log("6- run requestLogin");
    const url = `${MANAGER_HOST}/users/login/`;

    return await axios
      .post(
        url,
        {
          email: CUSTOM_USER,
          password: PASSWORD,
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      )
      .then(({ data }) => {
        return data;
      })
      .catch((error) => {
        const dataError = handleErrorCatch(error);
        console.log(`on ${url}: ${error.message}`);
        send("error-client", {
          msg: dataError,
          isUploadFile,
          downloadBtnIndex,
        });
      });
  }

  // get user profile
  async function requestGetProfile({ token, isUploadFile, filePath }) {
    console.log("7-run requestGetProfile");
    const url = `${MANAGER_HOST}/users/profile/`;
    const profile = await axios
      .get(url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then(({ data }) => {
        return data;
      })
      .catch((error) => {
        const dataError = handleErrorCatch(error);
        console.log(`on requestGetProfile: ${error.message}`);
        send("error-client", {
          msg: dataError,
          isUploadFile: true,
          downloadBtnIndex: false,
        });
      });
    return profile;
  }

  // check access user
  async function checkAccessUser({ isUploadFile, downloadBtnIndex, filePath }) {
    console.log("5- run checkAccessUser", {
      CUSTOM_USER,
    });
    const loginData = await requestLogin({
      isUploadFile,
      downloadBtnIndex,
      filePath,
    });
    const token = loginData?.access_token;

    if (!token) {
      const msg = `token not valid.`;
      send("error-client", {
        msg,
        isUploadFile,
        downloadBtnIndex,
      });
      return;
    } else {
      const profile = await requestGetProfile({
        token,
        isUploadFile,
        filePath,
      });
      return profile;
    }
  }

  // request for check status
  async function requestGetCheckFile({
    fileName,
    fileHash,
    mimeType,
    transmissionType,
    filePath,
    directoryPath,
    downloadBtnIndex,
  }) {
    console.log("10-requestCheckFile");
    const isUploadFile = transmissionType === "upload";
    let url = `${FILE_SERVER_HOST}/analyze/scan/?file_name=${fileName}&file_hash=${fileHash}&file_mime_type=${mimeType}`;
    scannedFileInfo = {
      fileName,
      fileHash,
      mimeType,
      transmissionType,
      filePath,
      directoryPath,
      downloadBtnIndex,
    };

    await axios
      .get(url, {
        auth: {
          username: CUSTOM_USER,
          password: PASSWORD,
        },
        headers: {
          "Content-Type": "application/json",
        },
      })
      .then(({ data }) => {
        console.log({ data });
        const status = data?.scan_result; // CLEAN  MALWARE IN_PROCESS TRY_AGAIN
        if (Array.isArray(data.results) && data?.results.length === 0) {
          // not created for scan
          createFileToScan({
            filePath,
            downloadBtnIndex,
            isUploadFile,
            transmissionType,
          });
        } else {
          switch (status) {
            case "CLEAN":
              if (transmissionType === "upload") {
                uploadFileFromServerUrl({
                  fileHash: data.file_hash,
                })
                  .then(() => {
                    send("check-file-is-clean", {
                      downloadBtnIndex: false,
                      step: "UPLOAD_SUCCESS",
                      isUploadFile: true,
                    });
                  })
                  .catch((error) => {
                    // Handle the error
                    send("error-client", {
                      msg: `upload failed.`,
                      isUploadFile: true,
                    });
                    console.error(
                      "Failed to download and save the file:",
                      error
                    );
                  });
              } else if (transmissionType === "download") {
                downloadFile({ file: filePath, fileName }, "OK");
              }
              break;

            case "MALWARE":
              deleteFiles([filePath, directoryPath]);
              send("check-file-is-clean", {
                downloadBtnIndex,
                step: "NOT_CLEAN",
                isUploadFile,
              });
              break;

            case "IN_PROCESS":
              send("check-file-is-clean", {
                downloadBtnIndex,
                step: "PROCESSING",
                isUploadFile,
              });

              break;

            case "TRY_AGAIN":
              send("check-file-is-clean", {
                downloadBtnIndex,
                step: "PROCESSING",
                isUploadFile,
              });

              break;

            default:
              send("error-client", {
                msg: `Contact Support. scan_result is: ${status}`,
                isUploadFile,
              });

              break;
          }
        }
      })
      .catch((error) => {
        console.log(`on requestCheckFile:`, error.message);
        const dataError = handleErrorCatch(error);
        send("error-client", {
          msg: dataError,
          isUploadFile,
          downloadBtnIndex,
        });
      });
  }

  // prepare For CheckFile
  async function prepareForCheckFile(res) {
    console.log("8-run prepareForCheckFile.");
    let filePath = res.filePath;
    let file = res.file;
    let mimeType = res.mimeType;
    let fileName = res.fileName;
    let downloadBtnIndex = res?.downloadBtnIndex;
    const transmissionType = res?.transmissionType;
    let isUploadFile = res?.isUploadFile;
    const directoryPath = path.dirname(filePath);

    let fileHash = null;
    if (!mimeType) {
      // file for download not have mimeType
      mimeType = mime.lookup(filePath);
    }

    await getFileHash({ filePath, isUploadFile, file })
      .then((hash) => {
        fileHash = hash;
      })
      .catch((error) => console.error("Error:", error));

    if (!fileHash) {
      if (isUploadFile) {
        deleteIfUploadFileExist(filePath);
      }
      send("error-client", {
        msg: "error on get hash file.",
        isUploadFile,
        downloadBtnIndex,
      });
      return;
    }

    requestGetCheckFile({
      fileName,
      fileHash,
      mimeType,
      transmissionType,
      filePath,
      directoryPath,
      downloadBtnIndex,
    });
  }

  // Check access permission
  async function checkAccessPermission(res) {
    console.log("2-run checkAccessPermission.");
    let hasPermission = null;
    const filePath = res.filePath;
    const transmissionType = res.transmissionType;
    const downloadBtnIndex = res.downloadBtnIndex;
    const isUploadFile = transmissionType === "upload";
    const fileName = res.fileName;
    // const fileName = filePath.split("/").slice(-1)[0];
    const fileExtension = getFileExtensionFromName(fileName);
    const fileSize = await getFileSize(filePath, res.file, transmissionType);
    const accessUser = await checkAccessUser({
      isUploadFile,
      downloadBtnIndex,
      filePath,
    });
    if (!accessUser) {
      if (isUploadFile) {
        deleteIfUploadFileExist(filePath);
      }
      return null;
    }

    const daasConfigs = accessUser?.daas_configs;

    const listAccessDownloadEx =
      accessUser?.allowed_files_type_for_download || [];
    const listAccessUploadEx = accessUser?.allowed_files_type_for_upload || [];
    const maxTransmissionUploadSize =
      daasConfigs?.max_transmission_upload_size || 0;
    const maxTransmissionDownloadSize =
      daasConfigs?.max_transmission_download_size || 0;
    const canDownloadFile = daasConfigs?.can_download_file || false;
    const canUploadFile = daasConfigs?.can_upload_file || false;

    const userPermission = {
      canUploadFile,
      canDownloadFile,
      maxTransmissionUploadSize:
        fileSize && fileSize <= maxTransmissionUploadSize,
      maxTransmissionDownloadSize:
        fileSize && fileSize <= maxTransmissionDownloadSize,
      accessUploadFileExtension: listAccessUploadEx.includes(fileExtension),
      accessDownloadFileExtension: listAccessDownloadEx.includes(fileExtension),
    };

    if (transmissionType === "download") {
      // Download permissions
      // check user can download

      if (!userPermission.canDownloadFile) {
        // check can download
        send("error-client", {
          msg: "you can not download file.",
          isUploadFile: false,
          downloadBtnIndex,
        });

        hasPermission = null;
        return null;
      } else {
        hasPermission = true;
      }

      // check download file extension
      if (!userPermission.accessDownloadFileExtension) {
        // check file extension download
        send("error-client", {
          msg: `you can not download ${fileExtension} type.`,
          isUploadFile: false,
          downloadBtnIndex,
        });

        hasPermission = null;
        return null;
      } else {
        hasPermission = true;
      }

      // check max transmission download
      if (!userPermission.maxTransmissionDownloadSize) {
        // check access file size download
        send("error-client", {
          msg: `your file size is ${fileSize}. you can not download more than ${maxTransmissionDownloadSize} mb.`,
          isUploadFile: false,
          downloadBtnIndex,
        });

        hasPermission = null;
        return null;
      } else {
        hasPermission = true;
      }
    } else if (transmissionType === "upload") {
      // Upload permissions
      // check can user upload
      if (!userPermission.canUploadFile) {
        // check can Upload
        send("error-client", {
          msg: "you can not upload file.",
          isUploadFile: true,
          downloadBtnIndex,
        });

        hasPermission = null;
        return null;
      } else {
        hasPermission = true;
      }

      // check access file extension
      if (!userPermission.accessUploadFileExtension) {
        // check file extension Upload
        send("error-client", {
          msg: `you can not upload ${fileExtension} type.`,
          isUploadFile: true,
          downloadBtnIndex,
        });

        hasPermission = null;
        return null;
      } else {
        hasPermission = true;
      }

      // check max transmission upload
      if (!userPermission.maxTransmissionUploadSize) {
        // check access file size Upload
        send("error-client", {
          msg: `your file size is ${fileSize}. you can not upload more than ${maxTransmissionUploadSize} mb.`,
          isUploadFile: true,
          downloadBtnIndex,
        });

        hasPermission = null;
        return null;
      } else {
        hasPermission = true;
      }
    }

    return hasPermission;
  }

  // checkFileIsClean
  async function checkFileIsClean(res) {
    console.log("1- run checkFileIsClean.");
    const transmissionType = res.transmissionType;
    const downloadBtnIndex = res.downloadBtnIndex;
    const fileName = res.fileName;
    const mimeType = res.type;
    let filePath = res.file;
    // if (transmissionType === "upload") {
    //   filePath = res.file.filePath;
    // }

    const hasPermission = await checkAccessPermission({
      fileName,
      filePath,
      file: res.file,
      transmissionType,
      downloadBtnIndex,
    });

    if (hasPermission) {
      await prepareForCheckFile({
        mimeType,
        fileName,
        file: res.file,
        filePath,
        downloadBtnIndex,
        isUploadFile: transmissionType === "upload",
        transmissionType,
      });
    } else {
      if (transmissionType === "upload") {
        deleteIfUploadFileExist(filePath);
      }
    }
  }

  // create file to scan
  async function createFileToScan({
    filePath,
    downloadBtnIndex,
    isUploadFile,
    transmissionType,
  }) {
    console.log("11-run createFileToScan.");
    let url = `${FILE_SERVER_HOST}/analyze/scan/`;

    // Create a ReadStream from the temporary file
    let readStream = null;

    try {
      readStream = fs.createReadStream(filePath);
    } catch (error) {
      if (isUploadFile) {
        deleteIfUploadFileExist(filePath);
      }
      console.log("error on fs.createReadStream", { error });
    }
    if (!readStream) {
      send("error-client", {
        msg,
        isUploadFile,
        downloadBtnIndex,
      });
      return false;
    }
    const formData = new FormData();
    formData.append("file", readStream);
    formData.append("transmission_type", transmissionType);

    await axios
      .post(url, formData, {
        auth: {
          username: CUSTOM_USER,
          password: PASSWORD,
        },
        headers: {
          ...formData.getHeaders(),
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          // Emit an event for the upload progress
          socket.emit("upload-progress", {
            transmissionType,
            progress,
            downloadBtnIndex,
          });
        },
      })
      .then(({ data }) => {
        // data: { info: 'scanning files in process' }

        send("check-file-is-clean", {
          downloadBtnIndex,
          step: "ACTIVE_CHECK_SCAN",
          isUploadFile,
          scannedFileInfo,
        });
      })
      .catch((error) => {
        const dataError = handleErrorCatch(error);
        console.log(`on ${url}:`, error.message);
        if (isUploadFile) {
          deleteIfUploadFileExist(filePath);
        }
        send("error-client", {
          msg: dataError,
          isUploadFile,
          downloadBtnIndex,
        });
      });

    if (isUploadFile) {
      deleteIfUploadFileExist(filePath);
    }
  }

  // upload file from server url
  function uploadFileFromServerUrl({ fileHash }) {
    console.log("run uploadFileFromServerUrl");
    try {
      if (!fs.existsSync(UPLOAD_DIRECTORY)) {
        fs.mkdirSync(UPLOAD_DIRECTORY, { recursive: true });
      }
    } catch (error) {
      console.log("------ on moveFileToDirectory", { error });
      throw error;
    }

    // // Extract the filename from the URL
    const fileName = path.basename(UPLOADED_FILE_PATH);
    const localFilePath = path.join(UPLOAD_DIRECTORY, fileName);

    // Axios GET request for the file stream
    return axios
      .get(`${FILE_SERVER_HOST}/analyze/download/?file_hash=${fileHash}`, {
        responseType: "stream",
        auth: {
          username: CUSTOM_USER,
          password: PASSWORD,
        },
      })
      .then((response) => {
        // Create a write stream for the local file
        const writer = fs.createWriteStream(localFilePath);

        // // Pipe the data into the write stream
        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
          writer.on("finish", () => {
            console.log(
              `------------------ File downloaded and saved to ${localFilePath}`
            );
            resolve();
          });
          writer.on("error", reject);
        });
      })
      .catch((error) => {
        console.error("------------------- Error downloading the file:", error);
        throw error;
      });
  }

  // move File To Directory

  async function moveFileToDirectory({
    sourceFilePath,
    targetDir,
    targetFilePath,
  }) {
    console.log("||||||||", {
      sourceFilePath,
      targetDir,
      targetFilePath,
    });
    try {
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
        console.log("Folder created successfully");
      }
    } catch (error) {
      console.log("------ on moveFileToDirectory", { error });
    }

    // Copy the file
    fs.copyFile(sourceFilePath, targetFilePath)
      .then(() => {
        console.log("--------- File copied successfully.");
        // Once the file is copied, delete the original file
        return fs.unlink(sourceFilePath);
      })
      .then(() => {
        console.log("------------- Original file deleted successfully.");
      })
      .catch((error) => {
        // Handle errors if any
        console.error("An error occurred:", error);
      });
  }

  // errorClient
  async function errorClient(res) {
    console.log("run errorClient in node.", res);
  }

  async function file_chunk({
    filePath,
    fileName,
    type,
    size,
    data,
    currentChunk,
    totalChunks,
  }) {
    chunkFileBuffer.push(Buffer.from(data));
    chunkFileSize += data.byteLength;
    const tempFileUploadPath = `${TEMP_DIRECTORY}${fileName}`;
    console.log({ tempFileUploadPath, filePath, fileName });

    // Calculate current progress
    const progress = Math.floor((chunkFileSize / size) * 100);

    // Emit the progress update back to the client
    socket.emit("upload-progress", {
      transmissionType: "upload",
      progress,
      downloadBtnIndex: null,
    });

    if (currentChunk + 1 === totalChunks) {
      let fileBufferCombined = Buffer.concat(chunkFileBuffer);
      // Reset for next file
      chunkFileBuffer = [];
      chunkFileSize = 0;
      // Asynchronous file writing
      try {
        await fsw.writeFile(tempFileUploadPath, fileBufferCombined);
        // send to the scan

        UPLOADED_FILE_PATH = tempFileUploadPath;
        socket.emit("upload-complete");
        checkFileIsClean({
          type,
          fileName,
          file: tempFileUploadPath,
          downloadBtnIndex: null,
          transmissionType: "upload",
        });
      } catch (err) {
        console.error("Error writing file:", err);
        socket.emit("error-client", "error on upload chunk, contact us.");
      }
    }
  }

  // set request from client
  async function set_request({ type, data }) {
    switch (type) {
      case "CHECK_STATUS":
        requestGetCheckFile({
          fileName: scannedFileInfo?.fileName,
          fileHash: scannedFileInfo?.fileHash,
          mimeType: scannedFileInfo?.mimeType,
          transmissionType: scannedFileInfo?.transmissionType,
          filePath: scannedFileInfo?.filePath,
          directoryPath: scannedFileInfo?.directoryPath,
          downloadBtnIndex: scannedFileInfo?.downloadBtnIndex,
        });
        console.log("--------set_request", { data });
        break;

      default:
        break;
    }
  }

  async function close() {
    console.log("Connection closed or disconnected");
    if (UPLOADED_FILE_PATH) {
      deleteIfUploadFileExist(UPLOADED_FILE_PATH);
    }
  }

  // Incoming socket requests
  socket.on("open", checkAuth);
  socket.on("getfiles", getFiles);
  socket.on("deletefiles", deleteFiles);
  socket.on("createfolder", createFolder);
  socket.on("check-file-is-clean", checkFileIsClean);
  socket.on("error-client", errorClient);
  socket.on("file_chunk", file_chunk);
  socket.on("request", set_request);
  socket.on("disconnect", close);
  socket.on("close", close);
});

//// PCM Audio Wrapper ////
aio = socketIO(http, { path: SUBFOLDER + "audio/socket.io" });
aio.on("connection", function (socket) {
  var record;
  let id = socket.id;

  function open() {
    if (audioEnabled) {
      if (record) record.end();
      record = pulse.createRecordStream({
        channels: 2,
        rate: 44100,
        format: "F32LE",
      });
      record.on("connection", function () {
        record.on("data", function (chunk) {
          // Only send real audio data
          if (chunk.length < 26456) {
            aio.sockets.to(id).emit("audio", chunk);
          }
        });
      });
    }
  }
  function close() {
    if (audioEnabled) {
      if (record) record.end();
    }
  }

  // Incoming socket requests
  socket.on("open", open);
  socket.on("close", close);
  socket.on("disconnect", close);
});

// Spin up application on 6900
app.use(SUBFOLDER, baseRouter);
http.listen(6900);
