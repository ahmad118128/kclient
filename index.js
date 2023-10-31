// LinuxServer KasmVNC Client

//// Env variables ////
var CUSTOM_USER = process.env.CUSTOM_USER || "abc";
var PASSWORD = process.env.PASSWORD || "abc";
var SUBFOLDER = process.env.SUBFOLDER || "/";
var TITLE = process.env.TITLE || "KasmVNC Client";
var FM_HOME = process.env.FM_HOME || "/config";
var ANALYZE_HOST = "192.168.2.20";
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
var custom_http = require("http");

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

let isCleanFile = false;
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

  // Send file to client
  async function downloadFile(res) {
    const file = res.file;
    let fileName = file.split("/").slice(-1)[0];
    let fileBuffer = await fsw.readFile(file);
    send("sendfile", [fileBuffer, fileName]);
    const directoryPath = path.dirname(file);
    deleteFiles([file, directoryPath]);
  }

  // Write client sent file
  async function uploadFile(res) {
    let directory = res[0];
    let filePath = res[1];
    let data = res[2];
    let render = res[3];
    let dirArr = filePath.split("/");
    let folder = filePath.replace(dirArr[dirArr.length - 1], "");
    await fsw.mkdir(folder, { recursive: true });
    await fsw.writeFile(filePath, Buffer.from(data));
    if (render) {
      getFiles(directory);
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
    console.log("run createFileToScan in node.");
    let url = "http://" + ANALYZE_HOST + ":" + ANALYZE_PORT + "/analyze/scan/";
    let filePath = res.file;
    let buttonIndex = res?.buttonIndex;
    let fileBuffer = "";

    try {
      fileBuffer = await fsw.readFile(filePath);
    } catch (error) {
      console.log("error on readFile", error);
      send("errorClient", "Oops! you don't have permission");
      return;
    }

    let fileStream = fs.createReadStream(filePath);
    const formData = new FormData();
    formData.append("file", fileStream);

    await axios
      .post(url, formData, {
        headers: {
          ...formData.getHeaders(), // Set the appropriate content-type for formData
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          send("checkFileIsClean", {
            buttonIndex,
            step: "PROCESSING",
            process: percentCompleted,
          });
          console.log(`Progress: ${percentCompleted}%`);
        },
      })
      .then((response) => {
        send("checkFileIsClean", {
          buttonIndex,
          step: "PROCESSING",
        });
      })
      .catch((error) => {
        send("errorClient", error.message);
      });
  }

  // checkFileIsClean
  async function checkFileIsClean(res) {
    console.log("run checkFileIsClean in node.");

    let file = res.file;
    let fileName = file.split("/").slice(-1)[0];
    let url = `http://${ANALYZE_HOST}:${ANALYZE_PORT}/analyze/scan/?file_name=${fileName}`;
    let buttonIndex = res?.buttonIndex;

    await axios
      .get(url, {
        headers: {
          "Content-Type": "application/json",
        },
      })
      .then(({ data }) => {
        console.log({ data });
        if (Array.isArray(data) && data.length > 0) {
          const responseData = data[0];
          if (
            (responseData?.yara_scanner_status === "PROCESSING") |
            (responseData?.clamav_scanner_status === "PROCESSING") |
            (responseData?.antiviruses_scanner_status === "PROCESSING")
          ) {
            send("checkFileIsClean", {
              buttonIndex,
              step: "PROCESSING",
            });
            return;
          }
          if (responseData?.antiviruses_status_code === 200) {
            if (responseData?.antiviruses_scan_result) {
              // file is not clean

              const directoryPath = path.dirname(file);
              deleteFiles([file, directoryPath]);
              send(
                "errorClient",
                "Deleted File, because this file is not clean. "
              );
            } else {
              // file is clean
              downloadFile(res);
            }
          } else {
            // antiviruses_status_code === 400 or else
            if (responseData?.clamav_scan_result) {
              // file is not clean
              const directoryPath = path.dirname(file);
              deleteFiles([file, directoryPath]);
              send(
                "errorClient",
                "Deleted File, because this file is not clean. "
              );
            } else {
              // file is clean
              downloadFile(res);
            }
          }
        } else {
          // not created for scan
          createFileToScan(res);
        }
      })
      .catch((error) => {
        send("checkFileIsClean", {
          buttonIndex,
          error: error.message,
        });
      });

    // try {
    //   custom_http
    //     .get(options, function (response) {
    //       // Data may be received in chunks, so you need to collect it
    //       response.on("data", function (chunk) {
    //         data += chunk;
    //       });

    //       // When the entire response has been received, the 'end' event will be triggered
    //       response.on("end", function () {
    //         console.log("end /analyze/scan/?file_name= request");
    //         if (data && typeof data === "string") {
    //           let dataObj = JSON.parse(data);
    //           if (Array.isArray(dataObj) && dataObj.length > 0) {
    //             // created file and check result scan
    //             if (
    //               dataObj[0]?.clamav_scanner_status &&
    //               dataObj[0]?.clamav_scanner_status === "FINISHED"
    //             ) {
    //               // process is finished
    //               if (dataObj[0]?.clamav_scan_result) {
    //                 // file in not clean
    //                 send("checkFileIsClean", {
    //                   buttonIndex,
    //                   step: "NOT_CLEAN",
    //                 });
    //                 return;
    //               } else {
    //                 // file is clean
    //                 if (isCleanFile) {
    //                   downloadFile(res);
    //                   return;
    //                 }
    //                 send("checkFileIsClean", {
    //                   buttonIndex,
    //                   step: "CLEAN",
    //                 });
    //                 isCleanFile = true;
    //                 return;
    //               }
    //             } else {
    //               // process is not finished
    //               send("checkFileIsClean", {
    //                 buttonIndex,
    //                 step: "PROCESSING",
    //               });
    //               return;
    //             }
    //           } else {
    //             // not created for scan
    //             createFileToScan(res);
    //           }
    //         }
    //       });
    //     })
    //     .on("error", function (error) {
    //       // get request error
    //       console.log("error in /analyze/scan/?file_name=");
    //       send("checkFileIsClean", {
    //         buttonIndex,
    //         error: error.message,
    //       });
    //     });
    // } catch (error) {
    //   console.log("error catch:", error);
    // }
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
