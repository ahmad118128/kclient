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
// var audioChunks = [];

// Process audio data (example, you can replace this with your own processing logic)
function processAudioData(audioData) {
  // Example: Convert audio data to ArrayBuffer and back (no actual processing)
  const arrayBuffer = audioData.arrayBuffer();
  const processedData = new Uint8Array(arrayBuffer);
  return processedData;
}

// Process video data (example, you can replace this with your own processing logic)
function processVideoData(videoData) {
  // Example: Convert video data to ArrayBuffer and back (no actual processing)
  const arrayBuffer = videoData.arrayBuffer();
  const processedData = new Uint8Array(arrayBuffer);
  return processedData;
}

let audioChunks = [];
let videoChunks = [];

function gotStream(stream) {
  console.log({ stream });
  window.stream = stream; // make stream available to console

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

  // Process video data using Canvas API
  const videoElement = document.getElementById("video");
  const canvasElement = document.createElement("canvas");
  const canvasContext = canvasElement.getContext("2d");
  document.body.appendChild(canvasElement);

  videoElement.addEventListener("play", () => {
    const processVideoFrame = () => {
      canvasContext.drawImage(
        videoElement,
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
      // Process your video data here and push it to the videoChunks array
      videoChunks.push(imageData.data);
      console.log("Processed Video chunk:", imageData.data);
      requestAnimationFrame(processVideoFrame);
    };

    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    processVideoFrame();
  });

  videoElement.srcObject = stream;

  // Refresh button list in case labels have become available
  return navigator.mediaDevices.enumerateDevices();
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
