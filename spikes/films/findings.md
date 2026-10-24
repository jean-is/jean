# Films on this device: phase 0

Asked on 24 October 2026: find a way to make films offline, then measure FastWan 2.2 TI2V-5B with real weights in Jean's runtime. Wired into nothing; measured on one Mac (M3 Max, 30-core GPU, 96 GB), in headless Chromium (`channel: 'chromium'`, WebGPU with `shader-f16`) and Safari 27 over safaridriver, with Jean's own ONNX Runtime Web (`app/vendor/transformers/ort.webgpu.bundle.min.mjs`, 1.31 dev) and Transformers.js's tokenizer.

## Three ways

1. **Composed, no model** (`compose/`): scenes from pictures, slow camera moves, fades, captions in any script, music rendered offline, drawn on an `OffscreenCanvas`, encoded by WebCodecs, written as MP4 by Mediabunny (MPL-2.0; only `Output`, `Mp4OutputFormat`, `BufferTarget`, `CanvasSource`, `AudioBufferSource` bundled by esbuild: 59 KB gzip, the whole package 180 KB). A 12 s film with music: Chromium 1080p in 2.2 s (H.264 High + AAC, 1.1 MB); Safari 27 720p in 2.4 s and 1080p in 7.0 s, **only with H.264 Baseline** (`fullCodecString: 'avc1.42…'`): High and Main never finish in Safari 27 and crash Playwright's WebKit page. VP9 and AAC encode in Safari too.
2. **Generated on the device** (`bench/`, `py/`, `film/`): a distilled video model on WebGPU. The one to build: FastVideo's FastWan2.2-TI2V-5B (Apache 2.0; DMD, 3 steps; text or a picture to a film; Wan 2.2's VAE packs 16 × 16 × 4, so 5 s at 832 × 480 is 8,190 tokens).
3. **A server on this computer**: Rapid-MLX (`pip install 'rapid-mlx[video]'`) answers OpenAI's `/v1/videos` job API, which `caps/pictures/cloud.js` already speaks; its own figure is 16 minutes for a 5 s 832 × 480 Wan 2.2 5B clip on an M4 Pro. Not for people who don't use a terminal.

Set aside: MobileWan and Neodragon (Qualcomm's research-only licence), SANA-Video (Gemma 2 as its text encoder, Gemma's terms), LTX-2.x (19B and up, revenue-limited licence), Wan 2.1 1.3B (7× slower than the 5B at the same film: 164 s a step for 5 s at 480p).

## Timings with random weights (`bench/`)

Time depends on shapes, not values: `py/export_wan.py` exports diffusers' `WanTransformer3DModel` with random weights and dynamic shapes, `py/fuse.py` turns attention into `com.microsoft.MultiHeadAttention` (onnxscript's `optimize_for_ort`), which held 32,760 tokens in 8 GB without the whole attention matrix. One denoising pass, 30 layers:

| Model | Tokens | Per pass |
|---|---|---|
| Wan 2.1 1.3B, fp16 | 2,160 / 4,680 / 6,480 / 14,040 / 32,760 | 2.9 / 7.6 / 12.1 / 37.5 / 164 s |
| Wan 2.1 1.3B, 4-bit | 4,680 / 6,480 / 14,040 | 8.3 / 13.2 / 41.5 s |
| Wan 2.2 5B, 4-bit | 4,725 / 8,190 / 12,090 | 15.8 / 30.4 / 51 s |

About 2.1 TFLOPS effective. LightTAE (29 MB) decodes 81 frames of 480 × 480 in 1.05 s.

## Phase 0 with real weights

24.3 GB downloaded from `FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers` and `lightx2v/Autoencoders`. TAEHV's model code is madebyollin's `taehv.py` (MIT), fetched into `ref-src/`.

**Sampler**, as FastVideo's `DmdDenoisingStage`: t = 1000, 757, 522 on the training noise table (`FlowMatchEulerDiscreteScheduler(shift=8)`, the sigma of the nearest of its 1,000 timesteps), each step's clean video x0 = x − σ·v, noised again to the next step with fresh noise, no guidance. Text: umT5-XXL on 512 tokens, the embeddings past the prompt's zeroed.

**Reference** (`py/ref.py`, PyTorch bf16 on MPS): the three prompts of `py/prompts.json`, their noises saved so the browser samples the same film; about half a minute each. Wan 2.2's own decoder took over 100 GB on MPS (the Mac went 100 GB into swap; `py/guarded.sh` ends a job under 25% free memory) and 24 minutes on the CPU, tiled (`py/ref_decode.py`): no decoder for a device.

