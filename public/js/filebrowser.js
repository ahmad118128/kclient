var host = window.location.hostname;
var port = window.location.port;
var protocol = window.location.protocol;
var path = window.location.pathname;
const downloadButtonId = "downloadButton_";
const sendToScanButtonId = "downloadButton_";
const uploadButtonId = "uploadFileButton";
const checkStatusButtonId = "checkStatusButton";
const checkStatusSpanId = "checkStatusSpan";
const checkStatusMsgId = "checkStatusMsg";
const checkStatusButton = `<button id="${checkStatusButtonId}" onClick="checkStatusHandler()">Check Status</button>`;
let scannedFileInfo = null;
var originalButton = null;
const checkStatusMsg = (downloadBtnIndex) =>
  `<span id="${
    downloadBtnIndex
      ? `${checkStatusMsgId}_${downloadBtnIndex}`
      : checkStatusMsgId
  }">Start Process.</span>`;
const checkStatusSpan = (downloadBtnIndex) =>
  `<span id="${
    downloadBtnIndex
      ? `${checkStatusSpanId}_${downloadBtnIndex}`
      : checkStatusSpanId
  }">${checkStatusButton} ${checkStatusMsg(downloadBtnIndex)}</span>`;

var socket = io(protocol + "//" + host + ":" + port, {
  path: path + "/socket.io",
});

// Open default folder on connect
socket.on("connect", function () {
  $("#filebrowser").empty();
  $("#filebrowser").append($("<div>").attr("id", "loading"));
  socket.emit("open", "");
});

// Get file list
function getFiles(directory) {
  directory = directory.replace("//", "/");
  directory = directory.replace("|", "'");
  // let directoryClean = directory.replace("'", "|");
  if (directory !== "/" && directory.endsWith("/")) {
    directory = directory.slice(0, -1);
  }
  $("#filebrowser").empty();
  $("#filebrowser").append($("<div>").attr("id", "loading"));
  socket.emit("getfiles", directory);
}

// Render file list
async function renderFiles(data) {
  let dirs = data[0];
  let files = data[1];
  let directory = data[2];
  let baseName = directory.split("/").slice(-1)[0];
  let parentFolder = directory.replace(baseName, "");

  let parentLink = $("<td>")
    .addClass("directory")
    .attr("onclick", "getFiles('" + parentFolder + "');")
    .text("↵")
    .css({
      cursor: "pointer",
    });
  let directoryClean = directory.replace("'", "|");
  if (directoryClean == "/") {
    directoryClean = "";
  }
  let table = $("<table>").addClass("fileTable");
  let tableHeader = $("<tr>");
  // Label of Header Table
  for await (name of ["Name", "Type", "Delete (NO WARNING)", "Download File"]) {
    tableHeader.append($("<th>").text(name));
  }
  let parentRow = $("<tr>");
  // Label of parent row as second row in table
  for await (item of [
    parentLink,
    $("<td>").text("Parent"),
    $("<td>"),
    $("<td>"),
  ]) {
    parentRow.append(item);
  }

  table.append(tableHeader, parentRow);
  $("#filebrowser").empty();
  $("#filebrowser").data("directory", directory);
  $("#filebrowser").append($("<div>").text(directory));
  $("#filebrowser").append(table);
  if (dirs.length > 0) {
    // if items are Directory
    for await (let dir of dirs) {
      let tableRow = $("<tr>");
      let dirClean = dir.replace("'", "|");
      let link = $("<td>")
        .addClass("directory")
        .attr("onclick", "getFiles('" + directoryClean + "/" + dirClean + "');")
        .text(dir)
        .css({
          cursor: "pointer",
        });
      let type = $("<td>").text("Dir");
      let del = $("<td>").append(
        $("<button>")
          .addClass("deleteButton")
          .attr(
            "onclick",
            "deleter('" + directoryClean + "/" + dirClean + "');"
          )
          .text("Delete")
      );
      let downloadTd = $("<td>");
      for await (item of [link, type, del, downloadTd]) {
        tableRow.append(item);
      }
      table.append(tableRow);
    }
  }
  if (files.length > 0) {
    // if items are file

    for await (let file of files) {
      let tableRow = $("<tr>");
      let fileClean = file.replace("'", "|");
      let downloadBtnIndex = files.indexOf(file);

      let link = $("<td>").addClass("file").text(file);
      let type = $("<td>").text("File");
      let del = $("<td>").append(
        $("<button>")
          .addClass("deleteButton")
          .attr(
            "onclick",
            "deleter('" + directoryClean + "/" + fileClean + "');"
          )
          .text("Delete")
      );
      let downloadTd = $("<td>");
      downloadTd.append(
        $("<button>")
          .addClass("checkFileIsClean")
          .attr({
            id: downloadButtonId + downloadBtnIndex,
            onclick:
              "checkFileIsClean('" +
              directoryClean +
              "/" +
              fileClean +
              "','" +
              downloadBtnIndex +
              "','download');",
          })
          .text("Safe Download")
      );

      for await (item of [link, type, del, downloadTd]) {
        tableRow.append(item);
      }
      table.append(tableRow);
    }
  }

  if ($("#refreshButton").length === 0) {
    // add button refresh
    let refreshButton = $("<button>", {
      id: "refreshButton",
      text: "Refresh",
      click: function () {
        // render again
        renderFiles(data);
      },
    });
    $("#buttons").append(refreshButton);
  }
}

