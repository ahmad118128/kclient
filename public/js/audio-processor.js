class AudioProcessor extends AudioWorkletProcessor {
  process(inputs, outputs) {
    // Check if inputs and outputs arrays exist and have elements
    if (!inputs || !outputs || inputs.length === 0 || outputs.length === 0) {
      return false; // Stop processing if there are no valid input or output
    }

    const input = inputs[0];
    const output = outputs[0];

    // Check if input and output arrays exist and have elements
    if (!input || !output || input.length === 0 || output.length === 0) {
      return false; // Stop processing if there are no valid input or output
    }

    // Process the audio data as needed
    for (let channel = 0; channel < output.length; ++channel) {
      for (let i = 0; i < output[channel].length; ++i) {
        // Simple example: Pass through the audio data unchanged
        console.log("audio-chunk", input[channel][i]);

        output[channel][i] = input[channel][i];
      }
    }

    return true;
  }
}

registerProcessor("audio-processor", AudioProcessor);
