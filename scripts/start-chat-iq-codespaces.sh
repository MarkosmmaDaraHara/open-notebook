#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${CODESPACE_NAME:-}" || -z "${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN:-}" ]]; then
  echo "This helper is intended to run inside GitHub Codespaces."
  exit 1
fi

codespace_host="${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}"
export API_URL="https://${CODESPACE_NAME}-5055.${codespace_host}"
export ONLYOFFICE_DOCUMENT_SERVER_URL="https://${CODESPACE_NAME}-8080.${codespace_host}"
export IQ_MCP_PUBLIC_URL="${API_URL}"

if [[ -n "${IQ_MCP_GITHUB_CLIENT_ID:-}" && -n "${IQ_MCP_GITHUB_CLIENT_SECRET:-}" && -n "${IQ_MCP_GITHUB_LOGIN:-}" ]]; then
  export IQ_MCP_AUTH_MODE="github"
else
  export IQ_MCP_AUTH_MODE="none"
  echo "Warning: GitHub OAuth secrets are missing; MCP will use temporary No Authentication mode."
  echo "Do not place confidential documents in this test instance."
fi

if [[ -z "${ONLYOFFICE_JWT_SECRET:-}" ]]; then
  echo "Set ONLYOFFICE_JWT_SECRET as a Codespaces secret before starting Chat IQ."
  exit 1
fi

docker compose -f docker-compose.iq.yml up --build -d

echo "Chat IQ:      https://${CODESPACE_NAME}-8502.${codespace_host}/documents"
echo "MCP endpoint: ${IQ_MCP_PUBLIC_URL}/mcp"
echo "ONLYOFFICE:   ${ONLYOFFICE_DOCUMENT_SERVER_URL}"
echo "In the Codespaces Ports tab, set ports 8502, 5055, and 8080 to Public for testing."
