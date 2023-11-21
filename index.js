// LinuxServer KasmVNC Client

//// Env variables ////
// production
// var CUSTOM_USER = process.env.CUSTOM_USER || "Radmehr.h@npdco.local";
// var PASSWORD = process.env.PASSWORD || "P@$$w0rd";
// var FILE_SERVER_HOST =
//   process.env.FILE_SERVER_HOST || "http://192.168.200.2:8001";
// var MANAGER_HOST = process.env.MANAGER_HOST || "http://192.168.200.2:8000";

// local
var CUSTOM_USER = process.env.CUSTOM_USER || "Radmehr.h@test1.local";
var PASSWORD = process.env.PASSWORD || "qqqqqq1!";
var FILE_SERVER_HOST =
  process.env.FILE_SERVER_HOST || "http://192.168.2.20:8001";
var MANAGER_HOST = process.env.MANAGER_HOST || "http://192.168.2.21:8001";

var IS_ADMIN = process.env.IS_ADMIN || false;
var SUBFOLDER = process.env.SUBFOLDER || "/";
var TITLE = process.env.TITLE || "KasmVNC Client";
var FM_HOME = process.env.FM_HOME || "/config";

//// Application Variables ////
var socketIO = require("socket.io");
const path = require("path");
const axios = require("axios");

const FormData = require("form-data");
var express = require("express");
var app = require("express")();
var http = require("http").Server(app);

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

//// Server Paths Main ////
app.engine("html", require("ejs").renderFile);
app.engine("json", require("ejs").renderFile);
baseRouter.use("/public", express.static(__dirname + "/public"));
baseRouter.use("/vnc", express.static("/usr/share/kasmvnc/www/"));

