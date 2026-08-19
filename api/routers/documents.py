from __future__ import annotations

import asyncio

from fastapi import APIRouter, Header, HTTPException, Query, Request
from fastapi.responses import FileResponse

from api import documents_service
from api.document_models import (
    DocumentCreateRequest,
    DocumentResponse,
    DocumentUpdateRequest,
    IQApplyRequest,
    IQCommandRequest,
    OnlyOfficeCallback,
    ReplaceTextRequest,
)
from open_notebook.documents.iq import IQUnavailableError
from open_notebook.documents.onlyoffice import (
    OnlyOfficeConfigurationError,
    OnlyOfficeSecurityError,
)
from open_notebook.documents.store import (
    DocumentNotFoundError,
    DocumentVersionConflictError,
)

router = APIRouter(prefix="/documents")


def _not_found(document_id: str) -> HTTPException:
    return HTTPException(
        status_code=404, detail=f"Document {document_id} was not found"
    )


@router.get("", response_model=list[DocumentResponse], operation_id="list_iq_documents")
async def list_iq_documents(query: str | None = Query(default=None, max_length=200)):
    return await documents_service.list_documents(query)


@router.post(
    "",
    response_model=DocumentResponse,
    status_code=201,
    operation_id="create_iq_document",
)
async def create_iq_document(payload: DocumentCreateRequest):
    return await documents_service.create_document(payload)


@router.get(
    "/{document_id}", response_model=DocumentResponse, operation_id="get_iq_document"
)
async def get_iq_document(document_id: str):
    try:
        return await documents_service.get_document(document_id)
    except DocumentNotFoundError as exc:
        raise _not_found(document_id) from exc


@router.patch(
    "/{document_id}", response_model=DocumentResponse, operation_id="update_iq_document"
)
async def update_iq_document(document_id: str, payload: DocumentUpdateRequest):
    try:
        return await documents_service.update_document(document_id, payload)
    except DocumentNotFoundError as exc:
        raise _not_found(document_id) from exc
    except DocumentVersionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.delete("/{document_id}", status_code=204, operation_id="delete_iq_document")
async def delete_iq_document(document_id: str):
    try:
        await documents_service.delete_document(document_id)
    except DocumentNotFoundError as exc:
        raise _not_found(document_id) from exc


@router.post(
    "/{document_id}/replace",
    response_model=dict,
    operation_id="replace_iq_document_text",
)
async def replace_iq_document_text(document_id: str, payload: ReplaceTextRequest):
    try:
        record, count = await asyncio.to_thread(
            documents_service.document_store.replace_text,
            document_id,
            payload.find,
            payload.replacement,
            replace_all=payload.replace_all,
            expected_version=payload.expected_version,
        )
        return {"document": record.model_dump(mode="json"), "replacement_count": count}
    except DocumentNotFoundError as exc:
        raise _not_found(document_id) from exc
    except DocumentVersionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@router.get("/{document_id}/file", operation_id="download_iq_document")
async def download_iq_document(
    document_id: str,
    access_token: str | None = Query(default=None),
):
    try:
        documents_service.onlyoffice_service.verify_file_access_token(
            document_id, access_token
        )
        record = await documents_service.get_document(document_id)
        path = await documents_service.get_docx_path(document_id)
    except DocumentNotFoundError as exc:
        raise _not_found(document_id) from exc
    except OnlyOfficeSecurityError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{record.title}.docx",
    )


@router.get(
    "/{document_id}/editor-config",
    response_model=dict,
    operation_id="get_onlyoffice_editor_config",
)
async def get_onlyoffice_editor_config(
    document_id: str,
    x_iq_user_id: str = Header(default="chat-iq-user"),
    x_iq_user_name: str = Header(default="Chat IQ user"),
):
    try:
        return await documents_service.get_onlyoffice_editor_config(
            document_id, user_id=x_iq_user_id, user_name=x_iq_user_name
        )
    except DocumentNotFoundError as exc:
        raise _not_found(document_id) from exc
    except OnlyOfficeConfigurationError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.get("/{document_id}/export", operation_id="export_iq_document")
async def export_iq_document(document_id: str):
    """Download a DOCX through the authenticated application API."""
    try:
        record = await documents_service.get_document(document_id)
        path = await documents_service.get_docx_path(document_id)
    except DocumentNotFoundError as exc:
        raise _not_found(document_id) from exc
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{record.title}.docx",
    )


@router.post(
    "/{document_id}/onlyoffice/callback",
    response_model=dict,
    operation_id="save_onlyoffice_document",
)
async def save_onlyoffice_document(
    document_id: str,
    payload: OnlyOfficeCallback,
    request: Request,
):
    try:
        await documents_service.process_onlyoffice_callback(
            document_id,
            payload.model_dump(mode="json", exclude_none=True),
            request.headers.get("authorization"),
        )
        return {"error": 0}
    except DocumentNotFoundError as exc:
        raise _not_found(document_id) from exc
    except (OnlyOfficeSecurityError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post(
    "/{document_id}/iq/propose",
    response_model=dict,
    operation_id="propose_iq_document_edit",
)
async def propose_iq_document_edit(document_id: str, payload: IQCommandRequest):
    try:
        proposal = await documents_service.propose_iq_edit(document_id, payload)
        return {"proposal": proposal.model_dump(), "provider": "configured-model"}
    except DocumentNotFoundError as exc:
        raise _not_found(document_id) from exc
    except IQUnavailableError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@router.post(
    "/{document_id}/iq/apply",
    response_model=dict,
    operation_id="apply_iq_document_edit",
)
async def apply_iq_document_edit(document_id: str, payload: IQApplyRequest):
    try:
        record, count = await asyncio.to_thread(
            documents_service.document_store.replace_text,
            document_id,
            payload.original,
            payload.replacement,
            replace_all=False,
            expected_version=payload.expected_version,
        )
    except DocumentNotFoundError as exc:
        raise _not_found(document_id) from exc
    except DocumentVersionConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    if count == 0:
        raise HTTPException(
            status_code=409,
            detail="The original text no longer exists; ask IQ for a fresh proposal",
        )
    return {"document": record.model_dump(mode="json"), "replacement_count": count}
