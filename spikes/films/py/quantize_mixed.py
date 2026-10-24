# A graph's MatMuls as MatMulNBits by the module each comes from (the exporter's name scopes), with fp16 compute
# (accuracy level 1: level 4's int8 activations erred on WebGPU), then sharded under 1.9 GB.
# A recipe is pattern:bits pairs, first match wins, as fakequant.py's ("blocks.*attn1*:8,blocks.*:4,*:16").
# usage: quantize_mixed.py <in.onnx> <out.onnx> <recipe>
import fnmatch, os, re, subprocess, sys
import onnx
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer

src, dst, recipe = sys.argv[1:4]
rules = [(p, int(b)) for p, b in (part.rsplit(':', 1) for part in recipe.split(','))]


def module(node):
    scopes = next((p.value for p in node.metadata_props if p.key == 'pkg.torch.onnx.name_scopes'), '')
    paths = re.findall(r"'m\.([^']+)'", scopes)
    return max(paths, key=len) if paths else ''


def bits(node):
    path = module(node)
    return next(b for p, b in rules if fnmatch.fnmatch(path, p))


model = onnx.load(src)
for wanted in (8, 4):
    matmuls = [n for n in model.graph.node if n.op_type == 'MatMul']
    exclude = [n.name for n in matmuls if bits(n) != wanted]
    print(wanted, 'bits:', len(matmuls) - len(exclude), 'MatMuls', flush=True)
    if len(exclude) == len(matmuls):
        continue
    quant = MatMulNBitsQuantizer(model, bits=wanted, block_size=32, is_symmetric=True, accuracy_level=1, nodes_to_exclude=exclude)
    quant.process()
    model = quant.model.model
big = dst + '.big.onnx'
onnx.save(model, big, save_as_external_data=True, location=os.path.basename(big) + '.data')
subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'reshard.py'), big, dst], check=True)
os.remove(big)
os.remove(big + '.data')
print(sum(os.path.getsize(os.path.join(os.path.dirname(dst), f)) for f in os.listdir(os.path.dirname(dst) or '.') if f.startswith(os.path.basename(dst))) / 1e9, 'GB')
