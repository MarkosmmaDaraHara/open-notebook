from io import BytesIO
from zipfile import ZipFile

from fastapi import FastAPI
from fastapi.testclient import TestClient

from api import documents_service
from api.auth import PasswordAuthMiddleware
from api.routers import documents
from open_notebook.documents.store import LocalDocumentStore


def test_document_rest_crud_and_docx_export(tmp_path, monkeypatch):
    monkeypatch.setattr(documents_service, "document_store", LocalDocumentStore(tmp_path))
    app = FastAPI()
    app.include_router(documents.router, prefix="/api")
    client = TestClient(app)

    created = client.post(
        "/api/documents",
        json={"title": "API document", "initial_html": "<p>Hello</p>"},
    )
    assert created.status_code == 201
    record = created.json()

    updated = client.patch(
        f"/api/documents/{record['id']}",
        json={"html": "<p>Hello API</p>", "expected_version": record["version"]},
    )
    assert updated.status_code == 200
    assert updated.json()["version"] == 2

    stale = client.patch(
        f"/api/documents/{record['id']}",
        json={"html": "<p>Stale edit</p>", "expected_version": 1},
    )
    assert stale.status_code == 409

    exported = client.get(f"/api/documents/{record['id']}/export")
    assert exported.status_code == 200
    with ZipFile(BytesIO(exported.content)) as archive:
        assert "word/document.xml" in archive.namelist()


def test_onlyoffice_machine_routes_bypass_app_password(monkeypatch):
    monkeypatch.setenv("OPEN_NOTEBOOK_PASSWORD", "app-password")
    app = FastAPI()

    @app.get("/private")
    async def private():
        return {"ok": True}

    @app.get("/api/documents/{document_id}/file")
    async def machine_file(document_id: str):
        return {"id": document_id}

    app.add_middleware(PasswordAuthMiddleware)
    client = TestClient(app)
    document_id = "11111111-1111-4111-8111-111111111111"

    assert client.get("/private").status_code == 401
    assert client.get(f"/api/documents/{document_id}/file").status_code == 200
