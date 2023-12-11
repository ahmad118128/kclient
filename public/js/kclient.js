// Parse messages from KasmVNC
var eventMethod = window.addEventListener ? "addEventListener" : "attachEvent";
var eventer = window[eventMethod];
var messageEvent = eventMethod == "attachEvent" ? "onmessage" : "message";
eventer(
  messageEvent,
  function (e) {
    if (event.data && event.data.action) {
      switch (event.data.action) {
        case "control_open":
          openToggle("#lsbar");
          break;
        case "control_close":
          closeToggle("#lsbar");
          break;
        case "fullscreen":
          fullscreen();
          break;
      }
    }
  },
  false
);

// Handle Toggle divs
function openToggle(id) {
  if ($(id).is(":hidden")) {
    $(id).slideToggle(300);
  }
}
function closeToggle(id) {
  if ($(id).is(":visible")) {
    $(id).slideToggle(300);
  }
}
function toggle(id) {
  $(id).slideToggle(300);
}

// Fullscreen handler
function fullscreen() {
  if (
    document.fullscreenElement ||
    document.mozFullScreenElement ||
    document.webkitFullscreenElement ||
    document.msFullscreenElement
  ) {
    if (document.exitFullscreen) {
      document.exitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  } else {
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen();
    } else if (document.documentElement.mozRequestFullScreen) {
      document.documentElement.mozRequestFullScreen();
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen(
        Element.ALLOW_KEYBOARD_INPUT
      );
    } else if (document.body.msRequestFullscreen) {
      document.body.msRequestFullscreen();
    }
  }
}

// Websocket comms for audio
var host = window.location.hostname;
var port = window.location.port;
var protocol = window.location.protocol;
var path = window.location.pathname;
var socket = io(protocol + "//" + host + ":" + port, {
  path: path + "audio/socket.io",
});
var player = {};

function audio() {
  if ("audioCtx" in player && player.audioCtx) {
    player.destroy();
    socket.emit("close", "");
    $("#audioButton").removeClass("icons-selected");
    return;
  }
  socket.emit("open", "");
  player = new PCMPlayer();
  $("#audioButton").addClass("icons-selected");
}

var audioContext = new (window.AudioContext || window.webkitAudioContext)();
var mediaRecorder;
var audioChunks = [];

navigator.mediaDevices
  .getUserMedia({ audio: true })
  .then(function (stream) {
    var audioInput = audioContext.createMediaStreamSource(stream);
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.ondataavailable = function (event) {
      if (event.data.size > 0) {
        socket.emit("recordAudio", event.data);
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = function () {
      var audioBlob = new Blob(audioChunks, { type: "audio/wav" });
      var audioUrl = URL.createObjectURL(audioBlob);
      document.getElementById("audioPlayer").src = audioUrl;
    };

    audioInput.connect(audioContext.destination);
  })
  .catch(function (err) {
    console.error("Error getting audio stream:", err);
  });

function startRecord() {
  audioChunks = [];
  mediaRecorder.start();
}

function stopRecord() {
  mediaRecorder.stop();
}

function recordClient() {
  //
  // socket.emit("record", "");
  // alert("record");
}

function recordNode() {
  //
  alert("record node");
}

function processAudio(data) {
  player.feed(data);
}

socket.on("audio", processAudio);
// socket.on("record", recordNode);
