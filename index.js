// LinuxServer KasmVNC Client

//// Env variables ////
var CUSTOM_USER = process.env.CUSTOM_USER || "abc";
var PASSWORD = process.env.PASSWORD || "abc";
var SUBFOLDER = process.env.SUBFOLDER || "/";
var TITLE = process.env.TITLE || "KasmVNC Client";
var FM_HOME = process.env.FM_HOME || "/config";
var ANALYZE_HOST = "192.168.2.20";
var ANALYZE_PORT = 8000;

//// Application Variables ////
var socketIO = require("socket.io");
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
  async function downloadFile(data) {
    const file = data.file;
    const scanStep = data.scanStep;
    const downloadStep = data.downloadStep;
    const checkDownloadStep = data.checkDownloadStep;

    let fileName = file.split("/").slice(-1)[0];
    let fileBuffer = await fsw.readFile(file);

    console.log({
      file,
      scanStep,
      downloadStep,
      checkDownloadStep,
    });

    // const options = {
    //   hostname: "192.168.2.68", // Change to your server's hostname or IP
    //   port: 8001, // Change to your server's port
    //   path: "/analyze/scan/", // The path to your endpoint
    //   method: "POST",
    //   headers: {
    //     "Content-Type": "application/octet-stream", // Set the Content-Type based on your server's requirements
    //     "Content-Length": fileBuffer.length,
    //   },
    // };

    // const req = custom_http.request(options, (res) => {
    //   let data = "";

    //   res.on("data", (chunk) => {
    //     data += chunk;
    //   });

    //   res.on("end", () => {
    //     console.log("Response:", data);
    //   });
    // });

    // req.on("error", (error) => {
    //   console.error("Request failed:", error);
    // });
    // req.write(fileBuffer);
    // req.end();

    // send("sendfile", [fileBuffer, fileName]);
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
    console.log("run checkFileIsClean in node.", res);

    let file = res.file;
    let fileName = file.split("/").slice(-1)[0];
    let buttonIndex = res?.buttonIndex;
    let data = "";

    send("checkFileIsClean", {
      buttonIndex,
      step: "CREATE_TO_SCAN",
    });

    // const options = {
    //   hostname: ANALYZE_HOST,
    //   port: ANALYZE_PORT,
    //   path: "/analyze/scan/?file_name=" + fileName,
    //   method: "GET",
    //   headers: {
    //     "Content-Type": "application/json",
    //   },
    // };
    // custom_http
    //   .get(options, function (response) {
    //     // Data may be received in chunks, so you need to collect it
    //     response.on("data", function (chunk) {
    //       data += chunk;
    //     });

    //     // When the entire response has been received, the 'end' event will be triggered
    //     response.on("end", function () {
    //       if (data && typeof data === "string") {
    //         let dataObj = JSON.parse(data);
    //         if (Array.isArray(dataObj) && dataObj.length > 0) {
    //           // created file and check result scan
    //           if (dataObj[0]?.clamav_scanner_status &&  dataObj[0]?.clamav_scanner_status === 'FINISHED') {
    //             // process is finished
    //             if (dataObj[0]?.clamav_scan_result) {
    //               // file in not clean
    //               send("checkFileIsClean", {
    //                 buttonIndex,
    //                 step: "NOT_CLEAN",
    //               });
    //             }else{
    //               // file is clean
    //               send("checkFileIsClean", {
    //                 buttonIndex,
    //                 step: "CLEAN",
    //               });
    //             }

    //           }else{
    //             // process is not finished
    //             send("checkFileIsClean", {
    //               buttonIndex,
    //               step: "PROCESSING",
    //             });
    //           }

    //         }else{
    //           // not created for scan
    //         }
    //       }

    //     });
    //   })
    //   .on("error", function (error) {
    //     // get request error
    //     send("checkFileIsClean", {
    //       buttonIndex,
    //       error: error.message,
    //     });
    //   });
  }

  // checkFileIsClean
  async function checkFileIsClean(res) {
    console.log("run checkFileIsClean in node.", res);

    let file = res.file;
    let fileName = file.split("/").slice(-1)[0];
    let buttonIndex = res?.buttonIndex;
    let data = "";

    const options = {
      hostname: ANALYZE_HOST,
      port: ANALYZE_PORT,
      path: "/analyze/scan/?file_name=" + fileName,
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    };

    // {
    //   "id": 49,
    //   "file": "http://192.168.2.20:8000/files/1.50_list_zfEMScX.png",
    //   "file_name": "1.50_list_UO3iiJe.png",
    //   "username": null,
    //   "yara_scanner_status": "FINISHED",
    //   "clamav_scanner_status": "FINISHED",
    //   "yara_scan_summary": "{'matched_rules': [png]}",
    //   "yara_scan_result": true,
    //   "yara_error_message": null,
    //   "clamav_scan_summary": "clamav did not find any viruses for this file",
    //   "clamav_scan_result": false,
    //   "clamav_error_message": null
    // }

    custom_http
      .get(options, function (response) {
        // Data may be received in chunks, so you need to collect it
        response.on("data", function (chunk) {
          data += chunk;
        });

        // When the entire response has been received, the 'end' event will be triggered
        response.on("end", function () {
          if (data && typeof data === "string") {
            let dataObj = JSON.parse(data);
            if (Array.isArray(dataObj) && dataObj.length > 0) {
              // created file and check result scan
              if (
                dataObj[0]?.clamav_scanner_status &&
                dataObj[0]?.clamav_scanner_status === "FINISHED"
              ) {
                // process is finished
                if (dataObj[0]?.clamav_scan_result) {
                  // file in not clean
                  send("checkFileIsClean", {
                    buttonIndex,
                    step: "NOT_CLEAN",
                  });
                } else {
                  // file is clean
                  send("checkFileIsClean", {
                    buttonIndex,
                    step: "CLEAN",
                  });
                }
              } else {
                // process is not finished
                send("checkFileIsClean", {
                  buttonIndex,
                  step: "PROCESSING",
                });
              }
            } else {
              // not created for scan
              createFileToScan(res);
            }
          }
        });
      })
      .on("error", function (error) {
        // get request error
        send("checkFileIsClean", {
          buttonIndex,
          error: error.message,
        });
      });
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
