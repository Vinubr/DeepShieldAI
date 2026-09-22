from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.prediction_repository import (
    PredictionRepository,
)
from app.repositories.review_analysis_repository import (
    ReviewAnalysisRepository,
)
from app.schemas.review_analysis import (
    ReviewAnalysisCreate,
    ReviewAnalysisResponse,
    ReviewAnalysisUpdate,
)
from app.services.review_analysis_service import (
    ReviewAnalysisService,
)

router = APIRouter()


def get_review_analysis_service(
    db: Session = Depends(get_db),
):
    repository = ReviewAnalysisRepository(db)
    prediction_repository = PredictionRepository(db)

    return ReviewAnalysisService(
        repository,
        prediction_repository,
    )


@router.post(
    "/",
    response_model=ReviewAnalysisResponse,
)
def create_review_analysis(
    data: ReviewAnalysisCreate,
    service: ReviewAnalysisService = Depends(
        get_review_analysis_service
    ),
):
    try:
        return service.create_review_analysis(data)

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


@router.post(
    "/generate/{prediction_id}",
    response_model=ReviewAnalysisResponse,
)
def generate_review_analysis(
    prediction_id: int,
    service: ReviewAnalysisService = Depends(get_review_analysis_service),
):
    """Run automated forensic review analysis on a prediction."""
    try:
        return service.generate_review_analysis(prediction_id)
    except ValueError as e:
        raise HTTPException(
            status_code=404 if "not found" in str(e).lower() else 400,
            detail=str(e),
        )


@router.get(
    "/",
    response_model=list[ReviewAnalysisResponse],
)
def get_all_review_analyses(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    service: ReviewAnalysisService = Depends(
        get_review_analysis_service
    ),
):
    return service.get_all_review_analyses(skip, limit)


@router.get(
    "/{review_id}",
    response_model=ReviewAnalysisResponse,
)
def get_review_analysis(
    review_id: int,
    service: ReviewAnalysisService = Depends(
        get_review_analysis_service
    ),
):
    try:
        return service.get_review_analysis_by_id(
            review_id
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.get(
    "/prediction/{prediction_id}",
    response_model=list[ReviewAnalysisResponse],
)
def get_reviews_by_prediction(
    prediction_id: int,
    service: ReviewAnalysisService = Depends(
        get_review_analysis_service
    ),
):
    return service.get_by_prediction(
        prediction_id
    )


@router.put(
    "/{review_id}",
    response_model=ReviewAnalysisResponse,
)
def update_review_analysis(
    review_id: int,
    updated_data: ReviewAnalysisUpdate,
    service: ReviewAnalysisService = Depends(
        get_review_analysis_service
    ),
):
    try:
        return service.update_review_analysis(
            review_id,
            updated_data,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.delete(
    "/{review_id}",
)
def delete_review_analysis(
    review_id: int,
    service: ReviewAnalysisService = Depends(
        get_review_analysis_service
    ),
):
    try:
        return service.delete_review_analysis(
            review_id
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )