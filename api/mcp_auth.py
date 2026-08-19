from __future__ import annotations

import os

from fastmcp.server.auth.auth import AuthProvider
from fastmcp.server.auth.providers.github import (
    GitHubProvider,
    GitHubTokenVerifier,
)

MCP_AUTH_MODE = os.environ.get("IQ_MCP_AUTH_MODE", "password").strip().casefold()


class RestrictedGitHubTokenVerifier(GitHubTokenVerifier):
    """Accept a GitHub OAuth token only for the configured personal account."""

    def __init__(self, allowed_login: str):
        super().__init__(required_scopes=["read:user"])
        self.allowed_login = allowed_login.casefold()

    async def verify_token(self, token: str):
        access_token = await super().verify_token(token)
        if access_token is None:
            return None
        login = str(access_token.claims.get("login", "")).casefold()
        if login != self.allowed_login:
            return None
        return access_token


def build_mcp_auth() -> AuthProvider | None:
    """Build optional ChatGPT-compatible OAuth; password mode stays at FastAPI."""

    if MCP_AUTH_MODE in {"password", "none"}:
        return None
    if MCP_AUTH_MODE != "github":
        raise RuntimeError("IQ_MCP_AUTH_MODE must be password, none, or github")

    values = {
        "client_id": os.environ.get("IQ_MCP_GITHUB_CLIENT_ID", "").strip(),
        "client_secret": os.environ.get("IQ_MCP_GITHUB_CLIENT_SECRET", "").strip(),
        "base_url": os.environ.get("IQ_MCP_PUBLIC_URL", "").strip(),
        "allowed_login": os.environ.get("IQ_MCP_GITHUB_LOGIN", "").strip(),
    }
    missing = [name for name, value in values.items() if not value]
    if missing:
        raise RuntimeError(
            "GitHub MCP OAuth is missing: " + ", ".join(sorted(missing))
        )

    provider = GitHubProvider(
        client_id=values["client_id"],
        client_secret=values["client_secret"],
        base_url=values["base_url"],
        required_scopes=["read:user"],
        jwt_signing_key=os.environ.get("IQ_MCP_JWT_SIGNING_KEY") or None,
    )
    # OAuthProxy validates the upstream identity through this verifier before it
    # mints a short-lived MCP token. Restricting here keeps a personal deployment
    # private even if another GitHub user reaches the authorization page.
    provider._token_validator = RestrictedGitHubTokenVerifier(  # noqa: SLF001
        values["allowed_login"]
    )
    return provider


def mcp_manages_its_own_access() -> bool:
    """Whether the parent password middleware must leave /mcp to FastMCP."""

    return MCP_AUTH_MODE in {"none", "github"}