// Download a file
function downloadFile(file, uniqueId) {
  let downloadBtn = $("#" + uniqueId);
  downloadBtn.attr("disable", true).text("Loading...");
  file = file.replace("|", "'");
}

// checkFileIsClean
function checkFileIsClean(file, downloadBtnIndex, transmissionType) {
  console.log("client on checkFileIsClean:", {
    file,
    downloadBtnIndex,
    transmissionType,
  });
  let directory = $("#filebrowser").data("directory");
  let button =
    transmissionType === "download"
      ? $("#" + downloadButtonId + downloadBtnIndex)
      : $(`#${uploadButtonId}`);

  originalButton = button;
  button
    .text("Send For Scan")
    .css({
      "background-color": "gray",
    })
    .prop("disabled", true);

  if (transmissionType === "upload") {
    var chunkSize = 1024 * 1024; // 1MB
    var chunks = Math.ceil(file.size / chunkSize);
    let currentChunk = 0;
    const filePath = `${directory}/${file.name}`;
    // const filePath = `/tmp/config/${file.name}`;

    function sendNextChunk() {
      var start = currentChunk * chunkSize;
      var end = Math.min(start + chunkSize, file.size);
      var blob = file.slice(start, end);

      var reader = new FileReader();
      reader.onload = function (e) {
        socket.emit("file_chunk", {
          filePath,
          fileName: file.name,
          type: file.type,
          size: file.size,
          data: reader.result,
          currentChunk: currentChunk,
          totalChunks: chunks,
        });

        currentChunk++;
        if (currentChunk < chunks) {
          sendNextChunk();
        }
      };
      reader.readAsArrayBuffer(blob);
    }

    sendNextChunk();
  } else {
    socket.emit("check-file-is-clean", {
      fileName: file.split("/").slice(-1)[0],
      file,
      downloadBtnIndex,
      transmissionType,
    });
  }
}

// Send buffer to download blob
function sendFile(res) {
  let data = res[0];
  let fileName = res[1];
  let blob = new Blob([data], { type: "application/octetstream" });
  let url = window.URL || window.webkitURL;
  link = url.createObjectURL(blob);
  let a = $("<a />");
  a.attr("download", fileName);
  a.attr("href", link);
  $("body").append(a);
  a[0].click();
  $("body").remove(a);
}

// Upload files to current directory
async function upload(input) {
  let directory = $("#filebrowser").data("directory");
  let directoryUp = "";
  if (directory == "/") {
    directoryUp = "";
  } else {
    directoryUp = directory;
  }

  if (input.files && input.files[0]) {
    const file = input.files[0];
    checkFileIsClean(file, null, "upload");
  }
}

// Delete file/folder
function deleter(item) {
  let directory = $("#filebrowser").data("directory");
  $("#filebrowser").empty();
  $("#filebrowser").append($("<div>").attr("id", "loading"));
  socket.emit("deletefiles", [item, directory]);
}

// Delete file/folder
function createFolder() {
  let directory = $("#filebrowser").data("directory");
  if (directory == "/") {
    directoryUp = "";
  } else {
    directoryUp = directory;
  }
  let folderName = $("#folderName").val();
  $("#folderName").val("");
  if (folderName.length == 0 || folderName.includes("/")) {
    alert("Bad or Null Directory Name");
    return "";
  }
  $("#filebrowser").empty();
  $("#filebrowser").append($("<div>").attr("id", "loading"));
  socket.emit("createfolder", [directoryUp + "/" + folderName, directory]);
}

