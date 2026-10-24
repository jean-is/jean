# The first step's clean latent for one film, made another way, against the reference's (bf16 on MPS) and the
# browser's: PyTorch in fp32 or fp16 on MPS, or an ONNX graph on ONNX Runtime's CPU.
# usage: step0.py <name> torch-fp32 | torch-fp16 | ort <graph.onnx>
import json, os, sys, time
import numpy as np
import torch

base = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
name, how = sys.argv[1], sys.argv[2]
schedule = json.load(open(f'{base}/ref/schedule.json'))
shape = schedule['latent_shape']
noise = np.fromfile(f'{base}/ref/{name}.noise0.f32', dtype=np.float32).reshape(shape)
embeds = np.fromfile(f'{base}/ref/{name}.embeds.f32', dtype=np.float32).reshape(1, 512, 4096)
t0 = time.time()
if how.startswith('torch'):
    from diffusers import WanTransformer3DModel
    dtype = torch.float32 if how == 'torch-fp32' else torch.float16
    model = WanTransformer3DModel.from_pretrained(f'{base}/downloads/fastwan/transformer', torch_dtype=dtype).to('mps').eval()
    t0 = time.time()
    with torch.no_grad():
        v = model(hidden_states=torch.from_numpy(noise).to('mps', dtype), timestep=torch.tensor([1000], device='mps'),
                  encoder_hidden_states=torch.from_numpy(embeds).to('mps', dtype), return_dict=False)[0].float().cpu().numpy()
else:
    import onnxruntime as ort
    session = ort.InferenceSession(sys.argv[3], providers=['CPUExecutionProvider'])
    t0 = time.time()
    v = session.run(None, {'latents': noise.astype(np.float16), 'timestep': np.array([1000], dtype=np.int64), 'text': embeds.astype(np.float16)})[0].astype(np.float32)
seconds = time.time() - t0
x0 = noise - schedule['sigmas'][0] * v
x0.tofile(f'{base}/ref/{name}.x0_0.{how}.f32')


def against(other):
    b = np.fromfile(other, dtype=np.float32)
    a = x0.ravel()
    return {'relError': round(float(np.linalg.norm(a - b) / np.linalg.norm(b)), 4), 'cosine': round(float(a @ b / np.linalg.norm(a) / np.linalg.norm(b)), 4)}


print(json.dumps({'how': how, 'seconds': round(seconds, 1), 'vsReferenceBf16': against(f'{base}/ref/{name}.x0_0.f32'),
                  'vsBrowserQ4': against(f'{base}/browser-out/{name}.refembeds.x0_0.f32'), 'nonFinite': int((~np.isfinite(x0)).sum())}))
