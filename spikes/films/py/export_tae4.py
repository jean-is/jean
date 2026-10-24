# TAEHV's Wan 2.2 decoder in four dimensions (for WebKit, as export_tokens.py): latents [T, 48, H, W] as the model
# gives them to frames [4T − 3, 3, 16H, 16W] in 0…1, each memory block's past the frames before, shifted by one.
# usage: export_tae4.py <weights.safetensors> <out.onnx> <latent frames> <latent height> <latent width>
import os, sys
import torch
import torch.nn.functional as F

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ref-src'))
from taehv import TAEHV, MemBlock, TGrow

weights, out, t, h, w = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5])
tae = TAEHV(weights, arch_name='taew2_2').eval().half()


class Decode(torch.nn.Module):
    def __init__(self, tae):
        super().__init__()
        self.tae = tae

    def forward(self, x):
        for block in self.tae.decoder:
            if isinstance(block, MemBlock):
                x = block(x, torch.cat([torch.zeros_like(x[:1]), x[:-1]], 0))
            elif isinstance(block, TGrow):
                x = block.conv(x)
                x = x.reshape(-1, x.shape[1] // block.stride, x.shape[2], x.shape[3])
            else:
                x = block(x)
        x = F.pixel_shuffle(x, self.tae.patch_size).clamp(0, 1)
        return x[self.tae.frames_to_trim:]


decode = Decode(tae).eval()
latents = torch.randn(t, 48, h, w, dtype=torch.float16)
with torch.no_grad():
    expected = tae.decode_video(latents[None], parallel=True, show_progress_bar=False)[0]
    got = decode(latents)
    print('matches TAEHV:', float((expected.float() - got.float()).abs().max()))
    program = torch.onnx.export(decode, (latents,), dynamo=True, opset_version=18, input_names=['latents'], output_names=['frames'], optimize=True)
program.save(out)
print(out)
