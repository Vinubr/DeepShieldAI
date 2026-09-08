from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.document_repository import (
    DocumentRepository,
)
from app.repositories.knowledge_base_repository import (
    KnowledgeBaseRepository,
)
from app.schemas.knowledge_base import (
    KnowledgeBaseCreate,
    KnowledgeBaseQuery,
    KnowledgeBaseResponse,
    KnowledgeBaseUpdate,
)
from app.services.knowledge_base_service import (
    KnowledgeBaseService,
)
from app.core.config import settings
from rag.sync import sync_knowledge_sources

router = APIRouter()
CHROMA_PATH = Path(__file__).resolve().parents[3] / "storage" / "chroma"


@router.get("/status", response_model=dict)
def get_vector_store_status():
    try:
        import chromadb

        client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        collection = client.get_or_create_collection("deepshield_knowledge")
        return {
            "ready": True,
            "name": "ChromaDB",
            "chunks": collection.count(),
            "automatic_sources": True,
            "source_directory": settings.KNOWLEDGE_SOURCE_DIR,
        }
    except Exception as exc:  # noqa: BLE001 - surfaced to the UI
        return {
            "ready": False,
            "name": "ChromaDB",
            "error": str(exc),
        }


@router.post("/sync", response_model=dict)
def sync_sources():
    """Synchronize repository knowledge files without a document upload."""
    try:
        return sync_knowledge_sources(
            settings.KNOWLEDGE_SOURCE_DIR,
            embedding_model=settings.RAG_EMBEDDING_MODEL,
            chunk_size=settings.RAG_CHUNK_SIZE,
        )
    except (FileNotFoundError, RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


def get_knowledge_base_service(
    db: Session = Depends(get_db),
):
    repository = KnowledgeBaseRepository(db)
    document_repository = DocumentRepository(db)

    return KnowledgeBaseService(
        repository,
        document_repository,
    )


@router.post(
    "/",
    response_model=KnowledgeBaseResponse,
)
def create_knowledge(
    data: KnowledgeBaseCreate,
    service: KnowledgeBaseService = Depends(
        get_knowledge_base_service
    ),
):
    try:
        return service.create(data)

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


@router.post(
    "/ingest/{document_id}",
    response_model=KnowledgeBaseResponse,
)
def ingest_document(
    document_id: int,
    embedding_model: str = Query("all-MiniLM-L6-v2"),
    chunk_size: int = Query(800, ge=100, le=5000),
    service: KnowledgeBaseService = Depends(
        get_knowledge_base_service
    ),
):
    try:
        return service.ingest(document_id, embedding_model, chunk_size)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        ) from e


@router.post("/query", response_model=list[dict])
def query_knowledge(
    data: KnowledgeBaseQuery,
    service: KnowledgeBaseService = Depends(
        get_knowledge_base_service
    ),
):
    try:
        return service.query(data.question, data.top_k)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except RuntimeError as e:
        raise HTTPException(
            status_code=503,
            detail=str(e),
        ) from e


@router.get(
    "/",
    response_model=list[KnowledgeBaseResponse],
)
def get_all(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    service: KnowledgeBaseService = Depends(
        get_knowledge_base_service
    ),
):
    return service.get_all(skip, limit)


@router.get(
    "/{knowledge_id}",
    response_model=KnowledgeBaseResponse,
)
def get_by_id(
    knowledge_id: int,
    service: KnowledgeBaseService = Depends(
        get_knowledge_base_service
    ),
):
    try:
        return service.get_by_id(
            knowledge_id
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.get(
    "/document/{document_id}",
    response_model=list[KnowledgeBaseResponse],
)
def get_by_document(
    document_id: int,
    service: KnowledgeBaseService = Depends(
        get_knowledge_base_service
    ),
):
    return service.get_by_document(
        document_id
    )


@router.put(
    "/{knowledge_id}",
    response_model=KnowledgeBaseResponse,
)
def update(
    knowledge_id: int,
    updated_data: KnowledgeBaseUpdate,
    service: KnowledgeBaseService = Depends(
        get_knowledge_base_service
    ),
):
    try:
        return service.update(
            knowledge_id,
            updated_data,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.delete(
    "/{knowledge_id}",
)
def delete(
    knowledge_id: int,
    service: KnowledgeBaseService = Depends(
        get_knowledge_base_service
    ),
):
    try:
        return service.delete(
            knowledge_id
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )