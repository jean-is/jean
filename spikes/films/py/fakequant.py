# Which weights can lose bits: the first step of one film with the transformer's linear weights rounded as
# MatMulNBits would store them (blocks of `block` along the input, symmetric or with a zero point), by rule,
# against the bf16 reference. usage: fakequant.py <name> <recipe> [<recipe>…]
# A recipe is rule:bits pairs joined by commas, first match wins, e.g. "blocks.*ffn:4,blocks:8,*:16" or "all4a".
import fnmatch, json, os, sys, time
import numpy as np
import torch
from diffusers import WanTransformer3DModel

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
name = sys.argv[1]
schedule = json.load(open(f'{base}/ref/schedule.json'))
shape = schedule['latent_shape']
noise = torch.from_numpy(np.fromfile(f'{base}/ref/{name}.noise0.f32', dtype=np.float32).reshape(shape))
embeds = torch.from_numpy(np.fromfile(f'{base}/ref/{name}.embeds.f32', dtype=np.float32).reshape(1, 512, 4096))
ref = np.fromfile(f'{base}/ref/{name}.x0_0.f32', dtype=np.float32)
model = WanTransformer3DModel.from_pretrained(f'{base}/downloads/fastwan/transformer', torch_dtype=torch.float16).eval()
original = {n: m.weight.data.clone() for n, m in model.named_modules() if isinstance(m, torch.nn.Linear)}
model.to('mps')


def rounded(w, bits, block, symmetric):
    out, k = w.shape
    g = w.float().reshape(out, k // block, block)
    if symmetric:
        scale = g.abs().amax(-1, keepdim=True) / (2 ** (bits - 1) - 1)
        q = torch.clamp(torch.round(g / scale.clamp(min=1e-12)), -(2 ** (bits - 1)), 2 ** (bits - 1) - 1)
        return (q * scale).reshape(out, k).to(w.dtype)
    lo, hi = g.amin(-1, keepdim=True), g.amax(-1, keepdim=True)
    scale = ((hi - lo) / (2 ** bits - 1)).clamp(min=1e-12)
    zero = torch.round(-lo / scale)
    q = torch.clamp(torch.round(g / scale) + zero, 0, 2 ** bits - 1)
    return ((q - zero) * scale).reshape(out, k).to(w.dtype)


def apply(recipe):
    """Rules as pattern:bits[s|a][/block]; returns the weights' size in GB."""
    rules = []
    for part in recipe.split(','):
        pattern, spec = part.rsplit(':', 1)
        head = spec.split('/')[0]
        bits = int(head.rstrip('sa'))
        block = int(spec.split('/')[1]) if '/' in spec else 32
        rules.append((pattern, bits, block, not head.endswith('a')))
    size = 0
    for n, m in model.named_modules():
        if not isinstance(m, torch.nn.Linear):
            continue
        pattern, bits, block, symmetric = next(r for r in rules if fnmatch.fnmatch(n, r[0]))
        w = original[n]
        m.weight.data = (w if bits >= 16 else rounded(w, bits, block, symmetric)).to('mps')
        size += w.numel() * (2 if bits >= 16 else bits / 8 + (2 + (0 if symmetric else 0.5)) / block)
    return size / 1e9


for recipe in (sys.argv[2:] if __name__ == '__main__' else []):
    size = apply(recipe)
    t0 = time.time()
    with torch.no_grad():
        v = model(hidden_states=noise.to('mps', torch.float16), timestep=torch.tensor([1000], device='mps'),
                  encoder_hidden_states=embeds.to('mps', torch.float16), return_dict=False)[0].float().cpu().numpy()
    x0 = (noise.numpy() - schedule['sigmas'][0] * v).ravel()
    print(json.dumps({'recipe': recipe, 'linearGB': round(size, 2), 'relError': round(float(np.linalg.norm(x0 - ref) / np.linalg.norm(ref)), 4),
                      'cosine': round(float(x0 @ ref / np.linalg.norm(x0) / np.linalg.norm(ref)), 4), 'seconds': round(time.time() - t0, 1)}), flush=True)
