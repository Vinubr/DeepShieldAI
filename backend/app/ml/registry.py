import threading

from app.core.config import settings
from app.core.logging import get_logger
from app.ml.audio_detector import AudioDetector
from app.ml.base import BaseDetector, ModelUnavailableError
from app.ml.image_detector import ImageDetector
from app.ml.review_detector import ReviewDetector
from app.ml.text_detector import TextDetector
from app.ml.video_detector import VideoDetector

logger = get_logger(__name__)


class ModelRegistry:
    """
    Process-wide singleton holding every loaded detector.

    Weights are read from disk exactly once, at application startup. Loading
    per request would add seconds to every call and exhaust RAM under any
    concurrency at all.

    Double-checked locking guards the instance because Uvicorn's startup and
    a first inbound request can race on a cold worker.
    """

    _instance: "ModelRegistry | None" = None
    _lock = threading.Lock()

    def __new__(cls) -> "ModelRegistry":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    instance = super().__new__(cls)
                    instance._detectors = {}
                    instance._loaded = False
                    cls._instance = instance
        return cls._instance

    # ------------------------------------------------------------- lifecycle
    def load_all(self) -> None:
        if self._loaded:
            return

        image = ImageDetector(
            weights_path=settings.IMAGE_MODEL_PATH,
            input_size=settings.IMAGE_INPUT_SIZE,
            preprocess_mode=settings.IMAGE_PREPROCESS_MODE,
            positive_label=settings.IMAGE_POSITIVE_LABEL,
            negative_label=settings.IMAGE_NEGATIVE_LABEL,
            threshold=settings.IMAGE_DECISION_THRESHOLD,
        )
        image.load()

        audio = AudioDetector(
            weights_path=settings.AUDIO_MODEL_PATH,
            sample_rate=settings.AUDIO_SAMPLE_RATE,
            num_samples=int(settings.AUDIO_SAMPLE_RATE * settings.AUDIO_MAX_SECONDS),
            device=settings.INFERENCE_DEVICE,
        )
        audio.load()

        video = VideoDetector(
            weights_path=settings.VIDEO_MODEL_PATH,
            class_names_path=settings.VIDEO_CLASS_NAMES_PATH,
            num_frames=settings.VIDEO_NUM_FRAMES,
            frame_size=settings.VIDEO_FRAME_SIZE,
            device=settings.INFERENCE_DEVICE,
            threshold=settings.VIDEO_DECISION_THRESHOLD,
        )
        video.load()

        text = TextDetector(
            weights_path=settings.TEXT_MODEL_PATH,
            max_length=settings.TEXT_MAX_LENGTH,
            device=settings.INFERENCE_DEVICE,
        )
        text.load()

        review = ReviewDetector(
            weights_path=settings.REVIEW_MODEL_PATH,
            max_length=settings.REVIEW_MAX_LENGTH,
            device=settings.INFERENCE_DEVICE,
        )
        review.load()

        self._detectors = {
            "Image": image,
            "Audio": audio,
            "Video": video,
            "Text": text,
            "Review": review,
        }
        self._loaded = True

        ready = [k for k, d in self._detectors.items() if d.is_ready]
        missing = [k for k, d in self._detectors.items() if not d.is_ready]
        logger.info(
            "Model registry loaded — ready: %s | unavailable: %s",
            ready or "none",
            missing or "none",
        )

    # --------------------------------------------------------------- access
    def get_detector(self, document_type: str) -> BaseDetector:
        if not self._loaded:
            raise ModelUnavailableError(
                "Model registry was never loaded. Check application startup."
            )

        detector = self._detectors.get(document_type)

        if detector is None:
            raise ModelUnavailableError(
                f"No detector is registered for '{document_type}' content. "
                f"Available: {', '.join(self._detectors) or 'none'}."
            )

        if not detector.is_ready:
            raise ModelUnavailableError(
                detector.describe().get("error")
                or f"The {document_type} detector is not loaded."
            )

        return detector

    def status(self) -> dict:
        """Registry snapshot for the /predictions/models endpoint."""
        detectors = [d.describe() for d in self._detectors.values()]

        return {
            "loaded": self._loaded,
            "detectors": detectors,
            "ready_count": sum(1 for d in detectors if d["ready"]),
        }


registry = ModelRegistry()
