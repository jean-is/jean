// Speech to text with Whisper through Transformers.js, on WebAssembly. Weights come from
// the host the page passes (settings or policy), and are cached by Transformers.js.
// { type: 'load', host, model, dtype } → { type: 'ready' } (with progress messages)
// { type: 'transcribe', audio, language } → { type: 'result', text }
// { type: 'vad', host, model, audio } → { type: 'result', speech }: Silero's probability that each
//   32 ms of audio (512 samples at 16 kHz) is speech, for live conversation
import { env, pipeline, AutoModel, Tensor } from '../../vendor/transformers/transformers.web.min.js'
import { weightsFrom } from '../../ui/model-worker.js'

/** @type {Promise<any> | null} */
let transcriber = null
/** @type {Promise<any> | null} */
let detector = null
// Silero carries its state from one frame to the next.
let state = new Tensor('float32', new Float32Array(256), [2, 1, 128])
const rate = new Tensor('int64', new BigInt64Array([16000n]), [])

self.onmessage = async ({ data }) => {
  const { id, type } = data
  try {
    if (type === 'load') {
      transcriber ??= load(data, id)
      await transcriber
      self.postMessage({ id, type: 'ready' })
    } else if (type === 'transcribe') {
      if (!transcriber) throw new Error('Not loaded')
      const run = await transcriber
      const output = await run(data.audio, { language: data.language, task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 })
      self.postMessage({ id, type: 'result', text: output.text })
    } else if (type === 'vad') {
      env.remoteHost = data.host
      detector ??= AutoModel.from_pretrained(data.model, { config: { model_type: 'custom' }, dtype: 'fp32', device: 'wasm' })
      const model = await detector
      const speech = []
      for (let at = 0; at + 512 <= data.audio.length; at += 512) {
        const { output, stateN } = await model({ input: new Tensor('float32', data.audio.slice(at, at + 512), [1, 512]), sr: rate, state })
        state = stateN
        speech.push(output.data[0])
      }
      self.postMessage({ id, type: 'result', speech })
    }
  } catch (error) {
    if (type === 'load') transcriber = null
    if (type === 'vad') detector = null
    self.postMessage({ id, type: 'error', message: error?.message ?? String(error) })
  }
}

function load({ host, model, dtype }, id) {
  return pipeline('automatic-speech-recognition', model, { dtype, device: 'wasm', progress_callback: weightsFrom(host, id) })
}
