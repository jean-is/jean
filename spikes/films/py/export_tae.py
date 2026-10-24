# LightTAE's decoder (lightx2v's distilled TAEHV for Wan 2.2) in halves: latents [1, T, 48, H, W] as the model
# gives them (no denormalising) to frames [1, 4T - 3, 3, 16H, 16W] in 0…1, every frame at once.
# usage: export_tae.py <out.onnx> <latent frames> <latent height> <latent width>
import os, sys
import torch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ref-src'))
from taehv import TAEHV

WEIGHTS = os.path.join(os.path.dirname(__file__), '..', 'downloads', 'lighttae-weights', os.environ.get('TAE', 'lighttaew2_2.safetensors'))
out, t, h, w = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
tae = TAEHV(WEIGHTS, arch_name='taew2_2').eval().half()


class Decode(torch.nn.Module):
    def __init__(self, tae):
        super().__init__()
        self.tae = tae

    def forward(self, latents):
        return self.tae.decode_video(latents, parallel=True, show_progress_bar=False)


with torch.no_grad():
    program = torch.onnx.export(Decode(tae), (torch.randn(1, t, 48, h, w, dtype=torch.float16),), dynamo=True, opset_version=18,
                                input_names=['latents'], output_names=['frames'], optimize=True)
program.save(out)
print(out)
