# SPDX-License-Identifier: MIT
# Who may use the gateway: whoever the organisation's sign-in vouches for. Jean sends the person's access
# token as `Authorization: Bearer`, to the brains (/v1) and to the MCP servers (/mcp) alike. This checks
# its signature against the issuer's keys, its issuer, audience and expiry, and names the person in
# LiteLLM's logs. LiteLLM Enterprise's JWT auth (enable_jwt_auth) does the same from its configuration.
import asyncio
import os

import jwt  # PyJWT, which LiteLLM ships
from fastapi import Request
from litellm.proxy._types import UserAPIKeyAuth

ISSUER = os.environ["OIDC_ISSUER"]
AUDIENCE = os.environ["OIDC_AUDIENCE"]
keys = jwt.PyJWKClient(os.environ["OIDC_JWKS_URI"], cache_keys=True)


async def user_api_key_auth(request: Request, api_key: str) -> UserAPIKeyAuth:
    token = api_key.removeprefix("Bearer ").strip()
    key = await asyncio.to_thread(keys.get_signing_key_from_jwt, token)
    claims = jwt.decode(token, key.key, algorithms=["RS256", "ES256"], issuer=ISSUER, audience=AUDIENCE, options={"require": ["exp", "sub"]})
    return UserAPIKeyAuth(user_id=claims["sub"], user_email=claims.get("email"))
