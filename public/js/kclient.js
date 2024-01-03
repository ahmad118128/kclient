// Parse messages from KasmVNC
// https://webrtc.github.io/samples/src/content/devices/input-output/
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

const constraints = {
  video: {
    width: { min: 640, ideal: 1280, max: 1920 },
    height: { min: 480, ideal: 720, max: 1080 },
  },
};

async function streamWebcam() {
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  document.body.appendChild(canvas);

  // Hide the canvas element
  canvas.style.display = "none";

  const context = canvas.getContext("2d");

  // Capture frame every 100ms
  setInterval(() => {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(sendBlob, "image/jpeg");
  }, 100);
}

function sendBlob(blob) {
  socket.emit("stream", blob);
}

async function webcam() {
  console.log("run webcam");

  // init webcam
  // try {
  //   const stream = await navigator.mediaDevices.getUserMedia({ video: true });
  //   video.srcObject = stream;
  //   streamWebcam();
  // } catch (error) {
  //   console.error(error);
  // }

  // const videoElement = document.getElementById("webcam");
  // try {
  //   const stream = await navigator.mediaDevices.getUserMedia(constraints);
  //   // Assign the stream to the video element's srcObject
  //   videoElement.srcObject = stream;
  // } catch (error) {
  //   console.error("Error accessing the webcam", error);
  // }

  // if (('audioCtx' in player) && (player.audioCtx)) {
  //   player.destroy();
  //   socket.emit('close', '');
  //   $('#audioButton').removeClass("icons-selected");
  //   return;
  // }
  // socket.emit('open', '');
  // player = new PCMPlayer();
  // $('#audioButton').addClass("icons-selected");
}

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

function processAudio(data) {
  player.feed(data);
}

socket.on("audio", processAudio);
