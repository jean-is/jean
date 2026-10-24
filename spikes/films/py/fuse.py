# ONNX Runtime's fusions over an exported graph (attention into MultiHeadAttention, norms, GELU…).
# usage: fuse.py <in.onnx> <out.onnx>
import collections, os, sys
import onnx_ir as ir
from onnxscript.rewriter.ort_fusions import optimize_for_ort

model = ir.load(sys.argv[1])
model, counts = optimize_for_ort(model)
print({k: v for k, v in counts.items() if v})
ir.save(model, sys.argv[2], external_data=os.path.basename(sys.argv[2]) + '.data')
ops = collections.Counter(f'{n.domain}:{n.op_type}' for n in model.graph)
print(dict(ops.most_common(30)))
