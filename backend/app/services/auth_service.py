from sqlalchemy.orm import Session

from app.constants.roles import Roles
from app.models.role import Role
from app.models.user import User
from app.repositories.user_repository import UserRepository
from app.schemas.user import UserCreate, UserUpdate
from app.schemas.auth import LoginRequest
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token
)


class AuthService:

    def __init__(self, db: Session):
        self.db = db
        self.user_repository = UserRepository(db)

    def get_user_by_email(self, email: str):
        return self.user_repository.get_user_by_email(email)

    def _get_default_role(self) -> Role:
        """
        Resolve the default signup role by NAME, not by a hardcoded id.

        `role_id=3` happened to be "User" only because that is the order
        seed_roles.py inserts them in. Re-seed in a different order, or
        rebuild the table, and every new signup silently becomes an Admin.
        """
        role = (
            self.db.query(Role)
            .filter(Role.role_name == Roles.USER)
            .first()
        )

        if role is None:
            raise ValueError(
                "Default 'User' role is missing. "
                "Run `python -m scripts.seed_roles` before registering users."
            )

        return role

    def register_user(self, user_data: UserCreate, role_name: str | None = None):
        cleaned_email = str(user_data.email).strip().lower()

        # Check if email already exists
        existing_user = self.user_repository.get_user_by_email(
            cleaned_email
        )

        if existing_user:
            raise ValueError("Email already registered")

        if role_name:
            role = (
                self.db.query(Role)
                .filter(Role.role_name == role_name)
                .first()
            )
            if role is None:
                role = self._get_default_role()
        else:
            role = self._get_default_role()

        # Create new user
        new_user = User(
            full_name=user_data.full_name.strip(),
            email=cleaned_email,
            password_hash=hash_password(user_data.password),
            role_id=role.id,
            is_active=True,
        )

        return self.user_repository.create_user(new_user)

    def authenticate_user(self, login_data: LoginRequest):

        # Check if user exists
        user = self.user_repository.get_user_by_email(
            login_data.email
        )

        if not user:
            raise ValueError("Invalid email or password")

        # Verify password
        if not verify_password(
            login_data.password,
            user.password_hash
        ):
            raise ValueError("Invalid email or password")

        return user

    def login(self, login_data: LoginRequest):

        user = self.authenticate_user(login_data)

        access_token = create_access_token(
            subject=user.email
        )

        return {
            "access_token": access_token,
            "token_type": "bearer"
        }

    # ------------------------------------------------------ self-service

    def update_profile(self, user: User, data: UserUpdate) -> User:
        """
        Update the caller's own name and/or email.

        Only fields explicitly present in the request body are touched —
        `exclude_unset` is what makes this a PATCH rather than a PUT. Without
        it, omitting `email` would blank it out.
        """
        payload = data.model_dump(exclude_unset=True)

        new_email = payload.get("email")

        if new_email and new_email != user.email:
            clash = self.user_repository.get_user_by_email(new_email)

            if clash and clash.id != user.id:
                raise ValueError("That email is already registered.")

            user.email = new_email

        if payload.get("full_name"):
            user.full_name = payload["full_name"]

        return self.user_repository.update_user(user)

    def change_password(
        self,
        user: User,
        current_password: str,
        new_password: str,
    ) -> User:
        """
        Rotate the caller's password.

        The current password is re-verified even though the caller already
        holds a valid token: a token may have been lifted from an unattended
        machine, and knowing the existing password is the only proof that the
        person at the keyboard is the account owner.
        """
        if not verify_password(current_password, user.password_hash):
            raise ValueError("Current password is incorrect.")

        if verify_password(new_password, user.password_hash):
            raise ValueError(
                "New password must be different from the current one."
            )

        user.password_hash = hash_password(new_password)

        return self.user_repository.update_user(user)