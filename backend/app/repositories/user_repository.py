from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.user import User


class UserRepository:

    def __init__(self, db: Session):
        self.db = db

    def get_user_by_email(self, email: str) -> User | None:
        if not email:
            return None
        cleaned_email = email.strip().lower()
        return (
            self.db.query(User)
            .filter(func.lower(User.email) == cleaned_email)
            .first()
        )

    def get_user_by_id(self, user_id: int) -> User | None:
        return (
            self.db.query(User)
            .filter(User.id == user_id)
            .first()
        )

    def create_user(self, user: User) -> User:
        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)
        return user

    def update_user(self, user: User) -> User:
        self.db.commit()
        self.db.refresh(user)
        return user

    def delete_user(self, user: User) -> None:
        self.db.delete(user)
        self.db.commit()

    def get_all_users(self) -> list[User]:
        return (
            self.db.query(User)
            .all()
        )