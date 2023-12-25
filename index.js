//// Application Variables ////
// const CUSTOM_USER = process.env.CUSTOM_USER || "abc@abc.abc";
// const PASSWORD = process.env.PASSWORD || "abc";
// const FILE_SERVER_HOST =
//   process.env.FILE_SERVER_HOST || "http://192.168.200.2:8001";
// const MANAGER_HOST = process.env.MANAGER_HOST || "http://192.168.200.2:8000";

// local for inside network
const CUSTOM_USER = "radmehr.h@test1.local";
const PASSWORD = "qqqqqq1!";
const FILE_SERVER_HOST = "http://192.168.254.196:8001";
const MANAGER_HOST = "http://192.168.254.198:8000";

// local constiables for outside network
// const CUSTOM_USER = "radmehr.h@npdco.local";
// const PASSWORD = "P@$$w0rd";
// const FILE_SERVER_HOST = "https://sandbox.npd-co.com";
// const MANAGER_HOST = "https://daas.npd-co.com";

const IS_ADMIN = process.env.IS_ADMIN || false;
const SUBFOLDER = process.env.SUBFOLDER || "/";
const TITLE = process.env.TITLE || "KasmVNC Client";
const FM_HOME = process.env.FM_HOME || "/config";

let UPLOADED_FILE_PATH = null;

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
  console.log(error);
  audioEnabled = false;
  console.log(
    "Kclient was unable to init audio, it is possible your host lacks support!!!!"
  );
});

// const {
//   CUSTOM_USER,
//   PASSWORD,
//   FILE_SERVER_HOST,
//   MANAGER_HOST,
//   IS_ADMIN,
//   SUBFOLDER,
//   TITLE,
//   FM_HOME,
//   UPLOADED_FILE_PATH,
// } = require("./constants.js");
// Import My Methods //
const {
  getFileHash,
  getFileExtensionFromName,
  getFileSize,
  handleErrorCatch,
  deleteIfUploadFileExist,
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
  async function uploadFile(res, OK) {
    console.log("run uploadFile.");
    if (OK !== "OK") {
      return;
    } // prevent upload form client

    let directory = res.directory;
    let filePath = res.filePath;
    let data = res.data;
    let render = res.render;
    let dirArr = filePath.split("/");
    let folder = filePath.replace(dirArr[dirArr.length - 1], "");

    await fsw.mkdir(folder, { recursive: true });
    await fsw.writeFile(filePath, Buffer.from(data));
    if (render) {
      getFiles(directory);
    }
    send("check-file-is-clean", {
      buttonIndex: false,
      step: "UPLOAD_SUCCESS",
      isUploadFile: true,
    });
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
  async function requestLogin({ isUploadFile, buttonIndex, filePath }) {
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
          buttonIndex,
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
        console.log(`on ${url}: ${error.message}`);
        send("error-client", {
          msg: dataError,
          isUploadFile: true,
          buttonIndex: false,
        });
      });
    return profile;
  }

  // check access user
  async function checkAccessUser({ isUploadFile, buttonIndex, filePath }) {
    console.log("5- run checkAccessUser", {
      CUSTOM_USER,
    });
    const loginData = await requestLogin({
      isUploadFile,
      buttonIndex,
      filePath,
    });
    const token = loginData?.access_token;

    if (!token) {
      const msg = `token not valid.`;
      send("error-client", {
        msg,
        isUploadFile,
        buttonIndex,
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

  // create file to scan
  async function requestCheckFile(res) {
    console.log("8-run requestCheckFile.");
    let result = null;
    let filePath = res.filePath;
    let file = res.file;
    let mimeType = res.mimeType;
    const transmissionType = res?.transmissionType;
    let buttonIndex = res?.buttonIndex;
    let isUploadFile = res?.isUploadFile;
    let fileName = res.fileName;

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
        buttonIndex,
      });
      return;
    }

    let url = `${FILE_SERVER_HOST}/analyze/scan/?file_name=${fileName}&file_hash=${fileHash}&file_mime_type=${mimeType}`;

    console.log("10-run call get.");

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
        const status = data?.scan_result; // CLEAN  MALWARE IN_PROCESS TRY_AGAIN
        console.log("status of get:", status);
        if (Array.isArray(data.results) && data?.results.length === 0) {
          // not created for scan
          createFileToScan(res);
        } else {
          switch (status) {
            case "CLEAN":
              if (transmissionType === "upload") {
                uploadFile(
                  {
                    directory: res.file.directory,
                    filePath: res.file.filePath,
                    data: res.file.data,
                    render: res.file.render,
                  },
                  "OK"
                );
              } else if (transmissionType === "download") {
                downloadFile(res, "OK");
              }

              break;

            case "MALWARE":
              const directoryPath = path.dirname(filePath);
              deleteFiles([filePath, directoryPath]);
              send("error-client", {
                msg: "Deleted File, because this file is not clean. ",
                isUploadFile,
              });
              break;

            case "IN_PROCESS":
              send("check-file-is-clean", {
                buttonIndex,
                step: "PROCESSING",
                isUploadFile,
              });
              if (isUploadFile) {
                deleteIfUploadFileExist(filePath);
              }
              break;

            default:
              send("error-client", {
                msg: `Contact Support. scan_result is: ${status}`,
                isUploadFile,
              });
              if (isUploadFile) {
                deleteIfUploadFileExist(filePath);
              }
              break;
          }
        }
      })
      .catch((error) => {
        if (isUploadFile) {
          deleteIfUploadFileExist(filePath);
        }
        console.log(`on ${url}:`, error.message);
        const dataError = handleErrorCatch(error);
        send("error-client", { msg: dataError, isUploadFile, buttonIndex });
      });

    return result;
  }

  // Check access permission
  async function checkAccessPermission(res) {
    console.log("2-run checkAccessPermission.");
    let hasPermission = null;
    const filePath = res.filePath;
    const transmissionType = res.transmissionType;
    const buttonIndex = res.buttonIndex;
    const isUploadFile = transmissionType === "upload";
    const fileName = res.fileName;
    // const fileName = filePath.split("/").slice(-1)[0];
    const fileExtension = getFileExtensionFromName(fileName);
    const fileSize = await getFileSize(filePath, res.file, transmissionType);
    const accessUser = await checkAccessUser({
      isUploadFile,
      buttonIndex,
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
          buttonIndex,
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
          buttonIndex,
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
          buttonIndex,
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
          buttonIndex,
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
          buttonIndex,
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
          buttonIndex,
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
    const buttonIndex = res.buttonIndex;
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
      buttonIndex,
    });

    if (hasPermission) {
      await requestCheckFile({
        mimeType,
        fileName,
        file: res.file,
        filePath,
        buttonIndex,
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
  async function createFileToScan(res) {
    console.log("11-run createFileToScan.");
    let url = `${FILE_SERVER_HOST}/analyze/scan/`;
    let filePath = res.filePath;
    let buttonIndex = res?.buttonIndex;
    let isUploadFile = res?.isUploadFile;
    let transmissionType = res?.transmissionType; // "download" || "upload"
    // let file = res?.file;
    // file = res?.file.data;

    try {
      fileBuffer = await fsw.readFile(filePath);
    } catch (error) {
      const msg = `on readFile:: ${error.message}`;
      if (isUploadFile) {
        deleteIfUploadFileExist(filePath);
      }
      send("error-client", {
        msg,
        isUploadFile,
        buttonIndex,
      });
      return false;
    }

    // if (!isUploadFile) {
    //   try {
    //     fileBuffer = await fsw.readFile(filePath);
    //   } catch (error) {
    //     const msg = `on readFile:: ${error.message}`;
    //     send("error-client", {
    //       msg,
    //       isUploadFile,
    //       buttonIndex,
    //     });
    //     return false;
    //   }
    //   fileStream = fs.createReadStream(filePath);
    // } else {
    //   file = res?.file.data;
    //   createFileTemp(filePath, file);

    //   // Create a ReadStream from the temporary file
    //   const readStream = fs.createReadStream(filePath);

    //   fileStream = readStream;
    // }
    // file = res?.file.data;
    // createFileTemp(filePath, file);

    // Create a ReadStream from the temporary file
    let readStream = null;

    try {
      readStream = fs.createReadStream(filePath);
    } catch (error) {
      console.log("error on fs.createReadStream", { error });
    }
    // console.log({ readStream });
    if (!readStream) {
      if (isUploadFile) {
        deleteIfUploadFileExist(filePath);
      }
      send("error-client", {
        msg,
        isUploadFile,
        buttonIndex,
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
            buttonIndex,
          });
        },
      })
      .then((response) => {
        send("check-file-is-clean", {
          buttonIndex,
          step: "PROCESSING",
          isUploadFile,
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
          buttonIndex,
        });
      });
    if (isUploadFile) {
      deleteIfUploadFileExist(filePath);
      // removeFileTemporary(filePath);
    }
  }

  // errorClient
  async function errorClient(res) {
    console.log("run errorClient in node.", res);
  }

  let fileBuffer = [];
  let fileSize = 0;

  async function file_chunk({
    filePath,
    fileName,
    type,
    size,
    data,
    currentChunk,
    totalChunks,
  }) {
    fileBuffer.push(Buffer.from(data));
    fileSize += data.byteLength;

    // Calculate current progress
    const progress = Math.floor((fileSize / size) * 100);

    // Emit the progress update back to the client
    socket.emit("upload-progress", {
      transmissionType: "upload",
      progress,
      buttonIndex: null,
    });

    if (currentChunk + 1 === totalChunks) {
      let fileBufferCombined = Buffer.concat(fileBuffer);

      // Asynchronous file writing
      try {
        await fsw.writeFile(filePath, fileBufferCombined);
        // send to the scan
        UPLOADED_FILE_PATH = filePath;
        checkFileIsClean({
          type,
          fileName,
          file: filePath,
          buttonIndex: null,
          transmissionType: "upload",
        });
        socket.emit("upload-complete");
      } catch (err) {
        console.error("Error writing file:", err);
        socket.emit("error-client", "error on upload chunk, contact us.");
      }

      // Reset for next file
      fileBuffer = [];
      fileSize = 0;
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
