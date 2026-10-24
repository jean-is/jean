# Rewrites a graph's external weights into shards under 1.9 GB each, as Jean's makers give them to ONNX Runtime Web.
# usage: reshard.py <in.onnx> <out.onnx>  → out.onnx, out.onnx.data0, out.onnx.data1…
import os, sys
import onnx
from onnx.external_data_helper import ExternalDataInfo

LIMIT = 1_900_000_000
src, dst = sys.argv[1], sys.argv[2]
model = onnx.load(src, load_external_data=False)
base = os.path.dirname(os.path.abspath(src))
shards, shard, written = [], None, LIMIT
for tensor in model.graph.initializer:
    if tensor.data_location != onnx.TensorProto.EXTERNAL:
        continue
    info = ExternalDataInfo(tensor)
    with open(os.path.join(base, info.location), 'rb') as f:
        f.seek(info.offset or 0)
        data = f.read(info.length)
    if written + len(data) > LIMIT:
        name = f'{os.path.basename(dst)}.data{len(shards)}'
        shards.append(name)
        shard = open(os.path.join(os.path.dirname(os.path.abspath(dst)), name), 'wb')
        written = 0
    offset = written
    shard.write(data)
    written += len(data)
    del tensor.external_data[:]
    for key, value in (('location', shards[-1]), ('offset', str(offset)), ('length', str(len(data)))):
        entry = tensor.external_data.add()
        entry.key, entry.value = key, value
onnx.save(model, dst)
print(dst, shards)