// Handle drag and drop
async function dropFiles(ev) {
  ev.preventDefault();
  console.log("dropFiles");
}
// Drop handler function to get all files
async function getAllFileEntries(dataTransferItemList) {
  let fileEntries = [];
  // Use BFS to traverse entire directory/file structure
  let queue = [];
  // Unfortunately dataTransferItemList is not iterable i.e. no forEach
  for (let i = 0; i < dataTransferItemList.length; i++) {
    queue.push(dataTransferItemList[i].webkitGetAsEntry());
  }
  while (queue.length > 0) {
    let entry = queue.shift();
    if (entry.isFile) {
      fileEntries.push(entry);
    } else if (entry.isDirectory) {
      let reader = entry.createReader();
      queue.push(...(await readAllDirectoryEntries(reader)));
    }
  }
  return fileEntries;
}
// Get all the entries (files or sub-directories) in a directory by calling readEntries until it returns empty array
async function readAllDirectoryEntries(directoryReader) {
  let entries = [];
  let readEntries = await readEntriesPromise(directoryReader);
  while (readEntries.length > 0) {
    entries.push(...readEntries);
    readEntries = await readEntriesPromise(directoryReader);
  }
  return entries;
}
// Wrap readEntries in a promise to make working with readEntries easier
async function readEntriesPromise(directoryReader) {
  try {
    return await new Promise((resolve, reject) => {
      directoryReader.readEntries(resolve, reject);
    });
  } catch (err) {
    console.log(err);
  }
}

// Display Error as alert
async function displayError(error) {
  alert(error);
}

var lastTarget;
// Change style when hover files
window.addEventListener("dragenter", function (ev) {
  lastTarget = ev.target;
  $("#dropzone").css({ visibility: "", opacity: 1 });
});

// Change style when leave hover files
window.addEventListener("dragleave", function (ev) {
  if (ev.target == lastTarget || ev.target == document) {
    $("#dropzone").css({ visibility: "hidden", opacity: 0 });
  }
});

// Disabled default drag and drop
function allowDrop(ev) {
  ev.preventDefault();
}

// get original button text
function getOriginalButtonText(isUploadFile) {
  return isUploadFile ? "Safe Upload" : "Safe Download";
}

// empty upload input
function emptyUploadInput() {
  $("#uploadInput").val("");
}

// get checkStatusSpan in Dom
function getCheckStatusSpan(downloadBtnIndex) {
  if (downloadBtnIndex) {
    return $(`#${checkStatusSpanId}_${downloadBtnIndex}`);
  }
  return $(`#${checkStatusSpanId}`);
}

// get checkStatusSpanMsg in Dom
function getCheckStatusMsg(downloadBtnIndex) {
  if (downloadBtnIndex) {
    return $(`#${checkStatusMsgId}_${downloadBtnIndex}`);
  }
  return $(`#${checkStatusMsgId}`);
}

// check is set checkStatusSpan in Dom
function isSetCheckStatusSpan(downloadBtnIndex) {
  if (downloadBtnIndex) {
    return getCheckStatusSpan(downloadBtnIndex).length;
  }
  return getCheckStatusSpan().length;
}

// reset upload Button
function resetUploadButton() {
  emptyUploadInput();
  const defaultUploadBtn = getDefaultBtn(); // defaultUploadBtn may be string button not a function

  if (isSetCheckStatusSpan()) {
    getCheckStatusSpan().replaceWith(defaultUploadBtn);
  } else {
    $(`#${uploadButtonId}`)
      .text(getOriginalButtonText(true))
      .css("background-color", "rgba(9, 2, 2, 0.6)")
      .prop("disabled", false);
  }
}

// reset download button
function resetDownloadButton(downloadBtnIndex) {
  if (isSetCheckStatusSpan(downloadBtnIndex)) {
    const defaultDownloadBtn = getDefaultBtn({
      downloadBtnIndex,
    });
    getCheckStatusSpan(downloadBtnIndex).replaceWith(defaultDownloadBtn);
  } else {
    $("#" + downloadButtonId + downloadBtnIndex)
      .text(getOriginalButtonText(false))
      .css("background-color", "rgba(9, 2, 2, 0.6)")
      .prop("disabled", false);
  }
}

// alert message
function errorClient({ msg, isUploadFile, downloadBtnIndex }) {
  if (downloadBtnIndex) {
    resetDownloadButton(downloadBtnIndex);
  } else {
    resetUploadButton();
  }

  alert(msg);
}

