import json

from app.core.logging import get_logger
from app.ml.base import ModelUnavailableError
from app.ml.registry import registry
from app.models.explanation import Explanation
from app.repositories.explanation_repository import ExplanationRepository
from app.repositories.prediction_repository import PredictionRepository
from xai import audio_shap, gradcam, lime_explainer, shap_explainer

logger = get_logger(__name__)

#: Which explanation methods are meaningful for which modality.
SUPPORTED_METHODS: dict[str, set[str]] = {
    "gradcam": {"Image", "Video", "Audio"},
    "shap": {"Image", "Video", "Audio", "Text", "Review"},
    "lime": {"Image", "Video", "Audio", "Text", "Review"},
}


class ExplanationService:

    def __init__(
        self,
        repository: ExplanationRepository,
        prediction_repository: PredictionRepository,
    ):
        self.repository = repository
        self.prediction_repository = prediction_repository

    def generate_explanation(
        self,
        prediction_id: int,
        method: str,
    ) -> Explanation:

        if method not in SUPPORTED_METHODS:
            raise ValueError(
                f"Unknown explanation method '{method}'. "
                f"Available: {', '.join(SUPPORTED_METHODS)}."
            )

        prediction = self.prediction_repository.get_prediction_by_id(
            prediction_id
        )

        if prediction is None:
            raise ValueError("Prediction not found.")

        document = prediction.document
        modality = document.document_type.type_name

        if modality not in SUPPORTED_METHODS[method]:
            raise ValueError(
                f"'{method}' is not available for {modality} predictions. "
                f"It currently supports: {', '.join(SUPPORTED_METHODS[method])}."
            )

        detector = registry.get_detector(modality)

        if method == "gradcam":
            if modality == "Video":
                result = gradcam.generate_video(
                    detector=detector,
                    file_path=document.file_path,
                )
            elif modality == "Audio":
                result = gradcam.generate_audio(
                    detector=detector,
                    file_path=document.file_path,
                )
            else:  # Image
                result = gradcam.generate(
                    model=detector.underlying_model,
                    file_path=document.file_path,
                    input_size=detector.input_size,
                    preprocess_mode=detector.preprocess_mode,
                )

        elif method == "lime":
            result = lime_explainer.generate(
                detector=detector,
                file_path=document.file_path,
                modality=modality,
            )

        elif method == "shap":
            if modality == "Image":
                result = shap_explainer.generate_image(
                    detector=detector,
                    file_path=document.file_path,
                )
            elif modality == "Video":
                result = shap_explainer.generate_video(
                    detector=detector,
                    file_path=document.file_path,
                )
            elif modality == "Audio":
                result = audio_shap.generate(
                    detector=detector,
                    file_path=document.file_path,
                )
            else:  # Text / Review
                result = shap_explainer.generate(
                    detector=detector,
                    file_path=document.file_path,
                )

        artifact = (
            result["artifact"]
            if result["artifact_type"] == "image"
            else json.dumps(result["artifact"])
        )

        explanation = Explanation(
            prediction_id=prediction_id,
            method=result["method"],
            artifact_type=result["artifact_type"],
            artifact=artifact,
            model_name=detector.model_name,
        )

        logger.info(
            "Explanation generated — prediction=%s method=%s modality=%s",
            prediction_id,
            method,
            modality,
        )

        return self.repository.create_explanation(explanation)

    def get_by_prediction(
        self,
        prediction_id: int,
    ):
        return self.repository.get_by_prediction(prediction_id)

    def get_explanation_by_id(
        self,
        explanation_id: int,
    ):
        explanation = self.repository.get_explanation_by_id(explanation_id)

        if explanation is None:
            raise ValueError("Explanation not found.")

        return explanation