function bytesToMegabytes(bytes) {
  return bytes / (1024 * 1024);
}

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

  // check access user
  async function checkAccessUser() {
    const loginData = await axios
      .post(
        `${MANAGER_HOST}/users/login/`,
        {
          email: CUSTOM_USER,
          password: PASSWORD,
          is_admin: IS_ADMIN,
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
        send("errorClient", {
          msg: error.message,
          isUploadFile: true,
        });
      });

    const token = loginData?.access_token;
    return await axios
      .get(`${MANAGER_HOST}/users/profile/`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      .then(({ data }) => {
        console.log({ data });
        return data;
      })
      .catch((error) => {
        console.log("daas.npd-co.com", error);
        send("errorClient", {
          msg: error.message,
          isUploadFile: true,
        });
      });
  }

  // Send file to client
  async function downloadFile(res, OK) {
    console.log("run download file");
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
    console.log("run uploadFile......................");
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
      buttonIndex: null,
      step: "UPLOAD_SUCCESS",
      isUploadFile: true,
    });
  }

  // Delete files
  async function deleteFiles(res) {
    console.log("run deleteFiles");
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

  // create file to scan
  async function createFileToScan(res) {
    console.log("run createFileToScan in node..........................", res);
    let url = `${FILE_SERVER_HOST}/analyze/scan/`;

    let filePath = res.filePath;
    let buttonIndex = res?.buttonIndex;
    let isUploadFile = res?.isUploadFile;
    let transmissionType = res?.transmissionType; // "download" || "upload"

    let file = res?.file;
    let fileStream = null;

    if (!isUploadFile) {
      try {
        fileBuffer = await fsw.readFile(filePath);
      } catch (error) {
        console.log("error on readFile", error);
        send("errorClient", {
          msg: error.message,
          isUploadFile,
        });
        return false;
      }
      fileStream = fs.createReadStream(filePath);
    } else {
      file = res?.file.data;
      createFileTemp(filePath, file);

      // Create a ReadStream from the temporary file
      const readStream = fs.createReadStream(filePath);

      fileStream = readStream;
    }

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
          // Set the appropriate content-type for formData
        },

        // onUploadProgress: (progressEvent) => {
        //   const percentCompleted = (progressEvent.loaded / progressEvent.total) * 100;
        //   send("checkFileIsClean", {
        //     buttonIndex,
        //     step: "PROCESSING",
        //     process: percentCompleted.toFixed(2),
        //   });
        //   console.log(`Progress: ${percentCompleted.toFixed(2)}%`);
        // },
      })
      .then((response) => {
        send("checkFileIsClean", {
          buttonIndex,
          step: "PROCESSING",
          isUploadFile,
        });
      })
      .catch((error) => {
        console.log("error in createFileToScan", error.message);
        send("errorClient", {
          msg: error.message,
          isUploadFile,
        });
      });
  }

  // create file to scan
  async function requestCheckFile(res) {
    console.log("run requestCheckFile in node..........................", res);
    let result = null;
    let filePath = res.filePath;
    let buttonIndex = res?.buttonIndex;
    let isUploadFile = res?.isUploadFile;
    let fileName = filePath.split("/").slice(-1)[0];
    let url = `${FILE_SERVER_HOST}/analyze/scan/?file_name=${fileName}`;

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
        if (Array.isArray(data) && data.length > 0) {
          const responseData = data[0];
          const antivirusesScannerStatus =
            responseData?.antiviruses_scanner_status;
          const antivirusesStatusCode = responseData?.antiviruses_status_code;
          const antivirusesScanResult = responseData?.antiviruses_scan_result;

          const clamavScannerStatus = responseData?.clamav_scanner_status;
          const clamavScanResult = responseData?.clamav_scan_result;

          if (antivirusesScannerStatus === "IN_PROCESS") {
            send("checkFileIsClean", {
              buttonIndex,
              step: "PROCESSING",
              isUploadFile,
            });
            return false;
          }

          if (
            antivirusesScannerStatus === "FINISHED" ||
            antivirusesScannerStatus === "FAILED"
          ) {
            if (antivirusesStatusCode === 200) {
              if (antivirusesScanResult) {
                // file is malware
                const directoryPath = path.dirname(filePath);
                deleteFiles([filePath, directoryPath]);
                send("errorClient", {
                  msg: "Deleted File, because this file is not clean. ",
                  isUploadFile,
                });

                return false;
              } else {
                // file is safe
                // downloadFile(res);
                result = true;
              }
            } else {
              // antivirusesStatusCode is !200
              if (clamavScannerStatus === "FAILED") {
                // try again
                send("errorClient", {
                  msg: "scan is failed. try again",
                  isUploadFile,
                });
                return false;
              }

              if (clamavScannerStatus === "IN_PROCESS") {
                // processing
                send("checkFileIsClean", {
                  isUploadFile,
                  buttonIndex,
                  step: "PROCESSING",
                });
                return false;
              }

              if (clamavScannerStatus === "FINISHED") {
                if (clamavScanResult) {
                  // file is malware
                  const directoryPath = path.dirname(filePath);
                  deleteFiles([filePath, directoryPath]);
                  send("errorClient", {
                    msg: "Deleted File, because this file is not clean. ",
                    isUploadFile,
                  });
                  return false;
                } else {
                  // file is safe
                  // downloadFile(res);
                  result = true;
                }
              }
            }
          }
        } else {
          // not created for scan
          createFileToScan(res);
        }
      })
      .catch((error) => {
        send("errorClient", { msg: error.message, isUploadFile });
      });

    return result;
  }

  function readFileSync(filePath) {
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      return content;
    } catch (error) {
      throw error;
    }
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

  async function getFileSize(filePath, file, transmissionType) {
    console.log("run getFileSize", { filePath, file, transmissionType });
    let size = null;

    if (transmissionType === "download") {
      try {
        const stats = fs.statSync(filePath);
        const fileSizeInBytes = stats.size;
        size = bytesToMegabytes(fileSizeInBytes);
      } catch (error) {
        console.error(`Error getting file size: ${error.message}`);
      }
    } else if (transmissionType === "upload") {
      createFileTemp(filePath, file.data);
      const fileSizeInBytes = await getFileSizeInMegaBytes(filePath);
      size = fileSizeInBytes.toFixed(0);
    }
    return size;
  }

  function createFileTemp(filePath, file) {
    try {
      fs.writeFileSync(filePath, file);
    } catch (error) {
      console.log("error on createFileTemp", error);
    }
  }

  async function getFileSizeInMegaBytes(filePath) {
    console.log("run getFileSizeInMegaBytes:", filePath);
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

  // Check access permission
  async function checkAccessPermission(res) {
    console.log("run checkAccessPermission", res);

    const filePath = res.filePath;
    const transmissionType = res.transmissionType;
    const fileName = filePath.split("/").slice(-1)[0];
    const fileExtension = getFileExtensionFromName(fileName);
    const fileSize = await getFileSize(filePath, res.file, transmissionType);

    const accessUser = await checkAccessUser();
    const listAccessDownloadEx =
      accessUser?.allowed_files_type_for_download || [];
    const listAccessUploadEx = accessUser?.allowed_files_type_for_upload || [];
    const maxTransmissionUploadSize =
      accessUser?.max_transmission_upload_size || 0;
    const maxTransmissionDownloadSize =
      accessUser?.max_transmission_download_size || 0;
    const canDownloadFile = accessUser?.can_download_file || false;
    const canUploadFile = accessUser?.can_upload_file || false;

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

      if (!userPermission.canDownloadFile) {
        // check can download
        send("errorClient", {
          msg: "you can not download file.",
          isUploadFile: false,
        });

        return null;
      } else if (!userPermission.accessDownloadFileExtension) {
        // check file extension download
        send("errorClient", {
          msg: `you can not download ${fileExtension} type.`,
          isUploadFile: false,
        });

        return null;
      } else if (!userPermission.maxTransmissionDownloadSize) {
        // check access file size download
        send("errorClient", {
          msg: `your file size is ${fileSize}. you can not download more than ${maxTransmissionDownloadSize} mb.`,
          isUploadFile: false,
        });

        return null;
      }
    } else {
      // Upload permissions
      if (!userPermission.canUploadFile) {
        // check can Upload
        send("errorClient", {
          msg: "you can not upload file.",
          isUploadFile: true,
        });

        return null;
      } else if (!userPermission.accessUploadFileExtension) {
        // check file extension Upload
        send("errorClient", {
          msg: `you can not upload ${fileExtension} type.`,
          isUploadFile: true,
        });

        return null;
      } else if (!userPermission.maxTransmissionUploadSize) {
        // check access file size Upload
        send("errorClient", {
          msg: `your file size is ${fileSize}. you can not upload more than ${maxTransmissionUploadSize} mb.`,
          isUploadFile: true,
        });

        return null;
      }
    }

    return true;
  }

  // checkFileIsClean
  async function checkFileIsClean(res) {
    console.log("run checkFileIsClean in node..........................", {
      res,
    });
    const transmissionType = res.transmissionType;

    let filePath = res.file;
    if (transmissionType === "upload") {
      filePath = res.file.filePath;
    }

    const hasPermission = await checkAccessPermission({
      filePath,
      file: res.file,
      transmissionType,
    });

    if (hasPermission) {
      const isCleanFile = await requestCheckFile({
        file: res.file,
        filePath,
        buttonIndex: res?.buttonIndex,
        isUploadFile: transmissionType === "upload",
        transmissionType,
      });

      if (isCleanFile) {
        if (transmissionType === "download") {
          downloadFile(res, "OK");
        } else if (transmissionType === "upload") {
          let directory = res.file.directory;
          let filePath = res.file.filePath;
          let data = res.file.data;
          let render = res.file.render;
          uploadFile(
            {
              directory,
              filePath,
              data,
              render,
            },
            "OK"
          );
        }
      }
    }
  }

  // errorClient
  async function errorClient(res) {
    console.log("run errorClient in node.", res);
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
