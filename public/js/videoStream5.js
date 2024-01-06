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
  // return your module

  class MediaStreamHandler {
    constructor() {
      console.log("run MediaStreamHandler constructor");
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

      this.shouldStream = null;

      this.videoTrack = null;
      this.audioTrack = null;
      this.audioProcessorNode = null;
      this.stream = null;
      this.gotDevices = this.gotDevices.bind(this);
      this.gotStream = this.gotStream.bind(this);
      this.startStreaming = this.startStreaming.bind(this);
      this.stopStreaming = this.stopStreaming.bind(this);
    }

    gotDevices(deviceInfos) {
      console.log("run gotDevices", { deviceInfos });
      // Handles being called several times to update labels. Preserve values.
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
            // Jump back to first output device in the list as it's the default.
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

      console.log("this.videoTrack", this.videoTrack);
      console.log("this.audioTrack", this.audioTrack);

      // if (this.videoTrack && this.audioTrack) {
      //   // Process audio and video data and send it to the server
      //   this.processAndSendData(stream);

      //   // Add event listener to stop streaming when the window is closed
      //   window.addEventListener("beforeunload", () => {
      //     this.stopStreaming(); // Use 'this.' to refer to class method
      //   });

      //   return navigator.mediaDevices.enumerateDevices();
      // } else {
      //   console.error("Video or audio track not found.");
      //   return Promise.reject(new Error("Video or audio track not found."));
      // }

      // // Process audio and video data and send it to the server
      // this.processAndSendData(stream);

      // // Add event listener to stop streaming when the window is closed
      // window.addEventListener("beforeunload", () => {
      //   this.stopStreaming();
      //   // console.log("close socket");
      //   // // socket.close();
      //   // stream.getTracks().forEach((track) => track.stop());
      // });

      // return navigator.mediaDevices.enumerateDevices();
    }

    startStreaming() {
      console.log("window.stream", window.stream);
      // const socket = io(); // Assuming you have Socket.IO included in your project

      if (window.stream) {
        this.stopStreaming();
        // window.stream.getTracks().forEach((track) => {
        //   track.stop();
        // });
        // this.videoTrack.stop();
        // this.audioTrack.stop();
        // window.stream = null;
      }
      this.shouldStream = true;

      const audioSource = this.audioInputSelect.value;
      const videoSource = this.videoSelect.value;

      console.log("---------------", this.selectors);
      const constraints = {
        audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
        video: { deviceId: videoSource ? { exact: videoSource } : undefined },
      };

      // navigator.mediaDevices
      //   .getUserMedia(constraints)
      //   .then(gotStream)
      //   .then(gotDevices)
      //   .catch(handleError);

      try {
        navigator.mediaDevices
          .getUserMedia(constraints)
          .then(this.gotStream)
          .then(this.gotDevices)
          .catch(this.handleError);
      } catch (error) {
        console.log("==============", error);
      }

      // Bind events to the instance methods
      this.audioInputSelect.onchange = this.startStreaming.bind(this);
      this.audioOutputSelect.onchange = this.changeAudioDestination.bind(this);
      this.videoSelect.onchange = this.startStreaming.bind(this);
    }

    stopStreaming() {
      // Disconnect and close audio-related resources
      this.audioProcessorNode.disconnect();
      this.audioProcessorNode.port.postMessage("stop");
      this.audioProcessorNode.disconnect(audioContext.destination);
      this.audioContext.close();
    }

    async processAndSendData(stream) {
      console.log("run processAndSendData **********");
      console.log({ stream });
      const audioContext = new AudioContext();
      // var audioInput = audioContext.createMediaStreamSource(stream);

      //   this.videoTrack = stream.getVideoTracks()[0];
      //   this.audioTrack = stream.getAudioTracks()[0];

      // try {
      //   await audioContext.audioWorklet.addModule(
      //     "/public/js/audio-processor.js"
      //   );
      // } catch (error) {
      //   console.error("Error adding audio worklet module:", error);
      // }

      // this.audioProcessorNode = new AudioWorkletNode(
      //   audioContext,
      //   "audio-processor"
      // );

      // const audioSource = audioContext.createMediaStreamSource(stream);
      // audioSource.connect(this.audioProcessorNode);
      // this.audioProcessorNode.connect(audioContext.destination);

      // const audioSource = audioContext.createMediaStreamSource(stream);
      // const scriptNode = audioContext.createScriptProcessor(4096, 1, 1);

      // scriptNode.onaudioprocess = (event) => {
      //   const inputData = event.inputBuffer.getChannelData(0);
      //   // Send audio data to the server using Socket.IO
      //   console.log("audio-chunk", inputData.buffer);
      //   // socket.emit("audio-chunk", inputData.buffer);
      // };

      // audioSource.connect(scriptNode);
      // scriptNode.connect(audioContext.destination);

      //.........
      // const mVideoTrack = stream.getVideoTracks()[0];
      // const imageCapture = new ImageCapture(mVideoTrack);

      // const processVideoFrame = () => {
      //   if (window.stream && mVideoTrack) {
      //     // Ensure mVideoTrack is defined
      //     imageCapture
      //       .grabFrame()
      //       .then((imageBitmap) => {
      //         if (imageBitmap) {
      //           const imageData = this.processImageBitmap(imageBitmap);
      //           console.log("video-chunk", imageData.data.buffer);
      //           // socket.emit("video-chunk", imageData.data.buffer);
      //           requestAnimationFrame(processVideoFrame);
      //         } else {
      //           console.error("Error grabbing frame: imageBitmap is undefined");
      //         }
      //       })
      //       .catch((error) => {
      //         console.error("Error grabbing frame:", error);
      //       });
      //   }

      //   // if (window.stream) {
      //   //   imageCapture
      //   //     .grabFrame()
      //   //     .then((imageBitmap) => {
      //   //       const imageData = this.processImageBitmap(imageBitmap);
      //   //       // Send video data to the server using Socket.IO
      //   //       console.log("video-chunk", imageData.data.buffer);

      //   //       // socket.emit("video-chunk", imageData.data.buffer);
      //   //       requestAnimationFrame(processVideoFrame);
      //   //     })
      //   //     .catch((error) => {
      //   //       console.error("Error grabbing frame:", error);
      //   //     });
      //   // }
      // };

      // if (window.stream !== null) {
      //   processVideoFrame();
      // }

      //.......

      // if (!this.shouldStream) {
      //   console.log("============= shouldStream");
      //   this.stopStreaming();
      //   // scriptNode.disconnect();
      //   // audioSource.disconnect();
      //   // audioContext.close();
      // }
    }

    // processVideoFrame() {
    //   // The rest of the existing processVideoFrame function code...
    // }

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
      if (this.shouldStream) {
        this.shouldStream = null;
      }
    }
  }

  return MediaStreamHandler;
});
