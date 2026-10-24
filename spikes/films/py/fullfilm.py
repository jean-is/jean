# A whole film's three steps in PyTorch on MPS, in fp16 or with a rounding recipe (as fakequant.py), from the
# reference's noises and embeddings; each step's x0 against the reference's. usage: fullfilm.py <name> <tag> [recipe]
import json, os, sys
import numpy as np
import torch
sys.argv = [sys.argv[0], sys.argv[1]] + sys.argv[3:4] if len(sys.argv) > 3 else sys.argv[:2]
tag = os.environ['TAG']
import fakequant as fq  # loads the model in fp16 on MPS; runs nothing when given no recipe
name, schedule, shape = fq.name, fq.schedule, fq.shape
if len(sys.argv) > 2:
    fq.apply(sys.argv[2])
noises = [torch.from_numpy(np.fromfile(f'{fq.base}/ref/{name}.noise{i}.f32', dtype=np.float32).reshape(shape)) for i in range(3)]
x = noises[0]
out = {}
for i, t in enumerate(schedule['steps']):
    with torch.no_grad():
        v = fq.model(hidden_states=x.to('mps', torch.float16), timestep=torch.tensor([t], device='mps'),
                     encoder_hidden_states=fq.embeds.to('mps', torch.float16), return_dict=False)[0].float().cpu()
    x0 = x - schedule['sigmas'][i] * v
    x0.numpy().tofile(f'{fq.base}/ref/{name}.{tag}.x0_{i}.f32')
    r = np.fromfile(f'{fq.base}/ref/{name}.x0_{i}.f32', dtype=np.float32)
    a = x0.numpy().ravel()
    out[f'x0_{i}'] = {'relError': round(float(np.linalg.norm(a - r) / np.linalg.norm(r)), 4), 'cosine': round(float(a @ r / np.linalg.norm(a) / np.linalg.norm(r)), 4)}
    if i + 1 < 3:
        x = schedule['sigmas'][i + 1] * noises[i + 1] + (1 - schedule['sigmas'][i + 1]) * x0
print(json.dumps({'tag': tag, **out}))
