// videoStream5.js

"use strict";

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    // Node, CommonJS-like
    module.exports = factory();
  } else {
    // Browser globals (root is window)
    root.MediaStreamHandler = factory();
  }
})(this, function () {
  class MediaStreamHandler {
    constructor() {
      this.audioInputSelect = document.querySelector("select#audioSource");
      this.audioOutputSelect = document.querySelector("select#audioOutput");
      this.videoSelect = document.querySelector("select#videoSource");
      this.selectors = [
        this.audioInputSelect,
        this.audioOutputSelect,
        this.videoSelect,
      ];
      this.audioOutputSelect.disabled = !(
        "sinkId" in HTMLMediaElement.prototype
      );

      this.videoTrack = null;
      this.audioTrack = null;
      this.stream = null;
      this.audioWorkletNode = null;
      this.audioContext = new AudioContext();

      // Create the AudioWorkletNode
      this.audioContext.audioWorklet
        .addModule("/public/js/audio-processor.js")
        .then(() => {
          this.audioWorkletNode = new AudioWorkletNode(
            this.audioContext,
            "audio-processor"
          );
          this.audioWorkletNode.connect(this.audioContext.destination);
        })
        .catch((error) => {
          console.error("Error adding audio processor module:", error);
        });

      navigator.mediaDevices
        .enumerateDevices()
        .then(this.gotDevices.bind(this))
        .catch(this.handleError);

      this.audioInputSelect.onchange = this.startStreaming.bind(this);
      this.audioOutputSelect.onchange = this.changeAudioDestination.bind(this);
      this.videoSelect.onchange = this.startStreaming.bind(this);
    }

    gotDevices(deviceInfos) {
      const values = this.selectors.map((select) => select.value);

      this.selectors.forEach((select) => {
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
            deviceInfo.label ||
            `microphone ${this.audioInputSelect.length + 1}`;
          this.audioInputSelect.appendChild(option);
        } else if (deviceInfo.kind === "audiooutput") {
          option.text =
            deviceInfo.label || `speaker ${this.audioOutputSelect.length + 1}`;
          this.audioOutputSelect.appendChild(option);
        } else if (deviceInfo.kind === "videoinput") {
          option.text =
            deviceInfo.label || `camera ${this.videoSelect.length + 1}`;
          this.videoSelect.appendChild(option);
        } else {
          console.log("Some other kind of source/device: ", deviceInfo);
        }
      }

      this.selectors.forEach((select, selectorIndex) => {
        if (
          Array.prototype.slice
            .call(select.childNodes)
            .some((n) => n.value === values[selectorIndex])
        ) {
          select.value = values[selectorIndex];
        }
      });
    }

    attachSinkId(element, sinkId) {
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
            this.audioOutputSelect.selectedIndex = 0;
          });
      } else {
        console.warn("Browser does not support output device selection.");
      }
    }

    changeAudioDestination() {
      const audioDestination = this.audioOutputSelect.value;
      this.attachSinkId(videoElement, audioDestination);
    }

    processImageBitmap(imageBitmap) {
      const canvas = document.createElement("canvas");
      canvas.width = imageBitmap.width;
      canvas.height = imageBitmap.height;
      const context = canvas.getContext("2d");
      context.drawImage(imageBitmap, 0, 0);
      return context.getImageData(0, 0, canvas.width, canvas.height);
    }

    handleError(error) {
      console.error(
        "navigator.MediaDevices.getUserMedia error: ",
        error.message,
        error.name
      );
    }

    gotStream(stream) {
      window.stream = stream;

      this.videoTrack = stream.getVideoTracks()[0];
      this.audioTrack = stream.getAudioTracks()[0];

      if (this.videoTrack && this.audioTrack) {
        this.processAndSendData(stream);

        window.addEventListener("beforeunload", () => {
          this.stopStreaming();
        });

        return navigator.mediaDevices.enumerateDevices();
      } else {
        console.error("Video or audio track not found.");
        return Promise.reject(new Error("Video or audio track not found."));
      }
    }

    startStreaming() {
      if (window.stream) {
        window.stream.getTracks().forEach((track) => {
          track.stop();
        });
        this.videoTrack.stop();
        this.audioTrack.stop();
        window.stream = null;
      }

      const audioSource = this.audioInputSelect.value;
      const videoSource = this.videoSelect.value;

      const constraints = {
        audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
        video: { deviceId: videoSource ? { exact: videoSource } : undefined },
      };

      navigator.mediaDevices
        .getUserMedia(constraints)
        .then(this.gotStream.bind(this))
        .then(this.gotDevices.bind(this))
        .catch(this.handleError);

      this.audioInputSelect.onchange = this.startStreaming.bind(this);
      this.audioOutputSelect.onchange = this.changeAudioDestination.bind(this);
      this.videoSelect.onchange = this.startStreaming.bind(this);
    }

    processAndSendData(stream) {
      const audioWorkletSource =
        this.audioContext.createMediaStreamSource(stream);
      audioWorkletSource.connect(this.audioWorkletNode);

      const mVideoTrack = stream.getVideoTracks()[0];
      const imageCapture = new ImageCapture(mVideoTrack);

      const processVideoFrame = () => {
        if (window.stream && this.audioWorkletNode) {
          imageCapture
            .grabFrame()
            .then((imageBitmap) => {
              if (imageBitmap) {
                const imageData = this.processImageBitmap(imageBitmap);
                console.log("video-chunk", imageData.data.buffer);
                requestAnimationFrame(processVideoFrame);
              } else {
                console.error("Error grabbing frame: imageBitmap is undefined");
              }
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

    stopStreaming() {
      console.log("stopStreaming");
      if (this.videoTrack) {
        this.videoTrack.stop();
      }

      if (this.audioTrack) {
        this.audioTrack.stop();
      }

      if (window.stream) {
        window.stream.getTracks().forEach((track) => {
          track.stop();
        });
        window.stream = null;
      }
    }
  }

  return MediaStreamHandler;
});
