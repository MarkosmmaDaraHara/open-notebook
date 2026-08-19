import pytest
from fastmcp import Client

from api import documents_service
from api.mcp_documents import document_mcp
from open_notebook.documents.store import LocalDocumentStore


@pytest.mark.asyncio
async def test_mcp_create_read_replace_delete_flow(tmp_path, monkeypatch):
    monkeypatch.setattr(documents_service, "document_store", LocalDocumentStore(tmp_path))

    async with Client(document_mcp) as client:
        tool_names = {tool.name for tool in await client.list_tools()}
        assert {
            "search",
            "fetch",
            "create_document",
            "read_document",
            "replace_document_text",
            "delete_document",
        } <= tool_names

        created = await client.call_tool(
            "create_document",
            {"title": "MCP contract", "initial_text": "Hello world"},
        )
        document_id = created.data["id"]
        read = await client.call_tool(
            "read_document", {"document_id": document_id}
        )
        assert read.data["text"] == "Hello world"

        updated = await client.call_tool(
            "replace_document_text",
            {
                "document_id": document_id,
                "original": "world",
                "replacement": "IQ",
                "expected_version": read.data["version"],
            },
        )
        assert updated.data["replacement_count"] == 1

        deleted = await client.call_tool(
            "delete_document",
            {"document_id": document_id, "confirmation_title": "MCP contract"},
        )
        assert deleted.data["deleted"] is True
