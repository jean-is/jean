// The microphone for live conversation (an AudioWorklet): mono frames of 1,536 samples,
// 96 ms at the context's 16 kHz, which is three of what voice detection reads at a time.
class Capture extends AudioWorkletProcessor {
  frames = new Float32Array(1536)
  filled = 0

  /** @param {Float32Array[][]} inputs */
  process([input]) {
    for (const sample of input?.[0] ?? []) {
      this.frames[this.filled++] = sample
      if (this.filled < this.frames.length) continue
      this.port.postMessage(this.frames.slice())
      this.filled = 0
    }
    return true
  }
}

registerProcessor('capture', Capture)
