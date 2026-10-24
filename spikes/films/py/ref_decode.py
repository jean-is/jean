# The reference films' frames from ref.py's last latents: Wan 2.2's own decoder, tiled (whole, it took over 100 GB
# on MPS), and LightTAE, each saved as raw RGB frames and an MP4.
# usage: ref_decode.py <ref dir>
import json, os, sys, time
import av
import numpy as np
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ref-src'))
from diffusers import AutoencoderKLWan
from taehv import TAEHV

MODEL = os.path.join(os.path.dirname(__file__), '..', 'downloads', 'fastwan')
TAE = os.path.join(os.path.dirname(__file__), '..', 'downloads', 'lighttae-weights', 'lighttaew2_2.safetensors')
out = sys.argv[1]
schedule = json.load(open(f'{out}/schedule.json'))
shape = tuple(schedule['latent_shape'])
names = json.load(open(os.path.join(os.path.dirname(__file__), 'prompts.json')))
device = torch.device('mps')
times = {}


def save(frames, path, fps=16):
    with av.open(path, 'w') as container:
        stream = container.add_stream('libx264', rate=fps)
        stream.width, stream.height, stream.pix_fmt = frames.shape[2], frames.shape[1], 'yuv420p'
        stream.options = {'crf': '16'}
        for frame in frames:
            container.mux(stream.encode(av.VideoFrame.from_ndarray(frame, format='rgb24')))
        container.mux(stream.encode())


tae = TAEHV(TAE, arch_name='taew2_2').to(device, torch.float16).eval()
latents = {name: torch.from_numpy(np.fromfile(f'{out}/{name}.x0_2.f32', dtype=np.float32).reshape(shape)) for name in names}
for name, latent in latents.items():
    t0 = time.time()
    with torch.no_grad():
        light = tae.decode_video(latent.permute(0, 2, 1, 3, 4).to(device, torch.float16), parallel=True, show_progress_bar=False).float().cpu()
    torch.mps.synchronize()
    times[f'tae_{name}'] = time.time() - t0
    lighttae = (light[0].permute(0, 2, 3, 1) * 255).round().clamp(0, 255).to(torch.uint8).numpy()
    lighttae.tofile(f'{out}/{name}.tae.u8')
    save(lighttae, f'{out}/{name}.tae.mp4')
    print(name, 'tae', lighttae.shape, times[f'tae_{name}'], flush=True)
del tae
torch.mps.empty_cache()

# Wan 2.2's own decoder on the CPU, tiled, where its memory stays bounded.
vae = AutoencoderKLWan.from_pretrained(f'{MODEL}/vae', torch_dtype=torch.float32).eval()
vae.enable_tiling()
mean = torch.tensor(vae.config.latents_mean).view(1, 48, 1, 1, 1)
std = torch.tensor(vae.config.latents_std).view(1, 48, 1, 1, 1)
for name, latent in latents.items():
    if os.environ.get('ONLY') and name not in os.environ['ONLY'].split(','):
        continue
    t0 = time.time()
    with torch.no_grad():
        video = vae.decode(latent * std + mean, return_dict=False)[0].float()
    times[f'vae_{name}'] = time.time() - t0
    official = ((video[0].permute(1, 2, 3, 0).clamp(-1, 1) + 1) * 127.5).round().to(torch.uint8).numpy()
    official.tofile(f'{out}/{name}.vae.u8')
    save(official, f'{out}/{name}.vae.mp4')
    print(name, 'vae', official.shape, times[f'vae_{name}'], flush=True)
json.dump(times, open(f'{out}/decode_times.json', 'w'), indent=1)
