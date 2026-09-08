from app.models.knowledge_base import KnowledgeBase
from rag.ingest import build_chunks
from rag.store import ChromaStore
from rag.sync import sync_knowledge_sources
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

        chunks = build_chunks(document.file_path, chunk_size=chunk_size)
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
        sync_knowledge_sources(
            settings.KNOWLEDGE_SOURCE_DIR,
            embedding_model=settings.RAG_EMBEDDING_MODEL,
            chunk_size=settings.RAG_CHUNK_SIZE,
        )
        return ChromaStore().query(question, top_k=top_k)

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

    def get_all(self, skip: int = 0, limit: int = 50):

        return self.repository.get_all(skip, limit)

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