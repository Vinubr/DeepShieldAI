import mimetypes
from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

import re
import uuid
from datetime import datetime, timezone

from app.constants.roles import Roles
from app.db.session import get_db
from app.dependencies.auth import get_current_active_user
from app.models.document import Document
from app.models.user import User
from app.repositories.document_repository import DocumentRepository
from app.repositories.document_type_repository import DocumentTypeRepository
from app.schemas.document import (
    DocumentPasteRequest,
    DocumentResponse,
    DocumentUpdate,
)
from app.services.document_service import DocumentService

router = APIRouter()


@router.post(
    "/upload",
    response_model=DocumentResponse,
)
def upload_document(
    file: UploadFile = File(...),
    description: Annotated[str | None, Form()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    service = DocumentService(db)

    try:
        return service.upload_document(
            file=file,
            description=description,
            current_user=current_user,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


@router.get(
    "/",
    response_model=list[DocumentResponse],
)
def get_all_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    service = DocumentService(db)
    is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
    if is_admin:
        return service.get_all_documents(skip, limit)
    return service.get_documents_by_user(current_user.id, skip, limit)


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
)
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    service = DocumentService(db)

    try:
        document = service.get_document_by_id(document_id)
        is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
        if not is_admin and document.uploaded_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied to this document.",
            )
        return document

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.patch(
    "/{document_id}",
    response_model=DocumentResponse,
)
def update_document(
    document_id: int,
    updated_data: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    service = DocumentService(db)

    try:
        document = service.get_document_by_id(document_id)
        if not document:
            raise HTTPException(
                status_code=404,
                detail="Document not found.",
            )
        is_admin = bool(current_user.role and current_user.role.role_name in (Roles.ADMIN, Roles.ANALYST))
        if not is_admin and document.uploaded_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied to this document.",
            )
        return service.update_document(
            document_id,
            updated_data,
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


@router.delete("/{document_id}")
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    service = DocumentService(db)

    try:
        document = service.get_document_by_id(document_id)
        if not document:
            raise HTTPException(
                status_code=404,
                detail="Document not found.",
            )
        is_admin = bool(current_user.role and current_user.role.role_name in (Roles.ADMIN, Roles.ANALYST))
        if not is_admin and document.uploaded_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied to this document.",
            )
        return service.delete_document(
            document_id
        )

    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.get("/{document_id}/file")
def get_document_file(
    document_id: int,
    download: bool = Query(False, description="Set true to force download attachment"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Stream/serve the raw document file directly to the browser with inline
    or attachment disposition. Allows previewing and opening of images,
    audio, videos, and documents directly.
    """
    service = DocumentService(db)
    try:
        document = service.get_document_by_id(document_id)
        is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
        if not is_admin and document.uploaded_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied to this document.",
            )

        file_path = Path(document.file_path)
        if not file_path.is_absolute() and not file_path.exists():
            backend_dir = Path(__file__).resolve().parents[3]
            alt_path = backend_dir / file_path
            if alt_path.exists():
                file_path = alt_path

        if not file_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"File not found on server: {document.original_file_name}",
            )

        media_type = (
            document.mime_type
            or mimetypes.guess_type(document.original_file_name)[0]
            or "application/octet-stream"
        )
        disposition = "attachment" if download else "inline"

        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=document.original_file_name,
            content_disposition_type=disposition,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.get("/{document_id}/content")
def get_document_text_content(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Retrieve plain text or extracted content of a text/review document for inline rendering.
    """
    service = DocumentService(db)
    try:
        document = service.get_document_by_id(document_id)
        is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
        if not is_admin and document.uploaded_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied to this document.",
            )

        file_path = Path(document.file_path)
        if not file_path.is_absolute() and not file_path.exists():
            backend_dir = Path(__file__).resolve().parents[3]
            alt_path = backend_dir / file_path
            if alt_path.exists():
                file_path = alt_path

        if not file_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"File not found on server: {document.original_file_name}",
            )

        try:
            from app.ml.text_preprocessing import load_text
            content = load_text(str(file_path))
        except Exception as exc:
            suffix = file_path.suffix.lower()
            if suffix in {".pdf", ".docx", ".doc"}:
                raise HTTPException(
                    status_code=422,
                    detail=f"Cannot extract text from {document.original_file_name}: {exc}",
                )
            try:
                content = file_path.read_text(encoding="utf-8", errors="replace")
            except Exception as read_err:
                raise HTTPException(status_code=400, detail=f"Cannot decode text content: {read_err}")

        return {
            "id": document.id,
            "original_file_name": document.original_file_name,
            "content": content,
            "length": len(content),
            "mime_type": document.mime_type,
        }

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.post(
    "/paste",
    response_model=DocumentResponse,
)
def paste_document_text(
    payload: DocumentPasteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Ingest directly pasted text as a document for detection (supports news/article or review).
    """
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Pasted text cannot be empty.")

    title = (payload.title or "").strip()
    if not title:
        words = text.split()[:4]
        slug = "_".join(re.sub(r"[^a-zA-Z0-9]+", "", w) for w in words if w)
        if len(slug) >= 3:
            title = f"pasted_{slug}"
        else:
            title = f"pasted_text_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}"

    if not title.lower().endswith(".txt"):
        title += ".txt"

    unique_name = f"{uuid.uuid4()}.txt"
    upload_dir = Path("uploads/text")
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / unique_name
    file_path.write_text(text, encoding="utf-8")

    file_size = file_path.stat().st_size

    category = (payload.category or "text").lower()
    type_name = "Review" if category == "review" else "Text"

    doc_type_repo = DocumentTypeRepository(db)
    doc_type = doc_type_repo.get_document_type_by_name(type_name)
    if doc_type is None:
        doc_type = doc_type_repo.get_document_type_by_name("Text")

    doc_repo = DocumentRepository(db)
    document = Document(
        file_name=unique_name,
        original_file_name=title,
        file_path=str(file_path),
        file_size=file_size,
        mime_type="text/plain",
        description=payload.description or "Pasted text content",
        uploaded_by=current_user.id,
        document_type_id=doc_type.id if doc_type else 4,
    )
    return doc_repo.create_document(document)