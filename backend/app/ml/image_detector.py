import os
import time
from pathlib import Path

from app.core.logging import get_logger
from app.ml.base import BaseDetector, DetectionResult, ModelUnavailableError
from app.ml.preprocessing import preprocess_file

logger = get_logger(__name__)


def compute_image_forensic_score(img) -> tuple[float, dict]:
    """
    Computes a forensic probability of an image being AI-generated / Deepfake
    based on physical sensor and generative diffusion/GAN telemetry:
    1. Color channel cross-correlation (absence of physical Bayer CFA demosaicing residuals)
    2. Laplacian high-frequency edge & noise variance
    3. Laplacian kurtosis (non-Gaussian diffusion noise schedule)
    4. FFT High-Frequency spectral energy ratio (azimuthal decay)
    """
    import numpy as np

    arr = np.array(img, dtype=np.float32)
    if len(arr.shape) == 2:
        arr = np.stack([arr] * 3, axis=-1)
    elif arr.shape[2] > 3:
        arr = arr[:, :, :3]

    gray = np.mean(arr, axis=2)
    h, w = gray.shape

    # 1. Color channel cross-correlation (absence of Bayer CFA demosaicing residuals)
    r_ch, g_ch, b_ch = arr[:, :, 0].flatten(), arr[:, :, 1].flatten(), arr[:, :, 2].flatten()
    std_r, std_g, std_b = np.std(r_ch), np.std(g_ch), np.std(b_ch)
    if std_r > 1e-4 and std_g > 1e-4 and std_b > 1e-4:
        rg = np.corrcoef(r_ch, g_ch)[0, 1]
        rb = np.corrcoef(r_ch, b_ch)[0, 1]
        gb = np.corrcoef(g_ch, b_ch)[0, 1]
        color_corr = float(np.clip((rg + rb + gb) / 3.0, 0.0, 1.0))
    else:
        # Synthetic flat or artificial grayscale/gradient pattern
        color_corr = 0.999

    # 2. Laplacian high-frequency gradient & noise variance
    from scipy.ndimage import laplace
    lap = laplace(gray)
    lap_var = float(np.var(lap))
    lap_std = float(np.std(lap))
    lap_kurt = float(np.mean(((lap - np.mean(lap)) / (lap_std + 1e-8)) ** 4)) if lap_std > 1e-4 else 3.0

    # 3. FFT High-Frequency Spectral Ratio
    f = np.fft.fft2(gray)
    fshift = np.fft.fftshift(f)
    magnitude = np.abs(fshift)
    cy, cx = h // 2, w // 2
    y, x = np.ogrid[:h, :w]
    r = np.sqrt((x - cx) ** 2 + (y - cy) ** 2)
    max_r = np.sqrt(cx ** 2 + cy ** 2)
    low_mask = r < (0.15 * max_r)
    high_mask = r > (0.35 * max_r)
    low_e = np.mean(magnitude[low_mask])
    high_e = np.mean(magnitude[high_mask])
    spec_ratio = float(high_e / (low_e + 1e-8))

    score_color = 0.0
    if color_corr > 0.985:
        score_color = 0.85 + 0.15 * min(1.0, (color_corr - 0.985) / 0.01)
    elif color_corr > 0.965:
        score_color = 0.50 + 0.35 * ((color_corr - 0.965) / 0.02)
    else:
        score_color = 0.10 + 0.30 * (color_corr / 0.965)

    score_lap = 0.0
    if lap_var > 600.0:
        score_lap = 0.80 + 0.20 * min(1.0, (lap_var - 600.0) / 400.0)
    elif lap_var < 50.0:
        score_lap = 0.70  # over-smoothed synthetic skin
    elif lap_kurt > 29.0:
        score_lap = 0.65 + 0.25 * min(1.0, (lap_kurt - 29.0) / 10.0)
    else:
        score_lap = 0.25

    score_spec = 0.0
    if spec_ratio > 0.040:
        score_spec = 0.75 + 0.25 * min(1.0, (spec_ratio - 0.040) / 0.015)
    elif spec_ratio < 0.015:
        score_spec = 0.70
    else:
        score_spec = 0.30

    forensic_prob = 0.45 * score_color + 0.35 * score_lap + 0.20 * score_spec

    telemetry = {
        "color_correlation": round(color_corr, 4),
        "laplacian_variance": round(lap_var, 2),
        "laplacian_kurtosis": round(lap_kurt, 2),
        "spectral_ratio": round(spec_ratio, 4),
        "forensic_probability": round(forensic_prob, 4),
    }
    return forensic_prob, telemetry


class ImageDetector(BaseDetector):
    """
    Keras/MobileNetV2 binary deepfake classifier.

    Architecture recovered from the trained artefact:

        Input(224, 224, 3)
          -> MobileNetV2 (imagenet backbone, include_top=False)
          -> GlobalAveragePooling2D
          -> Dropout -> Dense(128, relu) -> Dropout
          -> Dense(1, sigmoid)          # 2,750,277 params total

    A single sigmoid unit means the raw output is P(positive class). Which
    physical class is "positive" is NOT stored in the file — Keras discards
    the directory->index mapping — so `positive_label` is configuration.
    Get it wrong and every verdict is exactly inverted.

    KERAS BACKEND: this project's Python is 3.14, and `tensorflow-cpu` has
    no published wheel for it yet — installing it fails outright, not just
    slowly. Keras 3 was built to be backend-agnostic (TensorFlow, JAX, or
    PyTorch can all execute the same saved graph), and the `.keras` archive
    format stores weights in a backend-portable way specifically so this
    substitution is safe for standard architectures like MobileNetV2. Since
    `torch` is already a hard requirement for the Audio detector and DOES
    have Python 3.14 wheels, `load()` below selects the PyTorch backend for
    Keras instead of waiting on a TensorFlow wheel that may not land for
    months. `requirements/ml.txt` reflects this — no `tensorflow` install
    needed at all.
    """

    modality = "Image"

    def __init__(
        self,
        weights_path: str,
        input_size: int = 224,
        preprocess_mode: str = "mobilenet_v2",
        positive_label: str = "Deepfake",
        negative_label: str = "Genuine",
        threshold: float = 0.5,
    ):
        self.weights_path = weights_path
        self.input_size = input_size
        self.preprocess_mode = preprocess_mode
        self.positive_label = positive_label
        self.negative_label = negative_label
        self.threshold = threshold

        self._model = None
        self._name = "mobilenetv2_deepshield"
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
        """
        The raw loaded Keras model — exposed read-only for xai/gradcam.py,
        which needs to build a second functional model over the same
        layers (input -> last conv layer + input -> final output) to get
        at intermediate activations. Nothing outside app/ml and xai should
        need this; predict() below is still the real public contract.
        """
        return self._model

    def load(self) -> None:
        """
        Load the .keras archive once, at startup.

        Loading per request would add seconds of latency and blow up memory
        under any concurrency. Failures are captured rather than raised so a
        missing model file cannot stop the API from booting — the rest of the
        product still works, and /predictions/models reports why.
        """
        path = Path(self.weights_path)

        if not path.exists():
            self._load_error = f"Weights not found at {path}"
            logger.warning("ImageDetector: %s", self._load_error)
            return

        # Must be set before Keras is first imported anywhere in the
        # process — Keras reads KERAS_BACKEND at import time and cannot
        # switch backends afterward. setdefault() means an operator who DOES
        # have a working TensorFlow install (e.g. a different Python
        # version) can still override this via a real environment variable.
        os.environ.setdefault("KERAS_BACKEND", "torch")

        try:
            # Imported lazily: the API container should not need Keras at
            # all just to serve CRUD endpoints.
            import keras
        except ImportError:
            self._load_error = (
                "Keras is not installed. "
                "Install requirements/ml.txt to enable image inference."
            )
            logger.warning("ImageDetector: %s", self._load_error)
            return

        try:
            self._model = keras.saving.load_model(str(path), compile=False)
        except Exception as exc:  # noqa: BLE001 - surfaced via /models
            self._load_error = f"{type(exc).__name__}: {exc}"
            logger.exception("ImageDetector failed to load %s", path)
            return

        self._name = getattr(self._model, "name", self._name)
        logger.info(
            "ImageDetector ready — %s (%s params, %s preprocessing)",
            self._name,
            f"{self._model.count_params():,}",
            self.preprocess_mode,
        )

    # ------------------------------------------------------------ inference
    def predict(self, file_path: str) -> DetectionResult:
        if self._model is None:
            raise ModelUnavailableError(
                self._load_error or "Image model is not loaded."
            )

        started = time.perf_counter()

        import numpy as np
        from PIL import Image
        from app.ml.preprocessing import load_image, to_batch

        img = load_image(file_path)
        w, h = img.size

        # 1. Standard resized view
        b_std = to_batch(img, input_size=self.input_size, mode=self.preprocess_mode)

        # 2. Horizontal mirror flip view (invariant to face orientation)
        b_flip = to_batch(img.transpose(Image.FLIP_LEFT_RIGHT), input_size=self.input_size, mode=self.preprocess_mode)

        # 3. Square central crop view (preserves natural facial aspect ratio without squishing)
        min_dim = min(w, h)
        left = (w - min_dim) // 2
        top = (h - min_dim) // 2
        crop_img = img.crop((left, top, left + min_dim, top + min_dim))
        b_crop = to_batch(crop_img, input_size=self.input_size, mode=self.preprocess_mode)

        # Batched vectorized inference across all 3 views in a single call
        batch_3 = np.concatenate([b_std, b_flip, b_crop], axis=0)
        preds = self._model.predict(batch_3, verbose=0)

        raw_std = float(preds[0][0])
        raw_flip = float(preds[1][0])
        raw_crop = float(preds[2][0])

        # Ensembled probability from MobileNetV2 with TTA
        raw_cnn = 0.50 * raw_std + 0.25 * raw_flip + 0.25 * raw_crop

        # Multi-signal forensic analysis (CFA demosaicing, frequency spectrum, noise residual)
        forensic_prob, forensic_telemetry = compute_image_forensic_score(img)

        # Dual-engine fusion:
        # 1. If CNN backbone detects face-swap blending (raw_cnn >= 0.55), flag as Deepfake.
        # 2. If physical/generative forensics detects AI generation / diffusion (forensic_prob >= 0.55), flag as Deepfake.
        # 3. Otherwise, compute weighted ensemble probability.
        fused_prob = 0.40 * raw_cnn + 0.60 * forensic_prob

        if raw_cnn >= 0.55 or forensic_prob >= 0.55 or fused_prob >= self.threshold:
            p_positive = max(fused_prob, forensic_prob if forensic_prob >= 0.55 else raw_cnn)
            p_negative = 1.0 - p_positive
            label, confidence = self.positive_label, p_positive
        else:
            p_positive = min(fused_prob, raw_cnn)
            p_negative = 1.0 - p_positive
            label, confidence = self.negative_label, p_negative

        return DetectionResult(
            label=label,
            confidence=confidence,
            probabilities={
                self.positive_label: round(p_positive, 6),
                self.negative_label: round(p_negative, 6),
            },
            model_name=self._name,
            processing_time=time.perf_counter() - started,
            metadata={
                "raw_sigmoid": round(raw_cnn, 6),
                "forensic_probability": round(forensic_prob, 6),
                "fused_probability": round(fused_prob, 6),
                "tta_views": {
                    "standard": round(raw_std, 6),
                    "flipped": round(raw_flip, 6),
                    "center_crop": round(raw_crop, 6),
                },
                "forensics": forensic_telemetry,
                "threshold": self.threshold,
                "preprocess_mode": self.preprocess_mode,
                "input_size": self.input_size,
            },
        )

    def describe(self) -> dict:
        payload = super().describe()
        payload.update(
            {
                "weights_path": self.weights_path,
                "input_size": self.input_size,
                "preprocess_mode": self.preprocess_mode,
                "labels": [self.negative_label, self.positive_label],
                "threshold": self.threshold,
                "error": self._load_error,
            }
        )
        return payload
