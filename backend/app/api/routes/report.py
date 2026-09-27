from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Query,
)
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.dependencies.auth import get_current_active_user
from app.models.user import User
from app.repositories.prediction_repository import (
    PredictionRepository,
)
from app.repositories.report_repository import (
    ReportRepository,
)
from app.schemas.report import (
    ReportCreate,
    ReportResponse,
    ReportUpdate,
)
from app.services.report_service import (
    ReportService,
)

router = APIRouter()


def get_report_service(
    db: Session = Depends(get_db),
):
    report_repository = ReportRepository(db)
    prediction_repository = PredictionRepository(db)

    return ReportService(
        report_repository,
        prediction_repository,
    )


@router.post(
    "/",
    response_model=ReportResponse,
)
def create_report(
    report: ReportCreate,
    current_user: User = Depends(get_current_active_user),
    service: ReportService = Depends(
        get_report_service
    ),
):
    prediction = service.prediction_repository.get_prediction_by_id(report.prediction_id)
    if prediction is None:
        raise HTTPException(status_code=404, detail="Prediction not found.")
    is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
    if not is_admin and prediction.document and prediction.document.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied.")
    try:
        return service.create_report(report)
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


@router.post(
    "/generate/{prediction_id}",
    response_model=ReportResponse,
)
def generate_report(
    prediction_id: int,
    current_user: User = Depends(get_current_active_user),
    service: ReportService = Depends(get_report_service),
):
    """Auto-generate a structured forensic assessment report for a prediction."""
    prediction = service.prediction_repository.get_prediction_by_id(prediction_id)
    if prediction is None:
        raise HTTPException(status_code=404, detail="Prediction not found.")

    is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
    if not is_admin and prediction.document and prediction.document.uploaded_by != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied to this prediction.")

    try:
        return service.generate_report(prediction_id)
    except ValueError as e:
        raise HTTPException(
            status_code=404 if "not found" in str(e).lower() else 400,
            detail=str(e),
        )


@router.get(
    "/",
    response_model=list[ReportResponse],
)
def get_all_reports(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_active_user),
    service: ReportService = Depends(
        get_report_service
    ),
):
    is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
    user_id = None if is_admin else current_user.id
    return service.get_all_reports(skip, limit, user_id=user_id)


@router.get(
    "/{report_id}",
    response_model=ReportResponse,
)
def get_report(
    report_id: int,
    current_user: User = Depends(get_current_active_user),
    service: ReportService = Depends(
        get_report_service
    ),
):
    try:
        report = service.get_report_by_id(report_id)
        is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
        if not is_admin and report.prediction and report.prediction.document and report.prediction.document.uploaded_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied to this report.",
            )
        return report

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.get(
    "/prediction/{prediction_id}",
    response_model=list[ReportResponse],
)
def get_reports_by_prediction(
    prediction_id: int,
    current_user: User = Depends(get_current_active_user),
    service: ReportService = Depends(
        get_report_service
    ),
):
    prediction = service.prediction_repository.get_prediction_by_id(prediction_id)
    if prediction is None:
        raise HTTPException(status_code=404, detail="Prediction not found.")

    is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
    if not is_admin and prediction.document and prediction.document.uploaded_by != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="Access denied to this prediction's reports.",
        )

    return service.get_reports_by_prediction(
        prediction_id
    )


@router.put(
    "/{report_id}",
    response_model=ReportResponse,
)
def update_report(
    report_id: int,
    updated_data: ReportUpdate,
    current_user: User = Depends(get_current_active_user),
    service: ReportService = Depends(
        get_report_service
    ),
):
    try:
        report = service.get_report_by_id(report_id)
        is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
        if not is_admin and report.prediction and report.prediction.document and report.prediction.document.uploaded_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied to update this report.",
            )
        return service.update_report(
            report_id,
            updated_data,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.delete(
    "/{report_id}",
)
def delete_report(
    report_id: int,
    current_user: User = Depends(get_current_active_user),
    service: ReportService = Depends(
        get_report_service
    ),
):
    try:
        report = service.get_report_by_id(report_id)
        is_admin = bool(current_user.role and current_user.role.role_name == "Admin")
        if not is_admin and report.prediction and report.prediction.document and report.prediction.document.uploaded_by != current_user.id:
            raise HTTPException(
                status_code=403,
                detail="Access denied to delete this report.",
            )
        return service.delete_report(
            report_id
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )