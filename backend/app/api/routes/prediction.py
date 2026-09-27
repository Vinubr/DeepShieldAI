from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.ml.base import ModelUnavailableError
from app.ml.registry import registry
from app.repositories.document_repository import DocumentRepository
from app.repositories.prediction_repository import PredictionRepository
from app.repositories.stats_repository import StatsRepository
from app.schemas.prediction import (
    PredictionCreate,
    PredictionResponse,
    PredictionStats,
    PredictionUpdate,
)
from app.services.prediction_service import PredictionService
from app.services.stats_service import StatsService

router = APIRouter()


def get_prediction_service(db: Session = Depends(get_db)) -> PredictionService:
    return PredictionService(
        PredictionRepository(db),
        DocumentRepository(db),
    )


def get_stats_service(db: Session = Depends(get_db)) -> StatsService:
    return StatsService(StatsRepository(db))


from app.dependencies.auth import get_current_active_user
from app.models.user import User

# ---------------------------------------------------------------------------
# NOTE ON ROUTE ORDER
# `/stats` and `/analyze/...` MUST be declared before `/{prediction_id}`.
# FastAPI matches routes top-to-bottom, so a `/{prediction_id}: int` declared
# first would try to parse the literal string "stats" as an integer and fail
# with a 422 before this handler is ever reached.
# ---------------------------------------------------------------------------


@router.get("/stats", response_model=PredictionStats)
def get_prediction_stats(
    days: int = Query(14, ge=1, le=90),
    current_user: User = Depends(get_current_active_user),
    service: StatsService = Depends(get_stats_service),
):
    """Aggregated dashboard figures, computed in SQL."""
    is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
    user_id = None if is_admin else current_user.id
    return service.get_dashboard_stats(days=days, user_id=user_id)


@router.get("/models", response_model=dict)
def get_model_status():
    """
    Report which detectors are loaded and which are not, and why.

    The frontend renders this directly, so an unavailable modality shows the
    real reason instead of a hardcoded "coming soon" label.
    """
    return registry.status()


@router.post("/analyze/{document_id}", response_model=PredictionResponse)
def analyze_document(
    document_id: int,
    current_user: User = Depends(get_current_active_user),
    service: PredictionService = Depends(get_prediction_service),
):
    """
    Run the detection model against an uploaded document.

    503 (not 501) when the relevant model is missing: the service itself is
    healthy, this one capability is not, and the client may reasonably retry
    after the operator installs the weights.
    """
    document = service.document_repository.get_document_by_id(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
    if not is_admin and document.uploaded_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Access denied to this document.",
        )

    try:
        return service.analyze_document(document_id)

    except ModelUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    except ValueError as exc:
        message = str(exc)
        code = 404 if message == "Document not found." else 400
        raise HTTPException(status_code=code, detail=message) from exc


@router.post("/", response_model=PredictionResponse)
def create_prediction(
    prediction: PredictionCreate,
    current_user: User = Depends(get_current_active_user),
    service: PredictionService = Depends(get_prediction_service),
):
    """
    Persist a prediction record directly.
    """
    try:
        return service.create_prediction(prediction)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/", response_model=list[PredictionResponse])
def get_all_predictions(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
    service: PredictionService = Depends(get_prediction_service),
):
    is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
    if is_admin:
        return service.get_all_predictions(skip, limit)
    return service.get_predictions_by_user(current_user.id, skip, limit)


@router.get("/document/{document_id}", response_model=list[PredictionResponse])
def get_predictions_by_document(
    document_id: int,
    current_user: User = Depends(get_current_active_user),
    service: PredictionService = Depends(get_prediction_service),
):
    document = service.document_repository.get_document_by_id(document_id)
    if document is None:
        raise HTTPException(status_code=404, detail="Document not found.")

    is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
    if not is_admin and document.uploaded_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Access denied to this document's predictions.",
        )

    return service.get_predictions_by_document(document_id)


@router.get("/{prediction_id}", response_model=PredictionResponse)
def get_prediction(
    prediction_id: int,
    current_user: User = Depends(get_current_active_user),
    service: PredictionService = Depends(get_prediction_service),
):
    try:
        prediction = service.get_prediction_by_id(prediction_id)
        is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
        if not is_admin and prediction.document and prediction.document.uploaded_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied to this prediction.",
            )
        return prediction
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.put("/{prediction_id}", response_model=PredictionResponse)
def update_prediction(
    prediction_id: int,
    updated_data: PredictionUpdate,
    service: PredictionService = Depends(get_prediction_service),
):
    try:
        return service.update_prediction(prediction_id, updated_data)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.delete("/{prediction_id}")
def delete_prediction(
    prediction_id: int,
    service: PredictionService = Depends(get_prediction_service),
):
    try:
        return service.delete_prediction(prediction_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
