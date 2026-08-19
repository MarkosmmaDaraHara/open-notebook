from zipfile import ZipFile

import pytest

from open_notebook.documents.onlyoffice import (
    OnlyOfficeSecurityError,
    OnlyOfficeService,
    OnlyOfficeSettings,
)
from open_notebook.documents.store import (
    DocumentVersionConflictError,
    LocalDocumentStore,
)


def test_document_round_trip_and_safe_html(tmp_path):
    store = LocalDocumentStore(tmp_path)
    record = store.create_document(
        "Launch / plan",
        initial_html=(
            '<h1>Launch</h1><p onclick="bad()">Hello <strong>team</strong>'
            "<script>alert(1)</script></p>"
        ),
    )

    assert record.title == "Launch plan"
    assert "script" not in record.html
    assert "onclick" not in record.html
    assert record.word_count == 3

    with ZipFile(store.docx_path(record.id)) as archive:
        assert "word/document.xml" in archive.namelist()

    updated, count = store.replace_text(
        record.id,
        "Hello",
        "Welcome",
        expected_version=record.version,
    )
    assert count == 1
    assert updated.version == 2
    assert "Welcome" in updated.html
    assert store.list_documents("welcome")[0].id == record.id


def test_optimistic_version_prevents_lost_updates(tmp_path):
    store = LocalDocumentStore(tmp_path)
    record = store.create_document("Versioned", initial_text="First")
    store.update_document(record.id, content_html="<p>Second</p>", expected_version=1)

    with pytest.raises(DocumentVersionConflictError):
        store.update_document(record.id, content_html="<p>Stale</p>", expected_version=1)


def test_onlyoffice_config_uses_signed_short_lived_file_url(tmp_path):
    record = LocalDocumentStore(tmp_path).create_document("Signed")
    service = OnlyOfficeService(
        OnlyOfficeSettings(
            browser_url="https://office.example.test",
            public_api_url="https://iq.example.test",
            jwt_secret="test-secret",
            callback_hosts=frozenset({"office.example.test"}),
            allow_unsigned_urls=False,
        )
    )

    response = service.build_editor_config(record, user_id="person@example.test")
    document_url = response["config"]["document"]["url"]
    access_token = document_url.split("access_token=", 1)[1]

    service.verify_file_access_token(record.id, access_token)
    assert "token" in response["config"]
    assert response["config"]["editorConfig"]["callbackUrl"].endswith(
        f"/{record.id}/onlyoffice/callback"
    )

    with pytest.raises(OnlyOfficeSecurityError):
        service.verify_file_access_token("00000000-0000-0000-0000-000000000000", access_token)
