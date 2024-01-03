/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 * 
 * navigator.MediaDevices.getUserMedia error:  Cannot read properties of undefined (reading 'length') TypeError

 */

"use strict";

// const videoElement = document.querySelector("video");
const audioInputSelect = document.querySelector("select#audioSource");
const audioOutputSelect = document.querySelector("select#audioOutput");
const videoSelect = document.querySelector("select#videoSource");
const selectors = [audioInputSelect, audioOutputSelect, videoSelect];
audioOutputSelect.disabled = !("sinkId" in HTMLMediaElement.prototype);

let videoTrack = null;
let audioTrack = null;
function gotDevices(deviceInfos) {
  // Handles being called several times to update labels. Preserve values.
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

// // Attach audio output device to video element using device/sink ID.
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
        // Jump back to first output device in the list as it's the default.
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

// // Process image bitmap (example, you can replace this with your own processing logic)
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

  // Process audio and video data and send it to the server
  processAndSendData(stream);

  // Add event listener to stop streaming when the window is closed
  window.addEventListener("beforeunload", () => {
    stopStreaming();
    // console.log("close socket");
    // // socket.close();
    // stream.getTracks().forEach((track) => track.stop());
  });

  return navigator.mediaDevices.enumerateDevices();
}

function startStreaming() {
  console.log("window.stream", window.stream);
  // const socket = io(); // Assuming you have Socket.IO included in your project

  if (window.stream) {
    window.stream.getTracks().forEach((track) => {
      track.stop();
    });
    videoTrack.stop();
    audioTrack.stop();
    window.stream = null;
  }

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
    .catch(handleError);
}

// Function to process audio and video data and send it to the server
function processAndSendData(stream) {
  const audioContext = new AudioContext();
  const audioSource = audioContext.createMediaStreamSource(stream);
  const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);

  scriptNode.onaudioprocess = (event) => {
    const inputData = event.inputBuffer.getChannelData(0);
    // Send audio data to the server using Socket.IO
    console.log("audio-chunk", inputData.buffer);
    // socket.emit("audio-chunk", inputData.buffer);
  };

  audioSource.connect(scriptNode);
  scriptNode.connect(audioContext.destination);

  const videoTrack = stream.getVideoTracks()[0];
  const imageCapture = new ImageCapture(videoTrack);

  const processVideoFrame = () => {
    if (window.stream) {
      imageCapture
        .grabFrame()
        .then((imageBitmap) => {
          const imageData = processImageBitmap(imageBitmap);
          // Send video data to the server using Socket.IO
          console.log("video-chunk", imageData.data.buffer);

          // socket.emit("video-chunk", imageData.data.buffer);
          requestAnimationFrame(processVideoFrame);
        })
        .catch((error) => {
          console.error("Error grabbing frame:", error);
        });
    }
  };

  if (window.stream !== null) {
    processVideoFrame();
  }
}

// Add the stopStreaming function
function stopStreaming() {
  console.log("stopStreaming");
  if (window.stream) {
    window.stream.getTracks().forEach((track) => {
      track.stop();
    });
    window.stream.stop();
    window.stream = null;
  }
}

// audioInputSelect.onchange = startStreaming;
// audioOutputSelect.onchange = changeAudioDestination;
// videoSelect.onchange = startStreaming;