**The browser** (`film/`): three stages, each in a worker the page ends once it answers, as `app/caps/pictures/stage-worker.js` runs FLUX: encode (Transformers.js's `T5Tokenizer`, the embedding's int8 rows looked up in JavaScript, umT5's 24 layers in three graphs), denoise, decode (+ MP4). Each stage compared with the reference (`py/compare.py`):

| | Result |
|---|---|
| Tokens | identical, 3 prompts of 3 |
| Text encoder, 8-bit | cosine 0.994–0.998 to the reference (CPU 0.999); 4-bit 0.95–0.98, rejected |
| Video model, first pass, cosine to the reference | fp16 in PyTorch 0.9995 (the floor), 8-bit blocks 0.998, mixed 0.995, 4-bit 0.978, 4-bit with int8 activations 0.969; Safari 0.986 |
| Whole film | a 3-step sampler magnifies any difference: fp16 against bf16 ends at cosine 0.956. 8-bit: dog and boat 20 dB from the reference's frames (the same film, details apart), kitchen 14 dB (another take). Judged by eye, all look as the reference does, without blocks or banding |

**Time**, 5 s at 832 × 480, 16 frames a second, the rank-4 graphs: Chromium 87 s (text 5.7 s, video 3 × 24.2 s plus 5 s to load, frames 1.9 s, MP4 0.6–2.7 s), the browser's processes holding 10–15 GB at most; Safari 27 3.4 minutes (8-bit, 62.5 s a pass) to 4 (mixed, 75 s).

**Sizes** shipped: text encoder 6.0 GB (int8 rows 1.05 GB, three graphs of 1.66 GB), video model 5.44 GB (8-bit blocks) or 3.55 GB (self-attention 8-bit, the rest 4-bit), TAEHV 20 MB, tokenizer 17 MB: 11.5 or 9.6 GB.

## What made it work

- **umT5's `wo` stays fp32**, as transformers keeps it (`_keep_in_fp32_modules`), so the residual stream comes out fp32: cast it to fp16 between graphs (its largest values were about 14,000).
- **MatMulNBits' accuracy level 1**, never 4: level 4's int8 activations erred on WebGPU (0.969 against 0.978 for the same weights computed in fp16), and level 1 is faster.
- **The embedders and `proj_out` stay fp16**: rounding them to 4 bits doubled the error (`py/fakequant.py`, which tries recipes in PyTorch in 13 s each). 8-bit blocks land at the fp16 floor; self-attention matters most after that.
- **TAEHV's `taew2_2`, not LightTAE**: on the same latent, 26.4 dB against Wan's own decoder, where LightTAE's 15.9 dB over-sharpens and over-saturates (the harsh look the browser export `cretz/FastWan2.2-TI2V-5B-ONNX-sharded` reported as blocky).
- **No tensor of more than four dimensions, for Safari**: WebKit's WGSL-to-Metal can't build the `array<u32, 5>(…)` ONNX Runtime's shaders write for five (Conv3D, the 5- and 8-dimensional patch and rotary reshapes). `py/export_tokens.py` takes and gives patches `[1, N, 192]`, patchified in JavaScript, and does rotary embedding as x·cos + (x·P)·sin±, P swapping each pair; `py/export_tae4.py` decodes `[T, 48, H, W]`. Same film (20.4 dB against 20.36), and 11% faster in Chromium.
- **A 5.4 GB session loads** in ONNX Runtime Web on WebGPU, in Chromium and Safari: weights go to the GPU, not the 4 GB of WebAssembly memory.

## Left for the build

The picture check on frames (D275), marks for an MP4 (D279), a film from a picture, other sizes and lengths, a 16 GB device, why Safari drifts more.

## Reproduce

`uv venv py/.venv && uv pip install torch diffusers transformers onnx onnxscript onnxruntime av scikit-image accelerate safetensors`, `hf download FastVideo/FastWan2.2-TI2V-5B-FullAttn-Diffusers --local-dir downloads/fastwan`, `hf download lightx2v/Autoencoders lighttaew2_2.safetensors taew2_2.safetensors --local-dir downloads/lighttae-weights`, `taehv.py` into `ref-src/`; then `py/ref.py ref`, the exports into `real/` (`export_umt5.py`, `export_tokens.py` → `fuse.py` → `quantize_mixed.py`, `export_tae4.py`), `node film/server.mjs 47394` and `node film/run.mjs 47394 film/config-r4-q8.json`, and `py/compare.py`. The composed film's bundle: `npm i mediabunny` in `compose/`, then esbuild `entry.mjs` to `mediabunny-mp4.min.mjs`.
