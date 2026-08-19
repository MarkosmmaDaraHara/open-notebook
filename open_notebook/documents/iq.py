from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field

from open_notebook.ai.provision import provision_langchain_model


class IQUnavailableError(RuntimeError):
    """Raised when no configured language model can run the IQ request."""


class IQEditProposal(BaseModel):
    original: str = Field(description="The exact text that should be replaced")
    replacement: str = Field(description="The proposed replacement text")
    summary: str = Field(description="A short description of the edit")
    rationale: str = Field(description="Why this edit improves the document")
    confidence: float = Field(ge=0, le=1)


SYSTEM_PROMPT = """You are IQ, the editing agent inside Chat IQ Documents.
Return one precise, reviewable edit. Preserve facts, numbers, names, citations, and the writer's intent. Do not invent information. The `original` field must be copied exactly from the supplied selection or document excerpt so the change can be applied safely. Keep the replacement in the same language unless the user explicitly asks for translation. Prefer the smallest edit that fully satisfies the request."""


async def create_iq_edit_proposal(
    *,
    instruction: str,
    selected_text: str,
    document_text: str,
) -> IQEditProposal:
    target = selected_text.strip() or document_text.strip()[:8000]
    if not target:
        raise ValueError("The document does not contain editable text")
    if not instruction.strip():
        raise ValueError("instruction must not be empty")

    try:
        model = await provision_langchain_model(
            content=f"{instruction}\n{target}",
            default_type="transformation",
            temperature=0.2,
        )
        structured_model = model.with_structured_output(IQEditProposal)
        result = await structured_model.ainvoke(
            [
                SystemMessage(content=SYSTEM_PROMPT),
                HumanMessage(
                    content=(
                        f"Instruction:\n{instruction.strip()}\n\n"
                        f"Exact selected text or document excerpt:\n{target}"
                    )
                ),
            ]
        )
        return IQEditProposal.model_validate(result)
    except Exception as exc:
        raise IQUnavailableError(
            "IQ could not reach the configured language model"
        ) from exc
