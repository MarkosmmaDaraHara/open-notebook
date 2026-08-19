from datetime import datetime

from pydantic import BaseModel, Field


class DocumentResponse(BaseModel):
    id: str
    title: str
    file_type: str
    html: str
    version: int
    created_at: datetime
    updated_at: datetime
    word_count: int


class DocumentCreateRequest(BaseModel):
    title: str = Field(default="Untitled document", min_length=1, max_length=160)
    initial_html: str | None = Field(default=None, max_length=2_000_000)
    initial_text: str | None = Field(default=None, max_length=1_000_000)


class DocumentUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=160)
    html: str | None = Field(default=None, max_length=2_000_000)
    expected_version: int | None = Field(default=None, ge=1)


class ReplaceTextRequest(BaseModel):
    find: str = Field(min_length=1, max_length=100_000)
    replacement: str = Field(max_length=100_000)
    replace_all: bool = False
    expected_version: int | None = Field(default=None, ge=1)


class IQCommandRequest(BaseModel):
    instruction: str = Field(min_length=1, max_length=4_000)
    selected_text: str = Field(default="", max_length=100_000)
    document_text: str | None = Field(default=None, max_length=1_000_000)


class IQApplyRequest(BaseModel):
    original: str = Field(min_length=1, max_length=100_000)
    replacement: str = Field(max_length=100_000)
    expected_version: int | None = Field(default=None, ge=1)


class OnlyOfficeCallback(BaseModel):
    status: int
    key: str | None = None
    url: str | None = None
    token: str | None = None
    filetype: str | None = None
    users: list[str] | None = None

    model_config = {"extra": "allow"}
