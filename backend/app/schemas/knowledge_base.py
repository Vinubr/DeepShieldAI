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


class RAGQueryRequest(BaseModel):
    query: str
    top_k: int = 5
    document_id: int | None = None


class RAGCitation(BaseModel):
    document_id: int | None = None
    chunk_index: int | None = None
    text: str
    score: float


class RAGQueryResponse(BaseModel):
    query: str
    answer: str
    citations: list[RAGCitation]
    total_results: int