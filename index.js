//// Application Variables ////
// const CUSTOM_USER = process.env.CUSTOM_USER || "abc@abc.abc";
// const PASSWORD = process.env.PASSWORD || "abc";
// const FILE_SERVER_HOST =
//   process.env.FILE_SERVER_HOST || "http://192.168.200.2:8001";
// const MANAGER_HOST = process.env.MANAGER_HOST || "http://192.168.200.2:8000";

// local for inside network
// const CUSTOM_USER = "Radmehr.h@test1.local";
// const PASSWORD = "qqqqqq1!";
// const FILE_SERVER_HOST = "http://192.168.254.196:8001";
// const MANAGER_HOST = "http://192.168.254.198:8001";

// local constiables for outside network
const CUSTOM_USER = "radmehr.h@npdco.local";
const PASSWORD = "P@$$w0rd";
const FILE_SERVER_HOST = "https://sandbox.npd-co.com";
const MANAGER_HOST = "https://daas.npd-co.com";

const IS_ADMIN = process.env.IS_ADMIN || false;
const SUBFOLDER = process.env.SUBFOLDER || "/";
const TITLE = process.env.TITLE || "KasmVNC Client";
const FM_HOME = process.env.FM_HOME || "/config";

const UPLOADED_FILE_PATH = "uploaded_file";

var socketIO = require("socket.io");
const axios = require("axios");
const FormData = require("form-data");
var express = require("express");
var app = require("express")();
var http = require("http").Server(app);
const mime = require("mime-types");

