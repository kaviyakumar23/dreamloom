/**
 * AudioWorklet processor for capturing PCM audio data from the microphone.
 * Runs in the audio rendering thread for low-latency capture.
 */
class PCMCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = new Float32Array(0);
    // Send chunks of ~50ms at 16kHz = 800 samples
    this._chunkSize = 800;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0]; // Mono channel

    // Append to buffer
    const newBuffer = new Float32Array(
      this._buffer.length + channelData.length
    );
    newBuffer.set(this._buffer);
    newBuffer.set(channelData, this._buffer.length);
    this._buffer = newBuffer;

    // Send chunks when we have enough data
    while (this._buffer.length >= this._chunkSize) {
      const chunk = this._buffer.slice(0, this._chunkSize);
      this._buffer = this._buffer.slice(this._chunkSize);

      this.port.postMessage({
        type: "audio-data",
        data: chunk,
      });
    }

    return true;
  }
}

registerProcessor("pcm-capture-processor", PCMCaptureProcessor);
