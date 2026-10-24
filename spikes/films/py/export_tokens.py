# FastWan's transformer with no tensor of more than four dimensions, for WebKit: Safari's WGSL-to-Metal can't build
# the array<u32, 5>(…) that ONNX Runtime's shaders write for five. The latents come in as patches [1, N, 192]
# (each token's 48 channels × 2 × 2, as the Conv3d's weights read them) and go out the same way, patchified and
# unpatchified in JavaScript; rotary embedding as x·cos + (x·P)·sin±, P swapping each pair, for a given latent size
# (its frequencies constants). usage: export_tokens.py <out.onnx> <latent frames> <latent height> <latent width>
import os, sys
import torch
import torch.nn.functional as F
from diffusers import WanTransformer3DModel
from diffusers.models.transformers.transformer_wan import _get_qkv_projections

MODEL = os.path.join(os.path.dirname(__file__), '..', 'downloads', 'fastwan', 'transformer')
out, T, H, W = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4])
model = WanTransformer3DModel.from_pretrained(MODEL, torch_dtype=torch.float16).eval()

swap = torch.zeros(128, 128, dtype=torch.float16)
swap[torch.arange(128), torch.arange(128) ^ 1] = 1  # (x·P)[2i] = x[2i+1], (x·P)[2i+1] = x[2i]
sign = torch.tensor([-1.0, 1.0] * 64)


class Rank4Processor:
    """WanAttnProcessor, its rotary embedding in four dimensions."""

    def __call__(self, attn, hidden_states, encoder_hidden_states=None, attention_mask=None, rotary_emb=None):
        query, key, value = _get_qkv_projections(attn, hidden_states, encoder_hidden_states)
        query, key = attn.norm_q(query), attn.norm_k(key)
        query, key, value = (x.unflatten(2, (attn.heads, -1)) for x in (query, key, value))
        if rotary_emb is not None:
            cos, sin = rotary_emb
            query = (query.float() * cos + (query @ swap).float() * sin).type_as(query)
            key = (key.float() * cos + (key @ swap).float() * sin).type_as(key)
        hidden = F.scaled_dot_product_attention(query.transpose(1, 2), key.transpose(1, 2), value.transpose(1, 2)).transpose(1, 2)
        return attn.to_out[0](hidden.flatten(2, 3).type_as(query))


class Tokens(torch.nn.Module):
    def __init__(self, m):
        super().__init__()
        self.m = m
        cos, sin = m.rope(torch.zeros(1, 48, T, H, W))
        self.register_buffer('cos', cos.float())
        self.register_buffer('sin', sin.float() * sign)
        conv = m.patch_embedding
        self.patch = torch.nn.Linear(192, conv.out_channels, dtype=torch.float16)
        self.patch.weight.data = conv.weight.data.reshape(conv.out_channels, 192)
        self.patch.bias.data = conv.bias.data
        for block in m.blocks:
            block.attn1.processor = Rank4Processor()

    def forward(self, patches, timestep, text):
        hidden = self.patch(patches)
        temb, timestep_proj, text, _ = self.m.condition_embedder(timestep, text, None, timestep_seq_len=None)
        timestep_proj = timestep_proj.unflatten(1, (6, -1))
        for block in self.m.blocks:
            hidden = block(hidden, text, timestep_proj, (self.cos, self.sin))
        shift, scale = (self.m.scale_shift_table + temb.unsqueeze(1)).chunk(2, dim=1)
        hidden = (self.m.norm_out(hidden.float()) * (1 + scale) + shift).type_as(hidden)
        return self.m.proj_out(hidden)


tokens = T * (H // 2) * (W // 2)
with torch.no_grad():
    program = torch.onnx.export(Tokens(model).eval(), (torch.randn(1, tokens, 192, dtype=torch.float16), torch.tensor([999]), torch.randn(1, 512, 4096, dtype=torch.float16)),
                                dynamo=True, opset_version=18, input_names=['patches', 'timestep', 'text'], output_names=['out'], optimize=True)
program.save(out, external_data=True)
ranks = sorted({len(v.shape) for v in program.model.graph.all_values() if v.shape is not None} if hasattr(program.model.graph, 'all_values') else set())
print(out, tokens, 'tokens; ranks seen', ranks)
