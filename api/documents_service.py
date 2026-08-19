from __future__ import annotations

import asyncio
from pathlib import Path

from api.document_models import (
    DocumentCreateRequest,
    DocumentUpdateRequest,
    IQCommandRequest,
)
from open_notebook.documents.iq import IQEditProposal, create_iq_edit_proposal
from open_notebook.documents.onlyoffice import OnlyOfficeService
from open_notebook.documents.store import (
    DocumentRecord,
    LocalDocumentStore,
    html_to_plain_text,
)

document_store = LocalDocumentStore()
onlyoffice_service = OnlyOfficeService()


async def list_documents(query: str | None = None) -> list[DocumentRecord]:
    return await asyncio.to_thread(document_store.list_documents, query)


async def get_document(document_id: str) -> DocumentRecord:
    return await asyncio.to_thread(document_store.get_document, document_id)


async def create_document(request: DocumentCreateRequest) -> DocumentRecord:
    return await asyncio.to_thread(
        document_store.create_document,
        request.title,
        request.initial_html,
        request.initial_text,
    )


async def update_document(
    document_id: str, request: DocumentUpdateRequest
) -> DocumentRecord:
    return await asyncio.to_thread(
        document_store.update_document,
        document_id,
        title=request.title,
        content_html=request.html,
        expected_version=request.expected_version,
    )


async def delete_document(document_id: str) -> None:
    await asyncio.to_thread(document_store.delete_document, document_id)


async def get_docx_path(document_id: str) -> Path:
    await get_document(document_id)
    return document_store.docx_path(document_id)


async def get_onlyoffice_editor_config(
    document_id: str, *, user_id: str, user_name: str
) -> dict:
    record = await get_document(document_id)
    return onlyoffice_service.build_editor_config(
        record, user_id=user_id, user_name=user_name
    )


async def process_onlyoffice_callback(
    document_id: str,
    payload: dict,
    authorization_header: str | None,
) -> DocumentRecord | None:
    onlyoffice_service.verify_callback_token(payload, authorization_header)
    status = int(payload.get("status", 0))
    if status not in {2, 6}:
        return None
    download_url = payload.get("url")
    if not isinstance(download_url, str) or not download_url:
        raise ValueError("ONLYOFFICE save callback did not include a document URL")
    content = await onlyoffice_service.download_saved_document(download_url)
    return await asyncio.to_thread(document_store.save_docx_bytes, document_id, content)


async def propose_iq_edit(
    document_id: str, request: IQCommandRequest
) -> IQEditProposal:
    record = await get_document(document_id)
    document_text = request.document_text or html_to_plain_text(record.html)
    return await create_iq_edit_proposal(
        instruction=request.instruction,
        selected_text=request.selected_text,
        document_text=document_text,
    )
