from __future__ import annotations

import asyncio

from fastmcp import FastMCP
from mcp.types import ToolAnnotations

from api import documents_service
from api.document_models import DocumentCreateRequest, IQCommandRequest
from api.mcp_auth import build_mcp_auth
from open_notebook.documents.store import html_to_plain_text

document_mcp = FastMCP(
    name="Chat IQ Documents",
    instructions=(
        "Use these tools to find, read, create, and edit documents in Chat IQ. "
        "Read the current document before editing. Prefer propose_iq_edit for subjective "
        "rewrites, then apply_iq_edit only after the user approves the exact replacement. "
        "Never invent a document ID and never overwrite text if the original has changed."
    ),
    auth=build_mcp_auth(),
)


READ_ONLY = ToolAnnotations(
    readOnlyHint=True,
    destructiveHint=False,
    idempotentHint=True,
    openWorldHint=False,
)
SAFE_WRITE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=False,
    idempotentHint=False,
    openWorldHint=False,
)
DESTRUCTIVE_WRITE = ToolAnnotations(
    readOnlyHint=False,
    destructiveHint=True,
    idempotentHint=False,
    openWorldHint=False,
)


@document_mcp.tool(annotations=READ_ONLY)
async def search(query: str = "") -> dict:
    """Search Chat IQ documents by title and text. Use this to discover document IDs."""

    records = await documents_service.list_documents(query or None)
    return {
        "results": [
            {
                "id": record.id,
                "title": record.title,
                "url": f"iq-document://{record.id}",
                "text": html_to_plain_text(record.html)[:500],
            }
            for record in records[:50]
        ]
    }


@document_mcp.tool(annotations=READ_ONLY)
async def fetch(id: str) -> dict:
    """Fetch one complete document by an ID returned from search."""

    record = await documents_service.get_document(id)
    return {
        "id": record.id,
        "title": record.title,
        "url": f"iq-document://{record.id}",
        "text": html_to_plain_text(record.html),
        "html": record.html,
        "version": record.version,
        "updated_at": record.updated_at.isoformat(),
    }


@document_mcp.tool(annotations=READ_ONLY)
async def list_documents(query: str = "") -> dict:
    """List document metadata, optionally filtered by a word or phrase."""

    records = await documents_service.list_documents(query or None)
    return {
        "documents": [
            {
                "id": record.id,
                "title": record.title,
                "version": record.version,
                "word_count": record.word_count,
                "updated_at": record.updated_at.isoformat(),
            }
            for record in records
        ]
    }


@document_mcp.tool(annotations=READ_ONLY)
async def read_document(document_id: str, max_characters: int = 50_000) -> dict:
    """Read a document's text and metadata before proposing or applying an edit."""

    if max_characters < 1 or max_characters > 200_000:
        raise ValueError("max_characters must be between 1 and 200000")
    record = await documents_service.get_document(document_id)
    text = html_to_plain_text(record.html)
    return {
        "id": record.id,
        "title": record.title,
        "version": record.version,
        "word_count": record.word_count,
        "text": text[:max_characters],
        "truncated": len(text) > max_characters,
    }


@document_mcp.tool(annotations=SAFE_WRITE)
async def create_document(title: str, initial_text: str = "") -> dict:
    """Create a new DOCX-compatible document and return its stable ID."""

    record = await documents_service.create_document(
        DocumentCreateRequest(title=title, initial_text=initial_text or None)
    )
    return record.model_dump(mode="json")


@document_mcp.tool(annotations=SAFE_WRITE)
async def append_to_document(document_id: str, text: str) -> dict:
    """Append new paragraphs to the end of an existing document."""

    if not text.strip():
        raise ValueError("text must not be empty")
    record = await asyncio.to_thread(
        documents_service.document_store.append_text, document_id, text
    )
    return record.model_dump(mode="json")


@document_mcp.tool(annotations=SAFE_WRITE)
async def replace_document_text(
    document_id: str,
    original: str,
    replacement: str,
    expected_version: int,
    replace_all: bool = False,
) -> dict:
    """Replace exact visible text. Supply the version returned by read_document."""

    record, count = await asyncio.to_thread(
        documents_service.document_store.replace_text,
        document_id,
        original,
        replacement,
        replace_all=replace_all,
        expected_version=expected_version,
    )
    if count == 0:
        raise ValueError("The original text was not found; read the document again")
    return {
        "document": record.model_dump(mode="json"),
        "replacement_count": count,
    }


@document_mcp.tool(annotations=READ_ONLY)
async def propose_iq_edit(
    document_id: str,
    instruction: str,
    selected_text: str = "",
) -> dict:
    """Ask the configured IQ model for one reviewable edit without changing the document."""

    proposal = await documents_service.propose_iq_edit(
        document_id,
        IQCommandRequest(instruction=instruction, selected_text=selected_text),
    )
    record = await documents_service.get_document(document_id)
    return {
        "document_id": document_id,
        "document_version": record.version,
        "proposal": proposal.model_dump(),
    }


@document_mcp.tool(annotations=SAFE_WRITE)
async def apply_iq_edit(
    document_id: str,
    original: str,
    replacement: str,
    expected_version: int,
) -> dict:
    """Apply an IQ proposal only after the user approved its exact before/after text."""

    record, count = await asyncio.to_thread(
        documents_service.document_store.replace_text,
        document_id,
        original,
        replacement,
        replace_all=False,
        expected_version=expected_version,
    )
    if count == 0:
        raise ValueError("The original text changed; request a fresh IQ proposal")
    return record.model_dump(mode="json")


@document_mcp.tool(annotations=DESTRUCTIVE_WRITE)
async def delete_document(document_id: str, confirmation_title: str) -> dict:
    """Delete a document only when confirmation_title exactly matches its current title."""

    record = await documents_service.get_document(document_id)
    if confirmation_title != record.title:
        raise ValueError("confirmation_title does not match the document title")
    await documents_service.delete_document(document_id)
    return {"deleted": True, "id": document_id, "title": record.title}


document_mcp_app = document_mcp.http_app(path="/mcp")
