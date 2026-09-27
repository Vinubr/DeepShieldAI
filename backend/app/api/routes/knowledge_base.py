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
from app.dependencies.auth import get_current_active_user
from app.models.user import User
from rag.sync import sync_knowledge_sources

router = APIRouter()
CHROMA_PATH = Path(__file__).resolve().parents[3] / "storage" / "chroma"


@router.get("/status", response_model=dict)
def get_vector_store_status():
    try:
        import chromadb

        client = chromadb.PersistentClient(path=str(CHROMA_PATH))
        collection = client.get_or_create_collection("deepshield_knowledge")
        grok_configured = bool(
            getattr(settings, "GROK_API_KEY", "")
            or getattr(settings, "XAI_API_KEY", "")
        )
        return {
            "ready": True,
            "name": "ChromaDB",
            "chunks": collection.count(),
            "automatic_sources": True,
            "source_directory": settings.KNOWLEDGE_SOURCE_DIR,
            "grok_enabled": grok_configured,
            "llm_model": getattr(settings, "GROK_MODEL", "grok-2-latest") if grok_configured else "Local Extractive",
        }
    except Exception as exc:  # noqa: BLE001 - surfaced to the UI
        return {
            "ready": False,
            "name": "ChromaDB",
            "error": str(exc),
        }


def get_knowledge_base_service(
    db: Session = Depends(get_db),
):
    repository = KnowledgeBaseRepository(db)
    document_repository = DocumentRepository(db)

    return KnowledgeBaseService(
        repository,
        document_repository,
    )


@router.post("/sync", response_model=dict)
def sync_sources(
    service: KnowledgeBaseService = Depends(get_knowledge_base_service),
):
    """Synchronize repository knowledge files into ChromaDB and PostgreSQL."""
    try:
        return service.sync_system_sources()
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
    current_user: User = Depends(get_current_active_user),
    service: KnowledgeBaseService = Depends(
        get_knowledge_base_service
    ),
):
    doc = service.document_repository.get_document_by_id(document_id)
    if doc is None:
        raise HTTPException(status_code=404, detail="Document not found.")
    is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
    if not is_admin and doc.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied to ingest this document.")
    try:
        return service.ingest(document_id, embedding_model, chunk_size)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        ) from e


@router.post("/query", response_model=dict)
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


@router.get(
    "/",
    response_model=list[KnowledgeBaseResponse],
)
def get_all(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
    service: KnowledgeBaseService = Depends(
        get_knowledge_base_service
    ),
):
    is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
    return service.get_all(skip, limit, user_id=current_user.id, is_admin=is_admin)


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
    current_user: User = Depends(get_current_active_user),
    service: KnowledgeBaseService = Depends(
        get_knowledge_base_service
    ),
):
    entry = service.repository.get_by_id(knowledge_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Knowledge Base entry not found.")
    is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
    if not is_admin and entry.document and entry.document.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied to delete this entry.")
    try:
        return service.delete(
            knowledge_id
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )