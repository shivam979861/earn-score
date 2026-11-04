from typing import Literal
from pydantic import BaseModel, EmailStr, Field

Role = Literal["worker", "lender", "admin"]


class RegisterInput(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=160)
    password: str = Field(min_length=10, max_length=128)


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: Role
    is_active: bool
    model_config = {"from_attributes": True}


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: Role
    expires_in: int


class AdminCreateUserInput(RegisterInput):
    role: Literal["lender", "admin"]


class UserStatusInput(BaseModel):
    is_active: bool


class ChangePasswordInput(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=128)
