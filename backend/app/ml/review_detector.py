import time
from pathlib import Path

import torch

from app.core.logging import get_logger
from app.ml.base import BaseDetector, DetectionResult, ModelUnavailableError
from app.ml.text_preprocessing import load_text

logger = get_logger(__name__)

#: CONFIRMED from Review_Model_Training.ipynb — tokenised with
#: max_length=256, truncation=True, dynamic padding (DataCollatorWithPadding)
#: rather than a fixed max_length pad.
MAX_LENGTH = 256


class ReviewDetector(BaseDetector):
    """
    DistilBERT fine-tuned to classify a written review as computer-generated
    (fake) vs. organic (genuine).

    Trained from `distilbert-base-uncased`, per `Review_Model_Training.ipynb`.
    Same design as Audio/Text: the label mapping (`id2label`) is read from
    the checkpoint's own `config.json` rather than hardcoded, since
    `transformers` persists it automatically at save time.

    Text input is handled identically to `TextDetector` — same
    `text_preprocessing.load_text()` (plain-text extensions only: .txt,
    .csv, .json, .xml; see that module's docstring for why .pdf/.doc/.docx
    are deliberately excluded even though the upload layer accepts them).
    The one inference-time difference from Text is tokenisation padding:
    training used dynamic padding (`DataCollatorWithPadding`), so a single
    request here is tokenised with `padding=True` (pad to that input's own
    length) rather than `padding="max_length"`, to match training as
    closely as possible.

    KNOWN LIMITATION, NOT A BUG — recorded here so it isn't rediscovered the
    hard way during a demo: on held-out data (n=6,063) this model scores
    F1 0.973, the most statistically trustworthy number in the project. But
    the training notebook's own ad-hoc examples show it misclassifies
    obviously spammy, hand-written reviews ("Amazing amazing amazing best
    product ever...") as genuine with high confidence. It has learned this
    dataset's specific machine-generated style, not "fake review" as a
    general concept — worth disclosing if an examiner types their own
    example into the demo. See docs/MODELS.md, section 3.
    """

    modality = "Review"

    def __init__(
        self,
        weights_path: str,
        max_length: int = MAX_LENGTH,
        device: str = "cpu",
    ):
        self.weights_path = weights_path
        self.max_length = max_length

        requested_device = device if (device != "cuda" or torch.cuda.is_available()) else "cpu"
        self.device = torch.device(requested_device)

        self._model = None
        self._tokenizer = None
        self._id2label: dict[int, str] = {}
        self._name = "distilbert_deepshield_review"
        self._load_error: str | None = None

    # ------------------------------------------------------------ contract
    @property
    def model_name(self) -> str:
        return self._name

    @property
    def is_ready(self) -> bool:
        return self._model is not None

    @property
    def underlying_model(self):
        """Read-only access for xai/shap_explainer.py — see that module."""
        return self._model

    @property
    def tokenizer(self):
        """Read-only access for xai/shap_explainer.py — see that module."""
        return self._tokenizer

    @property
    def labels(self) -> dict[int, str]:
        """Read-only access for xai/shap_explainer.py — see that module."""
        return self._id2label

    def load(self) -> None:
        """Load the fine-tuned checkpoint once, at startup."""
        path = Path(self.weights_path)

        if not path.exists():
            self._load_error = f"Weights directory not found at {path}"
            logger.warning("ReviewDetector: %s", self._load_error)
            return

        if path.is_dir() and not any(path.iterdir()):
            self._load_error = f"Weights directory is empty at {path}"
            logger.warning("ReviewDetector: %s", self._load_error)
            return

        try:
            from transformers import (
                AutoModelForSequenceClassification,
                AutoTokenizer,
            )
        except ImportError:
            self._load_error = (
                "transformers/torch are not installed. "
                "Install requirements/ml.txt to enable review inference."
            )
            logger.warning("ReviewDetector: %s", self._load_error)
            return

        try:
            self._tokenizer = AutoTokenizer.from_pretrained(str(path))
            self._model = AutoModelForSequenceClassification.from_pretrained(str(path))
            self._model.to(self.device)
            self._model.eval()
        except Exception as exc:  # noqa: BLE001 - surfaced via /models
            self._load_error = f"{type(exc).__name__}: {exc}"
            logger.exception("ReviewDetector failed to load %s", path)
            self._model = None
            self._tokenizer = None
            return

        self._id2label = {
            int(idx): label for idx, label in self._model.config.id2label.items()
        }

        logger.info(
            "ReviewDetector ready — %s (%s params, device=%s, id2label=%s)",
            self._name,
            f"{sum(p.numel() for p in self._model.parameters()):,}",
            self.device,
            self._id2label,
        )

    # ------------------------------------------------------------ inference
    def predict(self, file_path: str) -> DetectionResult:
        if self._model is None or self._tokenizer is None:
            raise ModelUnavailableError(
                self._load_error or "Review model is not loaded."
            )

        started = time.perf_counter()

        tokens = self._tokenizer(text, return_tensors="pt", add_special_tokens=True)
        input_ids = tokens["input_ids"][0]
        total_tokens = len(input_ids)

        if total_tokens <= self.max_length:
            inputs = self._tokenizer(
                text,
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=self.max_length,
            )
            inputs = {key: value.to(self.device) for key, value in inputs.items()}

            with torch.no_grad():
                logits = self._model(**inputs).logits
                probs = torch.softmax(logits, dim=-1)[0]
        else:
            # Multi-window sliding evaluation for comprehensive review coverage
            step = max(32, self.max_length // 2)
            windows_ids = []
            windows_mask = []
            for start_idx in range(0, min(total_tokens, self.max_length * 8), step):
                chunk_ids = input_ids[start_idx : start_idx + self.max_length]
                if len(chunk_ids) < self.max_length:
                    pad_len = self.max_length - len(chunk_ids)
                    mask = torch.cat([torch.ones(len(chunk_ids), dtype=torch.long), torch.zeros(pad_len, dtype=torch.long)])
                    chunk_ids = torch.cat([chunk_ids, torch.full((pad_len,), self._tokenizer.pad_token_id or 0, dtype=torch.long)])
                else:
                    mask = torch.ones(self.max_length, dtype=torch.long)
                windows_ids.append(chunk_ids)
                windows_mask.append(mask)
                if start_idx + self.max_length >= total_tokens:
                    break

            batched_inputs = {
                "input_ids": torch.stack(windows_ids).to(self.device),
                "attention_mask": torch.stack(windows_mask).to(self.device),
            }
            with torch.no_grad():
                all_logits = self._model(**batched_inputs).logits
                all_probs = torch.softmax(all_logits, dim=-1)
                probs = torch.mean(all_probs, dim=0)

        predicted_id = int(torch.argmax(probs).item())
        raw_label = self._id2label.get(predicted_id, str(predicted_id))
        confidence = float(probs[predicted_id])

        # Map CG (Computer-Generated) -> "Fake", OR (Original) -> "Genuine"
        label_map = {"CG": "Fake", "OR": "Genuine"}
        label = label_map.get(raw_label.upper(), raw_label)

        probabilities = {
            label_map.get(self._id2label.get(i, str(i)).upper(), self._id2label.get(i, str(i))): round(float(p), 6)
            for i, p in enumerate(probs)
        }

        return DetectionResult(
            label=label,
            confidence=confidence,
            probabilities=probabilities,
            model_name=self._name,
            processing_time=time.perf_counter() - started,
            metadata={
                "max_length": self.max_length,
                "device": str(self.device),
                "characters_read": len(text),
                "raw_label": raw_label,
            },
        )

    def describe(self) -> dict:
        payload = super().describe()
        payload.update(
            {
                "weights_path": self.weights_path,
                "max_length": self.max_length,
                "labels": list(self._id2label.values()) or None,
                "error": self._load_error,
            }
        )
        return payload
