// The microphone, for dictation and live conversation (an AudioWorklet): mono frames of 96 ms at the
// rate asked for in processorOptions, else the context's own. Live conversation asks for 16 kHz, 1,536
// samples, three of what voice detection reads at a time, from a context at the microphone's own rate
// (Firefox connects it to no other): each sample is the mean of the input over its span, so frames
// meet with nothing lost or added between them.
class Capture extends AudioWorkletProcessor {
  /** @param {{ processorOptions?: { rate?: number } }} options */
  constructor({ processorOptions: { rate = sampleRate } = {} }) {
    super()
    this.step = sampleRate / rate
    this.frames = new Float32Array(Math.round(rate * 0.096))
    // The span of the sample being made, so far, and the input's sum over it.
    this.filled = this.span = this.sum = 0
  }

  /** @param {Float32Array[][]} inputs */
  process([input]) {
    for (const sample of input?.[0] ?? []) {
      let left = 1
      while (this.span + left >= this.step) {
        const part = this.step - this.span
        this.frames[this.filled++] = (this.sum + sample * part) / this.step
        left -= part
        this.span = this.sum = 0
        if (this.filled < this.frames.length) continue
        this.port.postMessage(this.frames.slice())
        this.filled = 0
      }
      this.span += left
      this.sum += sample * left
    }
    return true
  }
}

registerProcessor('capture', Capture)
