// LinuxServer KasmVNC Client

//// Env variables ////
var CUSTOM_USER = process.env.CUSTOM_USER || "abc";
var PASSWORD = process.env.PASSWORD || "abc";
var SUBFOLDER = process.env.SUBFOLDER || "/";
var TITLE = process.env.TITLE || "KasmVNC Client";
var FM_HOME = process.env.FM_HOME || "/config";
var ANALYZE_HOST = "192.168.2.20";
var ACCESS_USER_URL = "http://192.168.2.21:8000/users/profile/";
var ANALYZE_PORT = 8000;
var ANALYZE_PATH = "/analyze/scan/";

//// Application Variables ////
var socketIO = require("socket.io");
const path = require("path");
const axios = require("axios");

const FormData = require("form-data");
var express = require("express");
var ejs = require("ejs");
var app = require("express")();
var http = require("http").Server(app);

var bodyParser = require("body-parser");
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
  maxHttpBufferSize: 200000000,
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
  async function checkAccessUser(token) {
    return await axios
      .get(ACCESS_USER_URL, {
        headers: {
          // "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      })
      .then(({ data }) => {
        return data;

        // clipboard_up: false,
        // clipboard_down: false,
      })
      .catch((error) => {
        console.log("daas.npd-co.com", error);
        send("errorClient", error.message);
      });
  }

  // Send file to client
  async function downloadFile(res) {
    console.log("run download file", res);
    const file = res.file;
    let fileName = file.split("/").slice(-1)[0];
    let fileBuffer = await fsw.readFile(file);
    send("sendfile", [fileBuffer, fileName]);
    const directoryPath = path.dirname(file);
    deleteFiles([file, directoryPath]);
  }

  // Write client sent file
  async function uploadFile(res) {
    console.log("run uploadFile......................");
    console.log({ res });

    let directory = res[0];
    let filePath = res[1];
    let data = res[2];
    let render = res[3];
    let token = res[4];

    const accessUser = await checkAccessUser(token);

    if (!accessUser.can_upload_file) {
      send("errorClient", "Ops! you don't have permission for upload file.");
      return;
    }

    // return;
    const isCleanFile = await requestCheckFile({
      file: Buffer.from(data),
      isUploadFile: true,
      buttonIndex: null,
      filePath,
    });
    console.log({ isCleanFile });
    if (isCleanFile) {
      let dirArr = filePath.split("/");
      let folder = filePath.replace(dirArr[dirArr.length - 1], "");
      await fsw.mkdir(folder, { recursive: true });
      await fsw.writeFile(filePath, Buffer.from(data));
      if (render) {
        getFiles(directory);
      }
      send("errorClient", "Uploaded successfully.");
    }
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
    console.log("run createFileToScan in node..........................");
    console.log({ res });

    let url = "http://" + ANALYZE_HOST + ":" + ANALYZE_PORT + "/analyze/scan/";
    let filePath = res.filePath;
    let buttonIndex = res?.buttonIndex;
    let isUploadFile = res?.isUploadFile;
    let fileName = filePath.split("/").slice(-1)[0];

    let file = res?.file;
    let fileBuffer = null;
    let fileStream = null;

    if (!isUploadFile) {
      try {
        fileBuffer = await fsw.readFile(filePath);
      } catch (error) {
        console.log("error on readFile", error);
        send("errorClient", error.message);
        return false;
      }
      fileStream = fs.createReadStream(filePath);
    } else {
      // Write the Buffer data to the temporary file
      fs.writeFileSync(filePath, file);

      // Create a ReadStream from the temporary file
      const readStream = fs.createReadStream(filePath);

      fileStream = readStream;
    }

    const formData = new FormData();
    formData.append("file", fileStream);

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
        send("errorClient", error.message);
      });
  }

  // create file to scan
  async function requestCheckFile(res) {
    console.log("run requestCheckFile in node..........................");
    console.log({ res });

    let result = null;
    let file = res.file;
    let filePath = res.filePath;
    let buttonIndex = res?.buttonIndex;
    let isUploadFile = res?.isUploadFile;
    let fileName = filePath.split("/").slice(-1)[0];
    let url = `http://${ANALYZE_HOST}:${ANALYZE_PORT}/analyze/scan/?file_name=${fileName}`;

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
                send(
                  "errorClient",
                  "Deleted File, because this file is not clean. "
                );
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
                send("errorClient", "scan is failed. try again");
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
                  send(
                    "errorClient",
                    "Deleted File, because this file is not clean. "
                  );
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
        send("checkFileIsClean", {
          isUploadFile,
          buttonIndex,
          error: error.message,
        });
      });

    return result;
  }

  // Function to convert Buffer to ReadStream-like object
  function bufferToReadStream(buffer) {
    return Readable.from(buffer);
  }

  // checkFileIsClean
  async function checkFileIsClean(res) {
    console.log("run checkFileIsClean in node..........................");
    console.log({ res });

    const accessUser = await checkAccessUser(res.token);

    if (!accessUser.can_download_file) {
      send("errorClient", "Ops! you don't have permission for download file.");
      return;
    }

    const isCleanFile = await requestCheckFile({
      file: res.file,
      filePath: res.file,
      buttonIndex: res?.buttonIndex,
      isUploadFile: null,
    });
    if (isCleanFile) {
      downloadFile(res);
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
