from sqlalchemy.orm import Session

from app.models.knowledge_base import KnowledgeBase


class KnowledgeBaseRepository:

    def __init__(self, db: Session):
        self.db = db

    def create(
        self,
        knowledge: KnowledgeBase,
    ) -> KnowledgeBase:

        self.db.add(knowledge)
        self.db.commit()
        self.db.refresh(knowledge)

        return knowledge

    def get_by_id(
        self,
        knowledge_id: int,
    ) -> KnowledgeBase | None:

        return (
            self.db.query(KnowledgeBase)
            .filter(KnowledgeBase.id == knowledge_id)
            .first()
        )

    def get_all(self, skip: int = 0, limit: int = 50):

        return (
            self.db.query(KnowledgeBase)
            .order_by(KnowledgeBase.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_for_user(self, user_id: int | None = None, is_admin: bool = False, skip: int = 0, limit: int = 50):
        if is_admin or user_id is None:
            return self.get_all(skip=skip, limit=limit)

        from sqlalchemy import or_
        from app.models.document import Document

        return (
            self.db.query(KnowledgeBase)
            .join(Document, KnowledgeBase.document_id == Document.id)
            .filter(or_(Document.uploaded_by == user_id, Document.uploaded_by == 1))
            .order_by(KnowledgeBase.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_by_document(
        self,
        document_id: int,
    ):

        return (
            self.db.query(KnowledgeBase)
            .filter(
                KnowledgeBase.document_id == document_id
            )
            .all()
        )

    def update(
        self,
        knowledge: KnowledgeBase,
    ) -> KnowledgeBase:

        self.db.commit()
        self.db.refresh(knowledge)

        return knowledge

    def delete(
        self,
        knowledge: KnowledgeBase,
    ):

        self.db.delete(knowledge)
        self.db.commit()