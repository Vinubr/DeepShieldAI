from datetime import datetime

from pydantic import BaseModel


class KnowledgeBaseCreate(BaseModel):
    document_id: int
    vector_id: str
    embedding_model: str
    chunk_count: int
    index_status: str


class KnowledgeBaseUpdate(BaseModel):
    vector_id: str | None = None
    embedding_model: str | None = None
    chunk_count: int | None = None
    index_status: str | None = None


class KnowledgeBaseResponse(BaseModel):
    id: int
    document_id: int
    vector_id: str
    embedding_model: str
    chunk_count: int
    index_status: str
    created_at: datetime

    class Config:
        from_attributes = True


class KnowledgeBaseQuery(BaseModel):
    question: str
    top_k: int = 3