var baseRouter = express.Router();
var fsw = require("fs").promises;
var fs = require("fs");

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
  createFileTemp,
  getFileSize,
  handleErrorCatch,
  removeFileTemporary,
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
    let fileName = file.split("/").slice(-1)[0];
    let fileBuffer = await fsw.readFile(file);
    send("sendfile", [fileBuffer, fileName]);
    const directoryPath = path.dirname(file);
    deleteFiles([file, directoryPath]);
  }

  // Write client sent file
  async function uploadFile(res, OK) {
    console.log("run uploadFile.");
    if (OK !== "OK") return; // prevent upload form client

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
    send("checkFileIsClean", {
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
  async function requestLogin({ isUploadFile, buttonIndex }) {
    console.log("6- run requestLogin");
    return await axios
      .post(
        `${MANAGER_HOST}/users/login/`,
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
        const msg = `on ${MANAGER_HOST}/users/login/:: ${error.message}`;
        send("errorClient", {
          msg: dataError,
          isUploadFile,
          buttonIndex,
        });
      });
  }

  // get user profile
  async function requestGetProfile(token) {
    console.log("7-run requestGetProfile");

    const profile = await axios
      .get(`${MANAGER_HOST}/users/profile/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then(({ data }) => {
        return data;
      })
      .catch((error) => {
        const dataError = handleErrorCatch(error);

        const msg = `on ${MANAGER_HOST}/users/profile/:: ${dataError}`;
        send("errorClient", {
          msg: dataError,
          isUploadFile: true,
          buttonIndex: false,
        });
      });
    return profile;
  }

  // check access user
  async function checkAccessUser({ isUploadFile, buttonIndex }) {
    console.log("5- run checkAccessUser", {
      CUSTOM_USER,
    });
    const loginData = await requestLogin({ isUploadFile, buttonIndex });
    const token = loginData?.access_token;

    if (!token) {
      const msg = `token not valid.`;
      send("errorClient", {
        msg,
        isUploadFile,
        buttonIndex,
      });
      return;
    } else {
      const profile = await requestGetProfile(token);
      return profile;
    }
  }

  // create file to scan
  async function requestCheckFile(res) {
    console.log("8-run requestCheckFile.");
    let result = null;
    let filePath = res.filePath;
    let file = res.file;

    let fileHash = null;
    let mimeType = mime.lookup(filePath);

    let buttonIndex = res?.buttonIndex;
    let isUploadFile = res?.isUploadFile;
    let fileName = filePath.split("/").slice(-1)[0];
    const transmissionType = res?.transmissionType;

    await getFileHash({ filePath, isUploadFile, file })
      .then((hash) => {
        fileHash = hash;
      })
      .catch((error) => console.error("Error:", error));

    if (!fileHash) {
      send("errorClient", {
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
              deleteIfUploadFileExist();
              send("errorClient", {
                msg: "Deleted File, because this file is not clean. ",
                isUploadFile,
              });
              break;

            case "IN_PROCESS":
              send("checkFileIsClean", {
                buttonIndex,
                step: "PROCESSING",
                isUploadFile,
              });
              break;

            default:
              send("errorClient", {
                msg: `Contact Support. scan_result is: ${status}`,
                isUploadFile,
              });
              deleteIfUploadFileExist();
              break;
          }
        }
      })
      .catch((error) => {
        deleteIfUploadFileExist();
        const dataError = handleErrorCatch(error);
        send("errorClient", { msg: dataError, isUploadFile, buttonIndex });
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
    const fileName = filePath.split("/").slice(-1)[0];
    const fileExtension = getFileExtensionFromName(fileName);
    const fileSize = await getFileSize(filePath, res.file, transmissionType);
    const accessUser = await checkAccessUser({ isUploadFile, buttonIndex });
    if (!accessUser) return null;

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
        send("errorClient", {
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
        send("errorClient", {
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
        send("errorClient", {
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
        send("errorClient", {
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
        send("errorClient", {
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
        send("errorClient", {
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

    let filePath = res.file;
    // if (transmissionType === "upload") {
    //   filePath = res.file.filePath;
    // }

    const hasPermission = await checkAccessPermission({
      filePath,
      file: res.file,
      transmissionType,
      buttonIndex,
    });

    if (hasPermission) {
      await requestCheckFile({
        file: res.file,
        filePath,
        buttonIndex,
        isUploadFile: transmissionType === "upload",
        transmissionType,
      });
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

    let file = res?.file;
    let fileStream = null;

    // if (!isUploadFile) {
    //   try {
    //     fileBuffer = await fsw.readFile(filePath);
    //   } catch (error) {
    //     const msg = `on readFile:: ${error.message}`;
    //     send("errorClient", {
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
    file = res?.file.data;
    // createFileTemp(filePath, file);

    // Create a ReadStream from the temporary file
    const readStream = fs.createReadStream(filePath);

    fileStream = readStream;

    const formData = new FormData();
    formData.append("file", fileStream);
    transmissionType && formData.append("transmission_type", transmissionType);

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
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          console.log("percentCompleted");
          // Emit an event for the upload progress
          // socket.emit('uploadProgress', percentCompleted);
        },
      })
      .then((response) => {
        send("checkFileIsClean", {
          buttonIndex,
          step: "PROCESSING",
          isUploadFile,
        });
      })
      .catch((error) => {
        const dataError = handleErrorCatch(error);
        deleteIfUploadFileExist();
        send("errorClient", {
          msg: dataError,
          isUploadFile,
          buttonIndex,
        });
      });
    if (isUploadFile) {
      deleteIfUploadFileExist();
      // removeFileTemporary(filePath);
    }
  }

  // errorClient
  async function errorClient(res) {
    console.log("run errorClient in node.", res);
  }

  let fileBuffer = [];
  let fileSize = 0;

  async function file_chunk(chunk) {
    fileBuffer.push(Buffer.from(chunk.data));
    fileSize += chunk.data.byteLength;

    // Calculate current progress
    const progress = Math.floor((fileSize / chunk.size) * 100);

    // Emit the progress update back to the client
    socket.emit("upload-progress", { progress });

    if (chunk.currentChunk + 1 === chunk.totalChunks) {
      let fileBufferCombined = Buffer.concat(fileBuffer);

      // Asynchronous file writing
      try {
        await fsw.writeFile(UPLOADED_FILE_PATH, fileBufferCombined);
        console.log("File upload complete");

        // send to the scan
        checkFileIsClean({
          file: UPLOADED_FILE_PATH,
          buttonIndex: null,
          transmissionType: "upload",
        });
        socket.emit("upload-complete");
      } catch (err) {
        console.error("Error writing file:", err);
        socket.emit("errorClient", "error on upload chunk, contact us.");
      }

      // Reset for next file
      fileBuffer = [];
      fileSize = 0;
    }
  }

  async function deleteIfUploadFileExist() {
    try {
      // Check if the file exists
      const stats = fs.stat(UPLOADED_FILE_PATH);

      // If fs.stat doesn't throw, the file exists, attempt to delete it
      if (stats.isFile()) {
        removeFileTemporary(UPLOADED_FILE_PATH);
      }
    } catch (error) {
      console.log("File uploaded not exist.");
    }
  }

  async function close() {
    console.log("Connection closed or disconnected");
    deleteIfUploadFileExist();
  }

  // Incoming socket requests
  socket.on("open", checkAuth);
  socket.on("getfiles", getFiles);
  socket.on("downloadfile", downloadFile);
  socket.on("uploadfile", uploadFile);
  socket.on("deletefiles", deleteFiles);
  socket.on("createfolder", createFolder);
  socket.on("checkFileIsClean", checkFileIsClean);
  socket.on("errorClient", errorClient);
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
