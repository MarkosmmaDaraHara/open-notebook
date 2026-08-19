from __future__ import annotations

import hashlib
import os
import time
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
import jwt

from open_notebook.documents.store import DocumentRecord


class OnlyOfficeConfigurationError(RuntimeError):
    """Raised when the external office engine is not configured."""


class OnlyOfficeSecurityError(RuntimeError):
    """Raised when an ONLYOFFICE callback or download fails validation."""


@dataclass(frozen=True)
class OnlyOfficeSettings:
    browser_url: str
    public_api_url: str
    jwt_secret: str | None
    callback_hosts: frozenset[str]
    allow_unsigned_urls: bool

    @classmethod
    def from_environment(cls) -> "OnlyOfficeSettings":
        browser_url = os.environ.get("ONLYOFFICE_DOCUMENT_SERVER_URL", "").rstrip("/")
        public_api_url = os.environ.get("IQ_PUBLIC_API_URL", "").rstrip("/")
        jwt_secret = os.environ.get("ONLYOFFICE_JWT_SECRET") or None
        configured_hosts = {
            item.strip().casefold()
            for item in os.environ.get("ONLYOFFICE_CALLBACK_HOSTS", "").split(",")
            if item.strip()
        }
        parsed_host = urlparse(browser_url).hostname
        if parsed_host:
            configured_hosts.add(parsed_host.casefold())
        allow_unsigned = os.environ.get(
            "IQ_ALLOW_UNSIGNED_DOCUMENT_URLS", "false"
        ).casefold() in {"1", "true", "yes"}
        return cls(
            browser_url=browser_url,
            public_api_url=public_api_url,
            jwt_secret=jwt_secret,
            callback_hosts=frozenset(configured_hosts),
            allow_unsigned_urls=allow_unsigned,
        )

    @property
    def enabled(self) -> bool:
        return bool(self.browser_url and self.public_api_url)


class OnlyOfficeService:
    def __init__(self, settings: OnlyOfficeSettings | None = None):
        self.settings = settings or OnlyOfficeSettings.from_environment()

    def build_editor_config(
        self,
        record: DocumentRecord,
        *,
        user_id: str = "chat-iq-user",
        user_name: str = "Chat IQ user",
    ) -> dict:
        if not self.settings.enabled:
            raise OnlyOfficeConfigurationError(
                "Set ONLYOFFICE_DOCUMENT_SERVER_URL and IQ_PUBLIC_API_URL first"
            )

        access_token = self.create_file_access_token(record.id)
        file_url = f"{self.settings.public_api_url}/api/documents/{record.id}/file"
        if access_token:
            file_url = f"{file_url}?access_token={access_token}"

        callback_url = f"{self.settings.public_api_url}/api/documents/{record.id}/onlyoffice/callback"
        anonymized_user = hashlib.sha256(user_id.encode("utf-8")).hexdigest()[:32]
        config: dict = {
            "documentType": "word",
            "type": "desktop",
            "width": "100%",
            "height": "100%",
            "document": {
                "fileType": "docx",
                "key": self.document_key(record),
                "title": f"{record.title}.docx",
                "url": file_url,
                "permissions": {
                    "chat": True,
                    "comment": True,
                    "copy": True,
                    "download": True,
                    "edit": True,
                    "print": True,
                    "review": True,
                },
            },
            "editorConfig": {
                "callbackUrl": callback_url,
                "lang": "en",
                "region": "en-US",
                "mode": "edit",
                "coEditing": {"mode": "fast", "change": True},
                "user": {"id": anonymized_user, "name": user_name[:128]},
                "customization": {
                    "autosave": True,
                    "comments": True,
                    "compactHeader": False,
                    "forcesave": True,
                    "help": True,
                    "toolbarNoTabs": False,
                    "unit": "inch",
                },
            },
        }
        if self.settings.jwt_secret:
            config["token"] = jwt.encode(
                config, self.settings.jwt_secret, algorithm="HS256"
            )
        return {
            "document_server_url": self.settings.browser_url,
            "config": config,
        }

    @staticmethod
    def document_key(record: DocumentRecord) -> str:
        raw = f"{record.id}:{record.version}".encode("utf-8")
        return hashlib.sha256(raw).hexdigest()[:32]

    def create_file_access_token(self, document_id: str) -> str | None:
        if not self.settings.jwt_secret:
            if self.settings.allow_unsigned_urls:
                return None
            raise OnlyOfficeConfigurationError(
                "ONLYOFFICE_JWT_SECRET is required unless unsigned local URLs are explicitly enabled"
            )
        now = int(time.time())
        return jwt.encode(
            {
                "sub": document_id,
                "aud": "chat-iq-document-download",
                "iat": now,
                "exp": now + 300,
            },
            self.settings.jwt_secret,
            algorithm="HS256",
        )

    def verify_file_access_token(self, document_id: str, token: str | None) -> None:
        if not self.settings.jwt_secret:
            if self.settings.allow_unsigned_urls:
                return
            raise OnlyOfficeSecurityError("Unsigned document downloads are disabled")
        if not token:
            raise OnlyOfficeSecurityError("Missing document access token")
        try:
            claims = jwt.decode(
                token,
                self.settings.jwt_secret,
                algorithms=["HS256"],
                audience="chat-iq-document-download",
            )
        except jwt.PyJWTError as exc:
            raise OnlyOfficeSecurityError("Invalid document access token") from exc
        if claims.get("sub") != document_id:
            raise OnlyOfficeSecurityError("Document access token does not match")

    def verify_callback_token(
        self, payload: dict, authorization_header: str | None = None
    ) -> None:
        if not self.settings.jwt_secret:
            if self.settings.allow_unsigned_urls:
                return
            raise OnlyOfficeSecurityError("Unsigned ONLYOFFICE callbacks are disabled")

        token = payload.get("token")
        if not token and authorization_header:
            scheme, _, credentials = authorization_header.partition(" ")
            if scheme.casefold() == "bearer":
                token = credentials
        if not token:
            raise OnlyOfficeSecurityError("Missing ONLYOFFICE callback token")
        try:
            jwt.decode(
                token,
                self.settings.jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        except jwt.PyJWTError as exc:
            raise OnlyOfficeSecurityError("Invalid ONLYOFFICE callback token") from exc

    def _validate_download_url(self, url: str) -> None:
        parsed = urlparse(url)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname:
            raise OnlyOfficeSecurityError("ONLYOFFICE returned an invalid download URL")
        if parsed.hostname.casefold() not in self.settings.callback_hosts:
            raise OnlyOfficeSecurityError(
                "ONLYOFFICE callback download host is not allowlisted"
            )

    async def download_saved_document(self, url: str) -> bytes:
        current_url = url
        async with httpx.AsyncClient(timeout=45, follow_redirects=False) as client:
            for _ in range(4):
                self._validate_download_url(current_url)
                response = await client.get(current_url)
                if response.is_redirect:
                    location = response.headers.get("location")
                    if not location:
                        raise OnlyOfficeSecurityError("Invalid ONLYOFFICE redirect")
                    current_url = str(response.url.join(location))
                    continue
                response.raise_for_status()
                if len(response.content) > 50 * 1024 * 1024:
                    raise OnlyOfficeSecurityError(
                        "Saved document exceeds the 50 MB limit"
                    )
                return response.content
        raise OnlyOfficeSecurityError("Too many redirects from ONLYOFFICE")
