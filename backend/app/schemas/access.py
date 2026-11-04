from typing import Literal
from pydantic import BaseModel, Field

Permission = Literal["assessment", "report", "decision"]


class ConsentCreate(BaseModel):
    """Only specific, explicit permissions can be granted."""
    scopes: list[Permission] = Field(min_length=1, max_length=3)
    expires_in_days: int = Field(default=30, ge=1, le=90)


class GrantCreate(BaseModel):
    assessment_id: str = Field(min_length=36, max_length=36)
    consent_id: str = Field(min_length=36, max_length=36)
    lender_id: str = Field(min_length=36, max_length=36)
    scopes: list[Permission] = Field(min_length=1, max_length=3)
    expires_in_days: int = Field(default=7, ge=1, le=30)
