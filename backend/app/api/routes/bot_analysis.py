from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.bot_analysis_repository import (
    BotAnalysisRepository,
)
from app.repositories.prediction_repository import (
    PredictionRepository,
)
from app.schemas.bot_analysis import (
    BotAnalysisCreate,
    BotAnalysisResponse,
    BotAnalysisUpdate,
)
from app.services.bot_analysis_service import (
    BotAnalysisService,
)

router = APIRouter()


def get_bot_analysis_service(
    db: Session = Depends(get_db),
):
    bot_repository = BotAnalysisRepository(db)
    prediction_repository = PredictionRepository(db)

    return BotAnalysisService(
        bot_repository,
        prediction_repository,
    )


@router.post(
    "/",
    response_model=BotAnalysisResponse,
)
def create_bot_analysis(
    data: BotAnalysisCreate,
    service: BotAnalysisService = Depends(
        get_bot_analysis_service
    ),
):
    try:
        return service.create_bot_analysis(data)

    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=str(e),
        )


@router.post(
    "/generate/{prediction_id}",
    response_model=BotAnalysisResponse,
)
def generate_bot_analysis(
    prediction_id: int,
    question: str | None = Query(None, description="Optional custom forensic query"),
    service: BotAnalysisService = Depends(get_bot_analysis_service),
):
    """Run automated bot behavioral/artifact assessment on a prediction."""
    try:
        return service.generate_bot_analysis(prediction_id, question)
    except ValueError as e:
        raise HTTPException(
            status_code=404 if "not found" in str(e).lower() else 400,
            detail=str(e),
        )


@router.get(
    "/",
    response_model=list[BotAnalysisResponse],
)
def get_all_bot_analyses(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    service: BotAnalysisService = Depends(
        get_bot_analysis_service
    ),
):
    return service.get_all_bot_analyses(skip, limit)


@router.get(
    "/{analysis_id}",
    response_model=BotAnalysisResponse,
)
def get_bot_analysis(
    analysis_id: int,
    service: BotAnalysisService = Depends(
        get_bot_analysis_service
    ),
):
    try:
        return service.get_bot_analysis_by_id(
            analysis_id
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.get(
    "/prediction/{prediction_id}",
    response_model=list[BotAnalysisResponse],
)
def get_by_prediction(
    prediction_id: int,
    service: BotAnalysisService = Depends(
        get_bot_analysis_service
    ),
):
    return service.get_by_prediction(
        prediction_id
    )


@router.put(
    "/{analysis_id}",
    response_model=BotAnalysisResponse,
)
def update_bot_analysis(
    analysis_id: int,
    updated_data: BotAnalysisUpdate,
    service: BotAnalysisService = Depends(
        get_bot_analysis_service
    ),
):
    try:
        return service.update_bot_analysis(
            analysis_id,
            updated_data,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )


@router.delete(
    "/{analysis_id}",
)
def delete_bot_analysis(
    analysis_id: int,
    service: BotAnalysisService = Depends(
        get_bot_analysis_service
    ),
):
    try:
        return service.delete_bot_analysis(
            analysis_id
        )

    except ValueError as e:
        raise HTTPException(
            status_code=404,
            detail=str(e),
        )