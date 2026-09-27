import time
from pathlib import Path

import torch

from app.core.logging import get_logger
from app.ml.audio_preprocessing import (
    TARGET_NUM_SAMPLES,
    TARGET_SAMPLE_RATE,
    preprocess_file,
)
from app.ml.base import BaseDetector, DetectionResult, ModelUnavailableError

logger = get_logger(__name__)


class AudioDetector(BaseDetector):
    """
    wav2vec2-base fine-tuned for real/fake speech classification.

    Architecture, per Audio_Model_Training.ipynb:

        Wav2Vec2FeatureExtractor
          -> Wav2Vec2ForSequenceClassification
             (facebook/wav2vec2-base backbone, feature encoder frozen
             during fine-tuning; classification head trained)
          -> 2-way softmax

    Unlike the image model, the label mapping is not external configuration
    here. `Wav2Vec2ForSequenceClassification.from_pretrained` restores
    `config.id2label` from the checkpoint's own `config.json`, which
    `transformers` writes automatically at save time — reading it from the
    model instead of hardcoding it is what makes this detector immune to
    the polarity bug the image model had (see `image_detector.py`).
    """

    modality = "Audio"

    def __init__(
        self,
        weights_path: str,
        sample_rate: int = TARGET_SAMPLE_RATE,
        num_samples: int = TARGET_NUM_SAMPLES,
        device: str = "cpu",
    ):
        self.weights_path = weights_path
        self.sample_rate = sample_rate
        self.num_samples = num_samples

        # Fall back to CPU rather than raising if "cuda" was requested on a
        # machine without a GPU — the API should still boot.
        requested_device = device if (device != "cuda" or torch.cuda.is_available()) else "cpu"
        self.device = torch.device(requested_device)

        self._model = None
        self._feature_extractor = None
        self._id2label: dict[int, str] = {}
        self._name = "wav2vec2_deepshield_audio"
        self._load_error: str | None = None

    # ------------------------------------------------------------ contract
    @property
    def model_name(self) -> str:
        return self._name

    @property
    def is_ready(self) -> bool:
        return self._model is not None

    def load(self) -> None:
        """
        Load the fine-tuned checkpoint once, at startup.

        Same rationale as `ImageDetector.load()`: loading per request would
        add real latency — wav2vec2-base is ~95M parameters — and failures
        are captured rather than raised so a missing checkpoint cannot stop
        the whole API from booting. `/predictions/models` reports why.
        """
        path = Path(self.weights_path)

        if not path.exists():
            self._load_error = f"Weights directory not found at {path}"
            logger.warning("AudioDetector: %s", self._load_error)
            return

        if path.is_dir() and not any(path.iterdir()):
            self._load_error = f"Weights directory is empty at {path}"
            logger.warning("AudioDetector: %s", self._load_error)
            return

        try:
            # Imported lazily: the plain CRUD API should not need torch or
            # transformers just to serve auth/document endpoints.
            from transformers import (
                AutoFeatureExtractor,
                Wav2Vec2ForSequenceClassification,
            )
        except ImportError:
            self._load_error = (
                "transformers/torch are not installed. "
                "Install requirements/ml.txt to enable audio inference."
            )
            logger.warning("AudioDetector: %s", self._load_error)
            return

        try:
            self._feature_extractor = AutoFeatureExtractor.from_pretrained(str(path))
            self._model = Wav2Vec2ForSequenceClassification.from_pretrained(str(path))
            self._model.to(self.device)
            self._model.eval()
        except Exception as exc:  # noqa: BLE001 - surfaced via /models
            self._load_error = f"{type(exc).__name__}: {exc}"
            logger.exception("AudioDetector failed to load %s", path)
            self._model = None
            self._feature_extractor = None
            return

        self._id2label = {
            int(idx): label for idx, label in self._model.config.id2label.items()
        }

        logger.info(
            "AudioDetector ready — %s (%s params, device=%s, id2label=%s)",
            self._name,
            f"{sum(p.numel() for p in self._model.parameters()):,}",
            self.device,
            self._id2label,
        )

    # ------------------------------------------------------------ inference
    def predict(self, file_path: str) -> DetectionResult:
        if self._model is None or self._feature_extractor is None:
            raise ModelUnavailableError(
                self._load_error or "Audio model is not loaded."
            )

        started = time.perf_counter()

        from app.ml.audio_preprocessing import load_audio, fix_length
        full_waveform = load_audio(file_path, sample_rate=self.sample_rate)
        total_len = len(full_waveform)

        if total_len <= self.num_samples:
            waveform = fix_length(full_waveform, num_samples=self.num_samples)
            inputs = self._feature_extractor(
                waveform,
                sampling_rate=self.sample_rate,
                return_tensors="pt",
                padding="max_length",
                truncation=True,
                max_length=self.num_samples,
            )
            inputs = {key: value.to(self.device) for key, value in inputs.items()}

            with torch.no_grad():
                logits = self._model(**inputs).logits
                probs = torch.softmax(logits, dim=-1)[0]
        else:
            # Multi-segment temporal evaluation: sample start, middle, and end segments
            offsets = [
                0,
                max(0, (total_len - self.num_samples) // 2),
                max(0, total_len - self.num_samples),
            ]
            unique_offsets = sorted(set(offsets))
            windows = [
                fix_length(full_waveform[off : off + self.num_samples], num_samples=self.num_samples)
                for off in unique_offsets
            ]
            inputs = self._feature_extractor(
                windows,
                sampling_rate=self.sample_rate,
                return_tensors="pt",
                padding="max_length",
                truncation=True,
                max_length=self.num_samples,
            )
            inputs = {key: value.to(self.device) for key, value in inputs.items()}

            with torch.no_grad():
                all_logits = self._model(**inputs).logits
                all_probs = torch.softmax(all_logits, dim=-1)
                probs = torch.mean(all_probs, dim=0)

        predicted_id = int(torch.argmax(probs).item())
        label = self._id2label.get(predicted_id, str(predicted_id))
        confidence = float(probs[predicted_id])

        probabilities = {
            self._id2label.get(i, str(i)): round(float(p), 6)
            for i, p in enumerate(probs)
        }

        return DetectionResult(
            label=label,
            confidence=confidence,
            probabilities=probabilities,
            model_name=self._name,
            processing_time=time.perf_counter() - started,
            metadata={
                "sample_rate": self.sample_rate,
                "clip_seconds": self.num_samples / self.sample_rate,
                "device": str(self.device),
            },
        )

    def describe(self) -> dict:
        payload = super().describe()
        payload.update(
            {
                "weights_path": self.weights_path,
                "sample_rate": self.sample_rate,
                "clip_seconds": self.num_samples / self.sample_rate,
                "labels": list(self._id2label.values()) or None,
                "error": self._load_error,
            }
        )
        return payload
