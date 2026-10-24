# umT5-XXL's encoder for the browser: its 24 layers in graphs of `per` layers each (the last with the final norm),
# taking and giving hidden states [1, tokens, 4096] for the prompt's own tokens only (padding is masked out, and
# each layer's relative position bias depends on the length alone), in halves with `wo` kept in fp32 as
# transformers keeps it; and the embedding table as int8 rows with a scale each, looked up in JavaScript.
# usage: export_umt5.py <out dir> [per]
import os, sys
import numpy as np
import torch
from transformers import UMT5EncoderModel

MODEL = os.path.join(os.path.dirname(__file__), '..', 'downloads', 'fastwan', 'text_encoder')
out = sys.argv[1]
per = int(sys.argv[2]) if len(sys.argv) > 2 else 8
os.makedirs(out, exist_ok=True)
model = UMT5EncoderModel.from_pretrained(MODEL, torch_dtype=torch.float16, attn_implementation='eager').eval()
stack = model.encoder

table = stack.embed_tokens.weight.detach().float().numpy()
scale = np.abs(table).max(axis=1) / 127
rows = np.round(table / np.maximum(scale, 1e-12)[:, None]).clip(-127, 127).astype(np.int8)
rows.tofile(f'{out}/embedding.i8')
scale.astype(np.float16).tofile(f'{out}/embedding.scale.f16')
print('embedding', rows.shape, 'max row error', float(np.abs(rows * scale[:, None] - table).max()))


class Layers(torch.nn.Module):
    def __init__(self, layers, norm):
        super().__init__()
        self.layers = torch.nn.ModuleList(layers)
        self.norm = norm

    def forward(self, hidden):
        for layer in self.layers:
            hidden = layer(hidden, None)
        return self.norm(hidden) if self.norm is not None else hidden


tokens = torch.export.Dim('tokens', min=2, max=512)
for start in range(0, len(stack.block), per):
    end = min(start + per, len(stack.block))
    part = Layers(list(stack.block[start:end]), stack.final_layer_norm if end == len(stack.block) else None).eval()
    with torch.no_grad():
        program = torch.onnx.export(part, (torch.randn(1, 64, 4096, dtype=torch.float16),), dynamo=True, opset_version=18,
                                    dynamic_shapes=({1: tokens},), input_names=['hidden'], output_names=['out'], optimize=True)
    path = f'{out}/layers_{start:02d}_{end:02d}.onnx'
    program.save(path, external_data=True)
    print(path, flush=True)
