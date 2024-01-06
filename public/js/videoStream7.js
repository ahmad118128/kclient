"use strict";

const audioInputSelect = document.querySelector("select#audioSource");
const audioOutputSelect = document.querySelector("select#audioOutput");
const videoSelect = document.querySelector("select#videoSource");
const videoElement = document.getElementById("video");
const selectors = [audioInputSelect, audioOutputSelect, videoSelect];

audioOutputSelect.disabled = !("sinkId" in HTMLMediaElement.prototype);

let videoTrack = null;
let audioTrack = null;

function gotDevices(deviceInfos) {
  const values = selectors.map((select) => select.value);
  selectors.forEach((select) => {
    while (select.firstChild) {
      select.removeChild(select.firstChild);
    }
  });

  for (let i = 0; i !== deviceInfos.length; ++i) {
    const deviceInfo = deviceInfos[i];
    const option = document.createElement("option");
    option.value = deviceInfo.deviceId;

    if (deviceInfo.kind === "audioinput") {
      option.text =
        deviceInfo.label || `microphone ${audioInputSelect.length + 1}`;
      audioInputSelect.appendChild(option);
    } else if (deviceInfo.kind === "audiooutput") {
      option.text =
        deviceInfo.label || `speaker ${audioOutputSelect.length + 1}`;
      audioOutputSelect.appendChild(option);
    } else if (deviceInfo.kind === "videoinput") {
      option.text = deviceInfo.label || `camera ${videoSelect.length + 1}`;
      videoSelect.appendChild(option);
    } else {
      console.log("Some other kind of source/device: ", deviceInfo);
    }
  }

  selectors.forEach((select, selectorIndex) => {
    if (
      Array.prototype.slice
        .call(select.childNodes)
        .some((n) => n.value === values[selectorIndex])
    ) {
      select.value = values[selectorIndex];
    }
  });
}

navigator.mediaDevices.enumerateDevices().then(gotDevices).catch(handleError);

function attachSinkId(element, sinkId) {
  if (typeof element.sinkId !== "undefined") {
    element
      .setSinkId(sinkId)
      .then(() => {
        console.log(`Success, audio output device attached: ${sinkId}`);
      })
      .catch((error) => {
        let errorMessage = error;
        if (error.name === "SecurityError") {
          errorMessage = `You need to use HTTPS for selecting audio output device: ${error}`;
        }
        console.error(errorMessage);
        audioOutputSelect.selectedIndex = 0;
      });
  } else {
    console.warn("Browser does not support output device selection.");
  }
}

function changeAudioDestination() {
  const audioDestination = audioOutputSelect.value;
  attachSinkId(videoElement, audioDestination);
}

function processImageBitmap(imageBitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  const context = canvas.getContext("2d");
  context.drawImage(imageBitmap, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function handleError(error) {
  console.error(error);
  console.log(
    "navigator.MediaDevices.getUserMedia error: ",
    error.message,
    error.name
  );
}

function gotStream(stream) {
  window.stream = stream;
  videoTrack = stream.getVideoTracks()[0];
  audioTrack = stream.getAudioTracks()[0];

  processAndSendData(stream);

  window.addEventListener("beforeunload", () => {
    stopStreaming();
  });

  return navigator.mediaDevices.enumerateDevices();
}

function startStreaming() {
  console.log("Start streaming");

  if (window.stream) {
    window.stream.getTracks().forEach((track) => {
      track.stop();
    });
    videoTrack.stop();
    audioTrack.stop();
    window.stream = null;

    // Introduce a delay before starting the stream again
    setTimeout(() => {
      initiateStream();
    }, 1000); // Adjust the delay as needed
  } else {
    initiateStream();
  }

  // if (window.stream) {
  //   window.stream.getTracks().forEach((track) => {
  //     track.stop();
  //   });
  //   videoTrack.stop();
  //   audioTrack.stop();
  //   window.stream = null;
  // }

  // const audioSource = audioInputSelect.value;
  // const videoSource = videoSelect.value;
  // const constraints = {
  //   audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
  //   video: { deviceId: videoSource ? { exact: videoSource } : undefined },
  // };

  // navigator.mediaDevices
  //   .getUserMedia(constraints)
  //   .then(gotStream)
  //   .then(gotDevices)
  //   .catch((error) => {
  //     console.error("Error getting user media:", error);
  //   });
}

function initiateStream() {
  const audioSource = audioInputSelect.value;
  const videoSource = videoSelect.value;
  const constraints = {
    audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
    video: { deviceId: videoSource ? { exact: videoSource } : undefined },
  };

  navigator.mediaDevices
    .getUserMedia(constraints)
    .then(gotStream)
    .then(gotDevices)
    .catch((error) => {
      console.error("Error getting user media:", error);
    });
}

function sendVideoFrameToServer(frameBuffer) {
  console.log("Video frame buffer:", frameBuffer);
  // Add your logic to send the frame buffer to the server using Socket.IO or other methods
  // Example: socket.emit("video-frame", frameBuffer);
}

function showWebCam(stream) {
  const canvasElement = document.createElement("canvas");
  const canvasContext = canvasElement.getContext("2d");
  document.body.appendChild(canvasElement);

  videoElement.addEventListener("play", () => {
    const imageCapture = new ImageCapture(
      videoElement.srcObject.getVideoTracks()[0]
    );

    const processVideoFrame = async () => {
      try {
        if (!videoTrack || videoTrack.readyState === "ended") {
          console.log("Video track is no longer active. Stopping processing.");
          return;
        }

        const imageBitmap = await imageCapture.grabFrame();

        if (!imageBitmap || videoTrack.readyState === "ended") {
          console.log(
            "ImageBitmap is undefined or video track has ended. Stopping processing."
          );
          return;
        }

        canvasContext.drawImage(
          imageBitmap,
          0,
          0,
          canvasElement.width,
          canvasElement.height
        );

        const imageData = canvasContext.getImageData(
          0,
          0,
          canvasElement.width,
          canvasElement.height
        );

        const frameBuffer = imageData.data.buffer;

        sendVideoFrameToServer(frameBuffer);

        console.log("Processed and Sent Video Frame ArrayBuffer:", frameBuffer);
      } catch (error) {
        console.error("Error grabbing frame:", error);
      }

      requestAnimationFrame(processVideoFrame);
    };

    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;

    if (window.stream !== null) {
      processVideoFrame();
    }
  });

  videoElement.srcObject = stream;
}

function processAndSendData(stream) {
  const audioContext = new AudioContext();
  const audioSource = audioContext.createMediaStreamSource(stream);

  showWebCam(stream);

  audioSource.connect(audioContext.destination);
}

function stopStreaming() {
  console.log("Stop streaming");

  if (videoTrack) {
    videoTrack.stop();
  }
  if (audioTrack) {
    audioTrack.stop();
  }

  if (window.stream) {
    window.stream.getTracks().forEach((track) => {
      track.stop();
    });
    window.stream = null;
  }
}

audioInputSelect.onchange = startStreaming;
audioOutputSelect.onchange = changeAudioDestination;
videoSelect.onchange = startStreaming;
