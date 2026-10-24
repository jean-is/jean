# The graphs Jean ships for films on this device (jean-is/FastWan2.2-TI2V-5B-ONNX), into real/ship/, in its layout:
#  transformer/transformer.onnx: FastWan's transformer within four dimensions (export_tokens.py), any size and length,
#   as the rotary tables come in: patches [1, N, 192] fp16, timestep [1] int64, text [1, 512, 4096] fp16,
#   rope_cos and rope_sin [1, N, 1, 128] fp32 (sin's even columns negated) → out [1, N, 192]; attention fused,
#   its blocks' weights 8-bit, the rest fp16, MatMulNBits at accuracy level 1, in shards under 1.9 GB;
#  text_encoder/: umT5's layers in three graphs of eight (export_umt5.py, 8-bit), the embedding as int8 rows and scales;
#  decoder/taehv.onnx: TAEHV's taew2_2 within four dimensions, latents [T, 48, H, W] → frames [4T − 3, 3, 16H, 16W];
#  tokenizer/: as FastWan's. usage: export_film.py
import os, shutil, subprocess, sys
import torch

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = os.path.join(HERE, '..', 'downloads', 'fastwan')
OUT = os.path.join(HERE, '..', 'real', 'ship')
WORK = os.path.join(HERE, '..', 'real', 'ship-work')
for d in ('transformer', 'text_encoder', 'decoder', 'tokenizer'):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)
os.makedirs(WORK, exist_ok=True)
run = lambda *args: subprocess.run([sys.executable, *args], check=True)

# The transformer, its rotary tables as inputs.
sys.argv = ['export_tokens.py', '/dev/null', '21', '30', '52']
ns = {'__file__': os.path.join(HERE, 'export_tokens.py')}
exec(open(os.path.join(HERE, 'export_tokens.py')).read().split('tokens = T * (H // 2)')[0], ns)
Tokens = ns['Tokens']


class Film(Tokens):
    def __init__(self, m):
        super().__init__(m)
        # Its rotary tables come as inputs: buffers of one size given as examples would fix the token count.
        del self.cos, self.sin

    def forward(self, patches, timestep, text, rope_cos, rope_sin):
        hidden = self.patch(patches)
        temb, timestep_proj, text, _ = self.m.condition_embedder(timestep, text, None, timestep_seq_len=None)
        timestep_proj = timestep_proj.unflatten(1, (6, -1))
        for block in self.m.blocks:
            hidden = block(hidden, text, timestep_proj, (rope_cos, rope_sin))
        shift, scale = (self.m.scale_shift_table + temb.unsqueeze(1)).chunk(2, dim=1)
        hidden = (self.m.norm_out(hidden.float()) * (1 + scale) + shift).type_as(hidden)
        return self.m.proj_out(hidden)


film = Film(ns['model']).eval()
tokens = torch.export.Dim('tokens', min=2, max=65536)
example = (torch.randn(1, 8190, 192, dtype=torch.float16), torch.tensor([999]), torch.randn(1, 512, 4096, dtype=torch.float16), torch.rand(1, 8190, 1, 128), torch.rand(1, 8190, 1, 128))
raw = os.path.join(WORK, 'film.onnx')
if not os.path.exists(raw):
    with torch.no_grad():
        program = torch.onnx.export(film, example, dynamo=True, opset_version=18, input_names=['patches', 'timestep', 'text', 'rope_cos', 'rope_sin'],
                                    output_names=['out'], dynamic_shapes=({1: tokens}, None, None, {1: tokens}, {1: tokens}), optimize=True)
    program.save(raw, external_data=True)
fused = os.path.join(WORK, 'film_fused.onnx')
if not os.path.exists(fused):
    run(os.path.join(HERE, 'fuse.py'), raw, fused)
run(os.path.join(HERE, 'quantize_mixed.py'), fused, os.path.join(OUT, 'transformer', 'transformer.onnx'), 'blocks.*:8,*:16')

# The text encoder's graphs, 8-bit, renamed.
umt5 = os.path.join(WORK, 'umt5')
if not os.path.exists(os.path.join(umt5, 'layers_16_24.onnx')):
    run(os.path.join(HERE, 'export_umt5.py'), umt5, '8')
for part in ('00_08', '08_16', '16_24'):
    q8 = os.path.join(WORK, f'q8_{part}.onnx')
    if not os.path.exists(q8):
        run(os.path.join(HERE, 'quantize.py'), os.path.join(umt5, f'layers_{part}.onnx'), q8, '8', '1')
    run(os.path.join(HERE, 'reshard.py'), q8, os.path.join(OUT, 'text_encoder', f'layers_{part}.onnx'))
for name in ('embedding.i8', 'embedding.scale.f16'):
    shutil.copy(os.path.join(umt5, name), os.path.join(OUT, 'text_encoder', name))

# TAEHV's decoder, any length and size.
run(os.path.join(HERE, 'export_tae4.py'), os.path.join(HERE, '..', 'downloads', 'lighttae-weights', 'taew2_2.safetensors'), os.path.join(OUT, 'decoder', 'taehv.onnx'), '21', '30', '52', 'dynamic')
for name in ('tokenizer.json', 'tokenizer_config.json', 'special_tokens_map.json', 'spiece.model'):
    shutil.copy(os.path.join(MODEL, 'tokenizer', name), os.path.join(OUT, 'tokenizer', name))
print(OUT)
