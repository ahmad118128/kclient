/*
 *  Copyright (c) 2015 The WebRTC project authors. All Rights Reserved.
 *
 *  Use of this source code is governed by a BSD-style license
 *  that can be found in the LICENSE file in the root of the source
 *  tree.
 */

"use strict";

const videoElement = document.querySelector("video");
const audioInputSelect = document.querySelector("select#audioSource");
const audioOutputSelect = document.querySelector("select#audioOutput");
const videoSelect = document.querySelector("select#videoSource");
const selectors = [audioInputSelect, audioOutputSelect, videoSelect];

audioOutputSelect.disabled = !("sinkId" in HTMLMediaElement.prototype);

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

// Attach audio output device to video element using device/sink ID.
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
// var audioContext = new (window.AudioContext || window.webkitAudioContext)();
var mediaRecorder;

let audioChunks = [];
let videoChunks = [];

function gotStream(stream) {
  window.stream = stream;

  // Process audio data using Web Audio API
  const audioContext = new AudioContext();
  const audioSource = audioContext.createMediaStreamSource(stream);
  const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);

  scriptNode.onaudioprocess = (event) => {
    const inputData = event.inputBuffer.getChannelData(0);
    // Process your audio data here and push it to the audioChunks array
    audioChunks.push(inputData);
    console.log("Processed Audio chunk:", inputData);
  };

  audioSource.connect(scriptNode);
  scriptNode.connect(audioContext.destination);

  // Process video data using ImageCapture API
  const videoTrack = stream.getVideoTracks()[0];
  const imageCapture = new ImageCapture(videoTrack);

  const processVideoFrame = () => {
    imageCapture
      .grabFrame()
      .then((imageBitmap) => {
        const imageData = processImageBitmap(imageBitmap);
        // Process your video data here and push it to the videoChunks array
        videoChunks.push(imageData.data);
        console.log("Processed Video chunk:", imageData.data);
        requestAnimationFrame(processVideoFrame);
      })
      .catch((error) => {
        console.error("Error grabbing frame:", error);
      });
  };

  processVideoFrame();

  return navigator.mediaDevices.enumerateDevices();
}

// Process image bitmap (example, you can replace this with your own processing logic)
function processImageBitmap(imageBitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = imageBitmap.width;
  canvas.height = imageBitmap.height;
  const context = canvas.getContext("2d");
  context.drawImage(imageBitmap, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

function handleError(error) {
  console.log(
    "navigator.MediaDevices.getUserMedia error: ",
    error.message,
    error.name
  );
}

let audioContext = null;
let mediaStream = null;
let source = null;
let processor = null;

function start() {
  if (window.stream) {
    window.stream.getTracks().forEach((track) => {
      track.stop();
    });
  }
  const audioSource = audioInputSelect.value;
  const videoSource = videoSelect.value;
  const constraints = {
    audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
    video: { deviceId: videoSource ? { exact: videoSource } : undefined },
  };

  // navigator.mediaDevices
  //   .getUserMedia({ audio: true })
  //   .then(function (stream) {
  //     audioContext = new (window.AudioContext || window.webkitAudioContext)();
  //     mediaStream = stream;
  //     source = audioContext.createMediaStreamSource(stream);
  //     processor = audioContext.createScriptProcessor(4096, 1, 1);

  //     source.connect(processor);
  //     processor.connect(audioContext.destination);

  //     processor.onaudioprocess = function (e) {
  //       const inputData = e.inputBuffer.getChannelData(0);
  //       // This check is important as the processor may still have a few callbacks
  //       // that are invoked after the stream is stopped.
  //       if (mediaStream.active) {
  //         console.log("inputData.buffer", inputData.buffer);
  //         // socket.emit("audio-chunk", inputData.buffer);
  //       }
  //     };
  //   })
  //   .catch(function (err) {
  //     console.error("Error getting audio stream:", err);
  //   });

  navigator.mediaDevices
    .getUserMedia(constraints)
    .then(gotStream)
    .then(gotDevices)
    .catch(handleError);
}

audioInputSelect.onchange = start;
audioOutputSelect.onchange = changeAudioDestination;

videoSelect.onchange = start;

start();
