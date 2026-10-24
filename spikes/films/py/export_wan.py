# Export Wan 2.1 T2V 1.3B's transformer (diffusers' WanTransformer3DModel) to ONNX with random weights,
# in halves, to time it on WebGPU: no weights downloaded, since time depends on shapes, not values.
# usage: export_wan.py <out.onnx> <latent frames> <latent height> <latent width> [mha] [layers]
import json, os, sys, torch
from diffusers import WanTransformer3DModel

out, frames, height, width = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
mha = 'mha' in sys.argv[5:]
layers = next((int(a) for a in sys.argv[5:] if a.isdigit()), 30)

config = {k: v for k, v in json.load(open(os.environ.get('CONFIG', 'wan13_config.json'))).items() if not k.startswith('_')}
config['num_layers'] = layers
torch.manual_seed(0)
if os.environ.get('PRETRAINED'):
    model = WanTransformer3DModel.from_pretrained(os.environ['PRETRAINED'], torch_dtype=torch.float16).eval()
else:
    model = WanTransformer3DModel(**config).eval().half()

latents = torch.randn(1, config['in_channels'], frames, height, width, dtype=torch.float16)
timestep = torch.tensor([999], dtype=torch.int64)
text = torch.randn(1, 512, 4096, dtype=torch.float16)


class Wrapped(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m

    def forward(self, latents, timestep, text):
        return self.m(hidden_states=latents, timestep=timestep, encoder_hidden_states=text, return_dict=False)[0]


table = {}
if mha:
    import onnxscript
    from onnxscript import opset18 as op
    msft = onnxscript.values.Opset('com.microsoft', 1)
    heads = config['num_attention_heads']

    # q, k, v come as [batch, heads, sequence, head_dim]; MultiHeadAttention takes [batch, sequence, heads * head_dim].
    def sdpa(query, key, value, attn_mask=None, dropout_p=0.0, is_causal=False, scale=None, enable_gqa=False):
        def flat(x):
            return op.Reshape(op.Transpose(x, perm=[0, 2, 1, 3]), op.Constant(value_ints=[0, 0, -1]))
        out = msft.MultiHeadAttention(flat(query), flat(key), flat(value), num_heads=heads)
        return op.Transpose(op.Reshape(out, op.Constant(value_ints=[0, 0, heads, -1])), perm=[0, 2, 1, 3])

    table[torch.ops.aten.scaled_dot_product_attention.default] = sdpa

with torch.no_grad():
    dynamic = None
    if 'dynamic' in sys.argv[5:]:
        D = torch.export.Dim
        f, h, w = D('f', min=1, max=31), D('h', min=4, max=60), D('w', min=4, max=60)
        dynamic = {'latents': {2: f, 3: 2 * h, 4: 2 * w}, 'timestep': None, 'text': None}
    program = torch.onnx.export(Wrapped(model).eval(), (latents, timestep, text), dynamo=True, opset_version=18,
                                custom_translation_table=table or None, optimize=True, dynamic_shapes=dynamic)
program.save(out, external_data=True)
tokens = frames * (height // 2) * (width // 2)
print(f'{out}: {layers} layers, {tokens} tokens, mha={mha}')
