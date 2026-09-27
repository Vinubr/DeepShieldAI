from sqlalchemy.orm import Session

from app.models.document import Document


class DocumentRepository:

    def __init__(self, db: Session):
        self.db = db

    def create_document(
        self,
        document: Document
    ) -> Document:

        self.db.add(document)
        self.db.commit()
        self.db.refresh(document)

        return document

    def get_document_by_id(
        self,
        document_id: int
    ) -> Document | None:

        return (
            self.db.query(Document)
            .filter(Document.id == document_id)
            .first()
        )

    def get_all_documents(self, skip: int = 0, limit: int = 50):

        return (
            self.db.query(Document)
            .order_by(Document.uploaded_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_documents_by_user(
        self,
        user_id: int,
        skip: int = 0,
        limit: int = 50,
    ):

        return (
            self.db.query(Document)
            .filter(Document.uploaded_by == user_id)
            .order_by(Document.uploaded_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def update_document(
        self,
        document: Document
    ) -> Document:

        self.db.commit()
        self.db.refresh(document)

        return document

    def delete_document(
        self,
        document: Document
    ) -> None:

        self.db.delete(document)
        self.db.commit()