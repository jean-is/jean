# A graph's MatMuls as MatMulNBits, as Jean's picture makers ship their transformers.
# usage: quantize.py <in.onnx> <out.onnx> <bits> [accuracy level]
import os, sys
import onnx
from onnxruntime.quantization.matmul_nbits_quantizer import MatMulNBitsQuantizer

src, dst, bits = sys.argv[1], sys.argv[2], int(sys.argv[3])
level = int(sys.argv[4]) if len(sys.argv) > 4 else 4
model = onnx.load(src)
quant = MatMulNBitsQuantizer(model, bits=bits, block_size=32, is_symmetric=True, accuracy_level=level)
quant.process()
quant.model.save_model_to_file(dst, use_external_data_format=True)
print(dst, os.path.getsize(dst + '.data') if os.path.exists(dst + '.data') else sorted(os.listdir(os.path.dirname(os.path.abspath(dst)))))