// Get Original Button
function getDefaultBtn(res) {
  const downloadBtnIndex = res?.downloadBtnIndex;
  if (downloadBtnIndex) {
    if ($("#" + downloadButtonId + downloadBtnIndex).length) {
      return $("#" + downloadButtonId + downloadBtnIndex)
        .text(getOriginalButtonText(false))
        .css("background-color", "rgba(9, 2, 2, 0.6)")
        .prop("disabled", false);
    }
    const filePath = res?.filePath;
    return `<button class="checkFileIsClean" id="${downloadButtonId}${downloadBtnIndex}" onclick="checkFileIsClean(${filePath},${downloadBtnIndex},'download');">Safe Download</button>`;
  } else {
    if ($(`#${uploadButtonId}`).length) {
      return $(`#${uploadButtonId}`)
        .text(getOriginalButtonText(true))
        .css("background-color", "rgba(9, 2, 2, 0.6)")
        .prop("disabled", false);
    }
  }
  return `<button id="${uploadButtonId}" onclick="$('#uploadInput').trigger( 'click' )">Safe Upload</button>`;
  // let button = downloadBtnIndex
  //   ? $("#" + downloadButtonId + downloadBtnIndex)
  //   : $(`#${uploadButtonId}`);
  // button
  //   .text(getOriginalButtonText(!downloadBtnIndex))
  //   .css("background-color", "rgba(9, 2, 2, 0.6)")
  //   .prop("disabled", false);
  // return button;
}

// set checkStatusBtn to Dom
// replace with default button
function setCheckStatusSpan(downloadBtnIndex) {
  const defaultBtn = getDefaultBtn({ downloadBtnIndex });

  defaultBtn.replaceWith(checkStatusSpan(downloadBtnIndex));

  // if (downloadBtnIndex) {
  //   $(`#${downloadButtonId}${downloadBtnIndex}`).replaceWith(
  //     checkStatusSpan(downloadBtnIndex)
  //   );
  // } else {
  //   $(`#${uploadButtonId}`).replaceWith(checkStatusSpan());
  // }
}

// Handle check status file is clean
async function checkStatusHandler() {
  console.log("run checkStatusHandler()");
  socket.emit("request", {
    type: "CHECK_STATUS",
  });
}

// Handle status check file is clean
async function socketCheckFileIsClean(res) {
  let error = res?.error;
  let downloadBtnIndex = res?.downloadBtnIndex;
  let isUploadFile = res?.isUploadFile;

  if (error) {
    alert(error);
    return;
  }

  // let defaultBtn = getDefaultBtn({ isUploadFile, downloadBtnIndex });

  switch (res?.step) {
    // case "CREATE_TO_SCAN":
    //   button.replaceWith(
    //     "<span id='CREATE_TO_SCAN'>Create File To Scan,Please Wait.</span>"
    //   );
    //   setTimeout(function () {
    //     $("#CREATE_TO_SCAN").replaceWith(button);
    //   }, 6000);
    //   break;

    case "ACTIVE_CHECK_SCAN":
      setCheckStatusSpan(downloadBtnIndex);
      break;

    case "CLEAN":
      if (isUploadFile) {
        resetUploadButton();
      } else {
        resetDownloadButton(downloadBtnIndex);
      }
      break;

    case "NOT_CLEAN":
      errorClient({
        msg: "Is Not Clean.You Can't Download it",
        isUploadFile,
        downloadBtnIndex,
      });
      break;

    case "PROCESSING":
      if (isSetCheckStatusSpan(downloadBtnIndex)) {
        // get checkStatusMsg
        const checkStatusMsg = getCheckStatusMsg(downloadBtnIndex);
        checkStatusMsg.text("Processing");
      } else {
        setCheckStatusSpan(downloadBtnIndex);
      }
      // button.replaceWith(
      //   "<span id='PROCESSING'>Processing, Please Wait.</span>"
      // );
      // setTimeout(function () {
      //   button.text("Scanning, Check Again.").css({
      //     "background-color": "darkorange",
      //   });
      //   $("#PROCESSING").replaceWith(button);
      //   if (isUploadFile) {
      //     // reset input for brows file again
      //     $("#uploadInput").val("");
      //   }
      // }, 6000);

      break;

    case "UPLOAD_SUCCESS":
      resetUploadButton();
      alert("Uploaded successfully.");
      break;

    default:
      break;
  }

  return;
}

function uploadComplete() {
  $(`#${uploadButtonId}`)
    .text(`Send File To Scan, wait...`)
    .css({
      "background-color": "gray",
    })
    .prop("disabled", true);
}

function uploadProgress({ transmissionType, progress, downloadBtnIndex }) {
  const button = getDefaultBtn({
    downloadBtnIndex,
  });
  button
    .text(`Uploading ${progress}%`)
    .css({
      "background-color": "gray",
    })
    .prop("disabled", true);
}

// Incoming socket requests
socket.on("renderfiles", renderFiles);
socket.on("sendfile", sendFile);
socket.on("error-client", errorClient);
socket.on("upload-complete", uploadComplete);
socket.on("upload-progress", uploadProgress);
socket.on("check-file-is-clean", socketCheckFileIsClean);
