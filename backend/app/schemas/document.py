from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class DocumentCreate(BaseModel):
    description: Optional[str] = None
    document_type_id: int


class DocumentUpdate(BaseModel):
    description: Optional[str] = None
    document_type_id: Optional[int] = None


class DocumentPasteRequest(BaseModel):
    title: Optional[str] = None
    text: str
    category: Optional[str] = "text"
    description: Optional[str] = None


class DocumentResponse(BaseModel):
    id: int
    file_name: str
    original_file_name: str
    file_path: str
    file_size: int
    mime_type: str
    description: Optional[str]
    uploaded_at: datetime
    uploaded_by: int
    document_type_id: int

    class Config:
        from_attributes = True