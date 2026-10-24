# The browser's film against the reference's: each step's clean latent (relative error, cosine), the frames (PSNR per
# frame against the reference's through the same decoder, and against Wan's own decoder where it was run), and a
# sheet of frames side by side. usage: compare.py <name> [suffix of the browser's files, like .refembeds]
import json, os, sys
import numpy as np
from PIL import Image

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
name, suffix = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else '')
schedule = json.load(open(f'{base}/ref/schedule.json'))
shape = schedule['latent_shape']
report = {'film': name + suffix}
if os.path.exists(f'{base}/browser-out/{name}{suffix}.embeds.f32'):
    a = np.fromfile(f'{base}/browser-out/{name}{suffix}.embeds.f32', dtype=np.float32).reshape(512, 4096)
    b = np.fromfile(f'{base}/ref/{name}.embeds.f32', dtype=np.float32).reshape(512, 4096)
    used = np.abs(b).sum(axis=1) > 0
    report['embeds'] = {'tokens': int(used.sum()), 'relError': float(np.linalg.norm(a[used] - b[used]) / np.linalg.norm(b[used])),
                        'cosine': float((a[used] * b[used]).sum() / np.linalg.norm(a[used]) / np.linalg.norm(b[used]))}
    ids = json.load(open(f'{base}/browser-out/{name}{suffix}.ids.json'))
    ref_ids = np.fromfile(f'{base}/ref/{name}.ids.i64', dtype=np.int64)
    report['idsMatch'] = ids == ref_ids[:len(ids)].tolist() and int((ref_ids != 0).sum()) == len(ids)
for i in range(len(schedule['steps'])):
    a = np.fromfile(f'{base}/browser-out/{name}{suffix}.x0_{i}.f32', dtype=np.float32)
    b = np.fromfile(f'{base}/ref/{name}.x0_{i}.f32', dtype=np.float32)
    report[f'x0_{i}'] = {'relError': float(np.linalg.norm(a - b) / np.linalg.norm(b)), 'cosine': float(a @ b / np.linalg.norm(a) / np.linalg.norm(b))}


def psnr(a, b):
    per = ((a.astype(np.float32) - b.astype(np.float32)) ** 2).reshape(a.shape[0], -1).mean(axis=1)
    values = 10 * np.log10(255 ** 2 / np.maximum(per, 1e-9))
    return {'mean': round(float(values.mean()), 2), 'min': round(float(values.min()), 2), 'first': round(float(values[0]), 2), 'last': round(float(values[-1]), 2)}


frames = np.fromfile(f'{base}/browser-out/{name}{suffix}.frames.u8', dtype=np.uint8).reshape(81, 480, 832, 3)
tae = np.fromfile(f'{base}/ref/{name}.{os.environ.get("DECODER", "tae")}.u8', dtype=np.uint8).reshape(frames.shape)
report['psnrVsRefSameDecoder'] = psnr(frames, tae)
if os.path.exists(f'{base}/ref/{name}.vae.u8'):
    vae = np.fromfile(f'{base}/ref/{name}.vae.u8', dtype=np.uint8).reshape(frames.shape)
    report['psnrVsRefWanDecoder'] = psnr(frames, vae)
    report['refTaeVsRefWanDecoder'] = psnr(tae, vae)
rows = [np.concatenate([source[i] for i in (0, 40, 80)], axis=1) for source in ([tae, frames] + ([vae] if os.path.exists(f'{base}/ref/{name}.vae.u8') else []))]
Image.fromarray(np.concatenate(rows, axis=0)).resize((1248, 240 * len(rows))).save(f'{base}/browser-out/{name}{suffix}.sheet.png')
print(json.dumps(report, indent=1))
