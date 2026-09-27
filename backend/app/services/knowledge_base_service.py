from pathlib import Path
from app.models.knowledge_base import KnowledgeBase
from rag.ingest import build_chunks
from rag.store import ChromaStore
from rag.sync import sync_knowledge_sources, source_id
from rag.query import RAGQueryEngine
from app.core.config import settings
from app.repositories.document_repository import (
    DocumentRepository,
)
from app.repositories.knowledge_base_repository import (
    KnowledgeBaseRepository,
)
from app.schemas.knowledge_base import (
    KnowledgeBaseCreate,
    KnowledgeBaseUpdate,
)


class KnowledgeBaseService:

    def __init__(
        self,
        repository: KnowledgeBaseRepository,
        document_repository: DocumentRepository,
    ):
        self.repository = repository
        self.document_repository = document_repository

    def _resolve_source_dir(self) -> Path:
        source_dir = Path(settings.KNOWLEDGE_SOURCE_DIR)
        if not source_dir.exists():
            candidates = [
                Path("knowledge-sources"),
                Path(__file__).resolve().parents[2] / "knowledge-sources",
                Path(__file__).resolve().parents[3] / "knowledge-sources",
            ]
            for cand in candidates:
                if cand.exists():
                    return cand
        return source_dir

    def sync_system_sources(self, user_id: int = 1):
        """Synchronize repository markdown/pdf knowledge files into both ChromaDB and PostgreSQL."""
        source_dir = self._resolve_source_dir()
        if not source_dir.exists():
            return {"status": "skipped", "reason": f"Directory not found: {source_dir}"}

        # 1. Sync ChromaDB vector store
        sync_result = sync_knowledge_sources(
            source_dir,
            embedding_model=settings.RAG_EMBEDDING_MODEL,
            chunk_size=settings.RAG_CHUNK_SIZE,
        )

        # 2. Sync into PostgreSQL Document & KnowledgeBase tables so they appear in Registered Entries
        from app.models.document import Document
        from app.models.document_type import DocumentType
        from app.models.user import User

        db = self.document_repository.db
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            user = db.query(User).first()
        effective_user_id = user.id if user else 1

        doc_type = db.query(DocumentType).filter(DocumentType.type_name == "Text").first()
        doc_type_id = doc_type.id if doc_type else 1

        paths = sorted(
            p for p in source_dir.rglob("*")
            if p.is_file() and p.suffix.lower() in [".md", ".txt", ".pdf", ".docx"]
        )

        for path in paths:
            doc = (
                db.query(Document)
                .filter(Document.original_file_name == path.name)
                .first()
            )
            if not doc:
                doc = Document(
                    file_name=path.name,
                    original_file_name=path.name,
                    file_path=str(path.resolve()),
                    file_size=path.stat().st_size,
                    mime_type="text/markdown" if path.suffix == ".md" else "text/plain",
                    description=f"System Knowledge Base document: {path.name}",
                    uploaded_by=effective_user_id,
                    document_type_id=doc_type_id,
                )
                db.add(doc)
                db.commit()
                db.refresh(doc)

            kb_entry = (
                db.query(KnowledgeBase)
                .filter(KnowledgeBase.document_id == doc.id)
                .first()
            )
            if not kb_entry:
                chunks = build_chunks(str(path), chunk_size=settings.RAG_CHUNK_SIZE)
                kb_entry = KnowledgeBase(
                    document_id=doc.id,
                    vector_id=source_id(path),
                    embedding_model=settings.RAG_EMBEDDING_MODEL,
                    chunk_count=len(chunks),
                    index_status="Indexed",
                )
                db.add(kb_entry)
                db.commit()
                db.refresh(kb_entry)

        return sync_result

    def create(
        self,
        data: KnowledgeBaseCreate,
    ):

        document = (
            self.document_repository.get_document_by_id(
                data.document_id
            )
        )

        if document is None:
            raise ValueError(
                "Document not found."
            )

        knowledge = KnowledgeBase(
            document_id=data.document_id,
            vector_id=data.vector_id,
            embedding_model=data.embedding_model,
            chunk_count=data.chunk_count,
            index_status=data.index_status,
        )

        return self.repository.create(
            knowledge
        )

    def ingest(
        self,
        document_id: int,
        embedding_model: str = "all-MiniLM-L6-v2",
        chunk_size: int = 800,
    ):
        document = self.document_repository.get_document_by_id(document_id)

        if document is None:
            raise ValueError("Document not found.")

        file_path = Path(document.file_path)
        if not file_path.exists():
            candidates = [
                Path("backend") / file_path,
                Path(__file__).resolve().parents[2] / file_path,
                Path(__file__).resolve().parents[3] / file_path,
            ]
            for cand in candidates:
                if cand.exists():
                    file_path = cand
                    break

        if not file_path.exists():
            raise ValueError(f"File not found on disk: {document.file_path}")

        chunks = build_chunks(str(file_path), chunk_size=chunk_size)
        if not chunks:
            raise ValueError("The document did not contain extractable text.")

        vector_store = ChromaStore(embedding_model=embedding_model)
        chunk_count = vector_store.add_chunks(
            chunks,
            document_id=document.id,
            source_filename=document.original_file_name,
        )

        existing = self.repository.get_by_document(document.id)
        knowledge = existing[0] if existing else KnowledgeBase(
            document_id=document.id,
            vector_id=f"doc-{document.id}",
            embedding_model=embedding_model,
            chunk_count=chunk_count,
            index_status="Indexed",
        )

        if existing:
            knowledge.vector_id = f"doc-{document.id}"
            knowledge.embedding_model = embedding_model
            knowledge.chunk_count = chunk_count
            knowledge.index_status = "Indexed"
            return self.repository.update(knowledge)

        return self.repository.create(knowledge)

    def query(self, question: str, top_k: int = 5):
        store = ChromaStore()
        if store.count() == 0:
            self.sync_system_sources()
        return RAGQueryEngine(store=store).query(question, top_k=top_k)

    def get_by_id(
        self,
        knowledge_id: int,
    ):

        knowledge = self.repository.get_by_id(
            knowledge_id
        )

        if knowledge is None:
            raise ValueError(
                "Knowledge Base entry not found."
            )

        return knowledge

    def get_all(
        self,
        skip: int = 0,
        limit: int = 50,
        user_id: int | None = None,
        is_admin: bool = False,
    ):
        return self.repository.get_for_user(
            user_id=user_id,
            is_admin=is_admin,
            skip=skip,
            limit=limit,
        )

    def get_by_document(
        self,
        document_id: int,
    ):

        return self.repository.get_by_document(
            document_id
        )

    def update(
        self,
        knowledge_id: int,
        updated_data: KnowledgeBaseUpdate,
    ):

        knowledge = self.repository.get_by_id(
            knowledge_id
        )

        if knowledge is None:
            raise ValueError(
                "Knowledge Base entry not found."
            )

        if updated_data.vector_id is not None:
            knowledge.vector_id = updated_data.vector_id

        if updated_data.embedding_model is not None:
            knowledge.embedding_model = updated_data.embedding_model

        if updated_data.chunk_count is not None:
            knowledge.chunk_count = updated_data.chunk_count

        if updated_data.index_status is not None:
            knowledge.index_status = updated_data.index_status

        return self.repository.update(
            knowledge
        )

    def delete(
        self,
        knowledge_id: int,
    ):

        knowledge = self.repository.get_by_id(
            knowledge_id
        )

        if knowledge is None:
            raise ValueError(
                "Knowledge Base entry not found."
            )

        self.repository.delete(
            knowledge
        )

        ChromaStore().delete_document(knowledge.document_id)

        return {
            "message": "Knowledge Base entry deleted successfully."
        }