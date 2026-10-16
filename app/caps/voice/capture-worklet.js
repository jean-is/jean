// The microphone, for dictation and live conversation (an AudioWorklet): mono frames of 96 ms at
// the context's rate, 1,536 samples at live conversation's 16 kHz, three of what voice detection reads at a time.
class Capture extends AudioWorkletProcessor {
  frames = new Float32Array(Math.round(sampleRate * 0.096))
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
