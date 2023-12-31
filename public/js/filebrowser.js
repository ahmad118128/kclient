var host = window.location.hostname;
var port = window.location.port;
var protocol = window.location.protocol;
var path = window.location.pathname;
var downloadButtonId = "downloadButton_";
var sendToScanButtonId = "downloadButton_";
var originalButton = null;

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
      let buttonIndex = files.indexOf(file);

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
            id: downloadButtonId + buttonIndex,
            onclick:
              "checkFileIsClean('" +
              directoryClean +
              "/" +
              fileClean +
              "','" +
              buttonIndex +
              "','download');",
          })
          .text("Download")
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
function checkFileIsClean(file, buttonIndex, transmissionType) {
  let button =
    transmissionType === "download"
      ? $("#" + downloadButtonId + buttonIndex)
      : $("#uploadFileButton");

  originalButton = button;

  button
    .text("Loading...")
    .css({
      "background-color": "gray",
    })
    .prop("disabled", true);

  socket.emit("checkFileIsClean", {
    file,
    buttonIndex,
    transmissionType,
  });
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

  if (directory == "/") {
    directoryUp = "";
  } else {
    directoryUp = directory;
  }

  if (input.files && input.files[0]) {
    for await (let file of input.files) {
      let reader = new FileReader();
      reader.onload = async function (e) {
        let fileName = file.name;
        if (e.total < 15000000000) {
          let data = e.target.result;
          if (file == input.files[input.files.length - 1]) {
            checkFileIsClean(
              {
                directory,
                filePath: directoryUp + "/" + fileName,
                data,
                render: true,
              },
              null,
              "upload"
            );
          } else {
            checkFileIsClean(
              {
                directory,
                filePath: directoryUp + "/" + fileName,
                data,
                render: false,
              },
              null,
              "upload"
            );
          }
        } else {
          alert("File too big " + fileName);
          $("#filebrowser").append(
            $("<div>").text("File too Big. " + fileName)
          );
          await new Promise((resolve) => setTimeout(resolve, 2000));
          socket.emit("getfiles", directory);
        }
      };
      reader.readAsArrayBuffer(file);
    }
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
  $("#filebrowser").empty();
  $("#filebrowser").append($("<div>").attr("id", "loading"));
  $("#dropzone").css({ visibility: "hidden", opacity: 0 });
  let directory = $("#filebrowser").data("directory");
  if (directory == "/") {
    directoryUp = "";
  } else {
    directoryUp = directory;
  }
  let items = await getAllFileEntries(event.dataTransfer.items);
  for await (let item of items) {
    let fullPath = item.fullPath;
    item.file(async function (file) {
      let reader = new FileReader();
      reader.onload = async function (e) {
        let fileName = file.name;
        if (e.total < 200000000) {
          let data = e.target.result;
          $("#filebrowser").append($("<div>").text("Uploading " + fileName));
          if (item == items[items.length - 1]) {
            socket.emit("uploadfile", [
              directory,
              directoryUp + "/" + fullPath,
              data,
              true,
            ]);
          } else {
            socket.emit("uploadfile", [
              directory,
              directoryUp + "/" + fullPath,
              data,
              false,
            ]);
          }
        } else {
          $("#filebrowser").append($("<div>").text("File too big " + fileName));
          await new Promise((resolve) => setTimeout(resolve, 2000));
          socket.emit("getfiles", directory);
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }
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

// reset upload input
function resetUploadInput() {
  $("#uploadInput").val("");
}

// Disabled default drag and drop
function errorClient({ msg, isUploadFile, buttonIndex }) {
  if (isUploadFile) {
    resetUploadInput();
  }
  if (isUploadFile || buttonIndex) {
    getOriginalBtn(isUploadFile, buttonIndex);
  }
  alert(msg);
}

// Get Original Button
function getOriginalBtn(isUploadFile, buttonIndex) {
  const textButton = isUploadFile ? "Upload File" : "Download";
  let button = !isUploadFile
    ? $("#" + downloadButtonId + buttonIndex)
    : $("#uploadFileButton");
  button
    .text(textButton)
    .css("background-color", "rgba(9, 2, 2, 0.6)")
    .prop("disabled", false);
  return button;
}
// Handle status check file is clean
async function responseCheckFileIsClean(res) {
  let error = res?.error;
  let buttonIndex = res?.buttonIndex;
  let isUploadFile = res?.isUploadFile;

  if (error) {
    alert(error);
    return;
  }

  let button = getOriginalBtn(isUploadFile, buttonIndex);

  switch (res?.step) {
    case "CREATE_TO_SCAN":
      button.replaceWith(
        "<span id='CREATE_TO_SCAN'>Create File To Scan,Please Wait.</span>"
      );
      setTimeout(function () {
        $("#CREATE_TO_SCAN").replaceWith(button);
      }, 6000);
      break;

    case "NOT_CLEAN":
      button.replaceWith(
        "<span id='NOT_CLEAN'>Is Not Clean.You Can't Download it</span>"
      );
      break;

    case "CLEAN":
      button
        .css({
          "background-color": "green",
        })
        .text("Download");
      break;

    case "PROCESSING":
      button.replaceWith(
        "<span id='PROCESSING'>Processing, Please Wait.</span>"
      );
      setTimeout(function () {
        $("#PROCESSING").replaceWith(button);
        if (isUploadFile) {
          // reset input for brows file again
          $("#uploadInput").val("");
        }
      }, 6000);

      break;

    case "UPLOAD_SUCCESS":
      $("#PROCESSING").replaceWith(button);
      if (isUploadFile) {
        // reset input for brows file again
        resetUploadInput();
      }
      alert("Uploaded successfully.");
      break;

    default:
      break;
  }

  return;
}

// Incoming socket requests
socket.on("renderfiles", renderFiles);
socket.on("sendfile", sendFile);
socket.on("errorClient", errorClient);
socket.on("checkFileIsClean", responseCheckFileIsClean);
