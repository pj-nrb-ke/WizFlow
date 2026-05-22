from pydantic import BaseModel, Field


class AiDraftRequest(BaseModel):
    description: str = Field(min_length=10, max_length=4000)


class AiRefineRequest(BaseModel):
    instruction: str = Field(min_length=3, max_length=2000)
    current_draft: dict = Field(default_factory=dict)


class AiSaveRequest(BaseModel):
    description: str = ""
    draft: dict


class AiDraftResponse(BaseModel):
    draft: dict
    explanation: str
    gaps: list[str] = Field(default_factory=list)
    source: str = "template"
