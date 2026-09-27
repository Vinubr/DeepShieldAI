from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_active_user
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.user import (
    PasswordChangeRequest,
    UserCreate,
    UserMeResponse,
    UserResponse,
    UserUpdate,
)
from app.services.auth_service import AuthService

router = APIRouter()


def _to_me(user: User) -> UserMeResponse:
    """Serialise a User with its role name resolved."""
    return UserMeResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        role_id=user.role_id,
        role_name=user.role.role_name if user.role else "Unknown",
        is_active=user.is_active,
        created_at=user.created_at,
    )


from app.constants.roles import Roles
from app.dependencies.rbac import require_roles
from pydantic import BaseModel, EmailStr

class AdminUserCreate(BaseModel):
    full_name: str
    email: EmailStr
    password: str
    role_name: str = "User"


@router.post("/register", response_model=UserResponse)
def register(
    user: UserCreate,
    db: Session = Depends(get_db),
):
    service = AuthService(db)

    try:
        return service.register_user(user)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/users", response_model=UserResponse)
def create_user_by_admin(
    payload: AdminUserCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles(Roles.ADMIN)),
):
    """
    Provision a new user account by an administrator without logging out.
    """
    service = AuthService(db)

    try:
        return service.register_user(
            UserCreate(
                full_name=payload.full_name,
                email=payload.email,
                password=payload.password,
            ),
            role_name=payload.role_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/users", response_model=list[UserMeResponse])
def list_users(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles(Roles.ADMIN)),
):
    """
    List all registered user accounts (Admin only).
    """
    users = db.query(User).all()
    return [_to_me(u) for u in users]


@router.post("/login", response_model=TokenResponse)
def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db),
):
    service = AuthService(db)

    try:
        return service.login(login_data)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


@router.get("/me", response_model=UserMeResponse)
def read_current_user(
    current_user: User = Depends(get_current_active_user),
):
    """
    Return the authenticated user's own profile.

    The JWT deliberately carries nothing but `sub` and `exp` — a token is
    signed, not encrypted, so identity details must never live inside it.
    The frontend therefore calls this endpoint once after login to learn who
    it is talking to and which role badge to render.
    """
    return _to_me(current_user)


@router.patch("/me", response_model=UserMeResponse)
def update_current_user(
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update the caller's own name and/or email."""
    service = AuthService(db)

    try:
        updated = service.update_profile(current_user, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return _to_me(updated)


@router.post("/change-password", response_model=dict)
def change_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Rotate the caller's password.

    NOTE: the existing access token stays valid until it expires. Proper
    token revocation needs a denylist or short-lived tokens plus refresh
    rotation — deliberately out of scope here, and worth stating as a known
    limitation rather than pretending the session is invalidated.
    """
    service = AuthService(db)

    try:
        service.change_password(
            current_user,
            payload.current_password,
            payload.new_password,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {"message": "Password updated successfully."}
