# FastWan 2.2 TI2V-5B's reference films, in PyTorch on this Mac (MPS, bf16 as FastVideo runs it), sampled as
# FastVideo's DmdDenoisingStage does: t = 1000, 757, 522 on the training noise table (flow shift 8), the clean
# video predicted at each step and noised again to the next with fresh noise, no guidance.
# Everything the browser needs to sample the same film is saved: the noises, the sigmas, the text's embeddings.
# usage: ref.py <out dir> [frames] [height] [width]
import json, os, sys, time
import numpy as np
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ref-src'))
from transformers import AutoTokenizer, UMT5EncoderModel
from diffusers import WanTransformer3DModel, AutoencoderKLWan
from taehv import TAEHV

MODEL = os.path.join(os.path.dirname(__file__), '..', 'downloads', 'fastwan')
TAE = os.path.join(os.path.dirname(__file__), '..', 'downloads', 'lighttae-weights', 'lighttaew2_2.safetensors')
PROMPTS = json.load(open(os.path.join(os.path.dirname(__file__), 'prompts.json')))
out = sys.argv[1]
frames, height, width = (int(a) for a in (sys.argv[2:5] or (81, 480, 832)))
latent_shape = (1, 48, (frames - 1) // 4 + 1, height // 16, width // 16)
STEPS = [1000, 757, 522]
device = torch.device('mps')
os.makedirs(out, exist_ok=True)
times = {}


def sigma_of(t, shift=8.0, n=1000):
    """FastVideo's pred_noise_to_pred_video: the sigma of the training table's timestep nearest t."""
    sigmas = np.linspace(1, n, n)[::-1].copy() / n
    sigmas = shift * sigmas / (1 + (shift - 1) * sigmas)
    return float(sigmas[np.argmin(np.abs(sigmas * n - t))])


sigmas = [sigma_of(t) for t in STEPS]
json.dump({'steps': STEPS, 'sigmas': sigmas, 'latent_shape': latent_shape, 'frames': frames, 'height': height, 'width': width}, open(f'{out}/schedule.json', 'w'))

# The text, as Wan's pipelines encode it: 512 tokens, the embeddings past its own zeroed.
t0 = time.time()
tokenizer = AutoTokenizer.from_pretrained(f'{MODEL}/tokenizer')
encoder = UMT5EncoderModel.from_pretrained(f'{MODEL}/text_encoder', torch_dtype=torch.bfloat16).to(device).eval()
times['load_text_encoder'] = time.time() - t0
embeds = {}
for name, prompt in PROMPTS.items():
    t0 = time.time()
    tokens = tokenizer(prompt, padding='max_length', max_length=512, truncation=True, add_special_tokens=True, return_attention_mask=True, return_tensors='pt')
    with torch.no_grad():
        hidden = encoder(tokens.input_ids.to(device), tokens.attention_mask.to(device)).last_hidden_state.float().cpu()
    length = int(tokens.attention_mask.sum())
    hidden[:, length:] = 0
    embeds[name] = hidden
    hidden.numpy().astype(np.float32).tofile(f'{out}/{name}.embeds.f32')
    np.array(tokens.input_ids[0], dtype=np.int64).tofile(f'{out}/{name}.ids.i64')
    times[f'encode_{name}'] = time.time() - t0
del encoder
torch.mps.empty_cache()

t0 = time.time()
transformer = WanTransformer3DModel.from_pretrained(f'{MODEL}/transformer', torch_dtype=torch.bfloat16).to(device).eval()
times['load_transformer'] = time.time() - t0
for name in PROMPTS:
    generator = torch.Generator('cpu').manual_seed(1024)
    noises = [torch.randn(latent_shape, generator=generator, dtype=torch.float32) for _ in STEPS]
    for i, noise in enumerate(noises):
        noise.numpy().tofile(f'{out}/{name}.noise{i}.f32')
    x = noises[0]
    t0 = time.time()
    for i, t in enumerate(STEPS):
        with torch.no_grad():
            v = transformer(hidden_states=x.to(device, torch.bfloat16), timestep=torch.tensor([t], device=device),
                            encoder_hidden_states=embeds[name].to(device, torch.bfloat16), return_dict=False)[0].float().cpu()
        x0 = (x.double() - sigmas[i] * v.double()).float()
        x0.numpy().tofile(f'{out}/{name}.x0_{i}.f32')
        x = sigmas[i + 1] * noises[i + 1] + (1 - sigmas[i + 1]) * x0 if i + 1 < len(STEPS) else x0
    torch.mps.synchronize()
    times[f'denoise_{name}'] = time.time() - t0
del transformer
torch.mps.empty_cache()


def save(frames_uint8, path, fps=16):
    """Frames [T, H, W, 3] as an H.264 MP4."""
    with av.open(path, 'w') as container:
        stream = container.add_stream('libx264', rate=fps)
        stream.width, stream.height, stream.pix_fmt = frames_uint8.shape[2], frames_uint8.shape[1], 'yuv420p'
        stream.options = {'crf': '16'}
        for frame in frames_uint8:
            container.mux(stream.encode(av.VideoFrame.from_ndarray(frame, format='rgb24')))
        container.mux(stream.encode())


import av
vae = AutoencoderKLWan.from_pretrained(f'{MODEL}/vae', torch_dtype=torch.float32).to(device).eval()
mean = torch.tensor(vae.config.latents_mean).view(1, 48, 1, 1, 1)
std = torch.tensor(vae.config.latents_std).view(1, 48, 1, 1, 1)
tae = TAEHV(TAE, arch_name='taew2_2').to(device, torch.float16).eval()
for name in PROMPTS:
    latent = torch.from_numpy(np.fromfile(f'{out}/{name}.x0_{len(STEPS) - 1}.f32', dtype=np.float32).reshape(latent_shape))
    t0 = time.time()
    with torch.no_grad():
        video = vae.decode((latent * std + mean).to(device), return_dict=False)[0].float().cpu()  # [1, 3, T, H, W] in -1…1
    times[f'vae_{name}'] = time.time() - t0
    official = ((video[0].permute(1, 2, 3, 0).clamp(-1, 1) + 1) * 127.5).round().to(torch.uint8).numpy()
    t0 = time.time()
    with torch.no_grad():
        light = tae.decode_video(latent.permute(0, 2, 1, 3, 4).to(device, torch.float16), parallel=True, show_progress_bar=False).float().cpu()  # [1, T, 3, H, W] in 0…1
    times[f'tae_{name}'] = time.time() - t0
    lighttae = (light[0].permute(0, 2, 3, 1) * 255).round().clamp(0, 255).to(torch.uint8).numpy()
    official.tofile(f'{out}/{name}.vae.u8')
    lighttae.tofile(f'{out}/{name}.tae.u8')
    save(official, f'{out}/{name}.vae.mp4')
    save(lighttae, f'{out}/{name}.tae.mp4')
    print(name, 'frames', official.shape, lighttae.shape, flush=True)
json.dump(times, open(f'{out}/times.json', 'w'), indent=1)
print(json.dumps(times, indent=1))
