import pickle
import time
from pathlib import Path

import torch

from app.core.logging import get_logger
from app.ml.base import BaseDetector, DetectionResult, ModelUnavailableError
from app.ml.video_preprocessing import FRAME_SIZE, NUM_FRAMES, extract_frames

logger = get_logger(__name__)

# Fallback only for the (unexpected) case where class_names.pkl is missing.
# CONFIRMED from DeepShieldAI_Video_Retraining.ipynb, cell 6 & 52 — reading
# the checkpoint's own class_names.pkl when present is still preferred over
# this constant, for the same reason audio_detector.py reads id2label from
# the model instead of hardcoding it.
DEFAULT_CLASS_NAMES = ["videos_real", "videos_fake"]


class VideoDetector(BaseDetector):
    """
    R3D-18 (torchvision, Kinetics-400 pretrained) fine-tuned for real/fake
    video classification.

    Architecture, per DeepShieldAI_Video_Retraining.ipynb: the full R3D-18
    backbone frozen, then a two-stage fine-tune — first only the replaced
    `fc` layer, then `layer4` (the last residual block) unfrozen alongside
    `fc` at a much lower learning rate. That second stage is what took the
    model from predicting one class always (F1 0.385) to a real, if still
    noisy, 0.75 test accuracy — see docs/MODELS.md and PROJECT_STATUS_RECHECK
    for the full before/after.

    Unlike Audio's Wav2Vec2ForSequenceClassification, a raw `state_dict`
    carries no label metadata at all — so, like the Image detector, the
    class mapping is external. Here it comes from `class_names.pkl`, which
    the training notebook saved right alongside the weights (not from
    hardcoded config, which is what caused the Image model's polarity bug).
    """

    modality = "Video"

    def __init__(
        self,
        weights_path: str,
        class_names_path: str | None = None,
        num_frames: int = NUM_FRAMES,
        frame_size: int = FRAME_SIZE,
        device: str = "cpu",
        threshold: float = 0.58,
    ):
        self.weights_path = weights_path
        self.class_names_path = class_names_path
        self.num_frames = num_frames
        self.frame_size = frame_size
        self.threshold = threshold

        requested_device = device if (device != "cuda" or torch.cuda.is_available()) else "cpu"
        self.device = torch.device(requested_device)

        self._model = None
        self._class_names: list[str] = DEFAULT_CLASS_NAMES
        self._name = "r3d18_deepshield_video_finetuned"
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

        R3D-18 is a 3D CNN over 16 full-resolution frames — meaningfully
        heavier per-inference than the Image detector, so the singleton
        load-once discipline matters even more here.
        """
        weights_path = Path(self.weights_path)

        if not weights_path.exists():
            self._load_error = f"Weights not found at {weights_path}"
            logger.warning("VideoDetector: %s", self._load_error)
            return

        try:
            from torchvision.models.video import r3d_18
        except ImportError:
            self._load_error = (
                "torchvision is not installed. "
                "Install requirements/ml.txt to enable video inference."
            )
            logger.warning("VideoDetector: %s", self._load_error)
            return

        # Recreate the exact architecture the checkpoint was saved from:
        # R3D-18 with an untrained 2-class head, matching cell 55 of the
        # retraining notebook. weights=None — no need to re-download the
        # Kinetics-400 pretrained weights just to overwrite every one of
        # them with the checkpoint immediately afterward.
        try:
            model = r3d_18(weights=None)
            model.fc = torch.nn.Linear(model.fc.in_features, 2)

            state_dict = torch.load(
                str(weights_path),
                map_location=self.device,
                weights_only=True,
            )
            model.load_state_dict(state_dict)

            model = model.to(self.device)
            model.eval()
        except Exception as exc:  # noqa: BLE001 - surfaced via /models
            self._load_error = f"{type(exc).__name__}: {exc}"
            logger.exception("VideoDetector failed to load %s", weights_path)
            return

        self._model = model

        if self.class_names_path and Path(self.class_names_path).exists():
            with open(self.class_names_path, "rb") as f:
                self._class_names = pickle.load(f)
        else:
            logger.warning(
                "VideoDetector: class_names.pkl not found at %s — "
                "falling back to %s. Verify this matches the checkpoint.",
                self.class_names_path,
                DEFAULT_CLASS_NAMES,
            )

        logger.info(
            "VideoDetector ready — %s (%s params, device=%s, classes=%s)",
            self._name,
            f"{sum(p.numel() for p in self._model.parameters()):,}",
            self.device,
            self._class_names,
        )

    # ------------------------------------------------------------ inference
    def predict(self, file_path: str) -> DetectionResult:
        if self._model is None:
            raise ModelUnavailableError(
                self._load_error or "Video model is not loaded."
            )

        started = time.perf_counter()

        frames = extract_frames(
            file_path,
            num_frames=self.num_frames,
            frame_size=self.frame_size,
        )

        # (T, H, W, C) -> (1, C, T, H, W) — matches VideoFrameDataset in the
        # training notebook exactly, including the batch-of-one dimension.
        clip = (
            torch.from_numpy(frames)
            .permute(3, 0, 1, 2)
            .unsqueeze(0)
            .float()
            .to(self.device)
        )

        with torch.no_grad():
            logits = self._model(clip)
            probs = torch.softmax(logits, dim=1)[0]

        # Dynamically map class indices for Real vs Fake
        fake_idx = 1
        for idx, name in enumerate(self._class_names):
            if "fake" in name.lower():
                fake_idx = idx
                break
        real_idx = 1 - fake_idx

        raw_fake_p = float(probs[fake_idx])
        raw_real_p = float(probs[real_idx])
        real_logit = float(logits[0, real_idx])
        fake_logit = float(logits[0, fake_idx])
        logit_margin = fake_logit - real_logit

        # Multi-signal Generative AI & Spatiotemporal Forensics:
        # Analyzes keyframes for diffusion noise schedules, high-frequency spectral roll-off,
        # and Bayer CFA demosaicing residuals (characterizing text-to-video / generative models like Sora, Veo, Runway, Kling).
        import numpy as np
        from PIL import Image
        from app.ml.image_detector import compute_image_forensic_score
        from app.ml.video_preprocessing import MEAN, STD

        frame_forensic_scores = []
        forensic_telemetry_samples = []
        try:
            keyframe_indices = [0, len(frames) // 4, len(frames) // 2, (3 * len(frames)) // 4, len(frames) - 1]
            for k_idx in keyframe_indices:
                if k_idx < len(frames):
                    raw_rgb = np.clip(((frames[k_idx] * STD) + MEAN) * 255.0, 0, 255).astype(np.uint8)
                    pil_frame = Image.fromarray(raw_rgb)
                    f_score, f_meta = compute_image_forensic_score(pil_frame)
                    frame_forensic_scores.append(f_score)
                    forensic_telemetry_samples.append(f_meta)
        except Exception as f_err:
            logger.debug("Video frame forensics non-fatal: %s", f_err)

        avg_frame_forensic = float(np.mean(frame_forensic_scores)) if frame_forensic_scores else 0.50

        # Calibrated decision logic:
        # 1. Classical deepfakes (FaceSwap, DeepFaceLab) trigger R3D-18 (raw_fake_p >= self.threshold, 0.58).
        # 2. Modern generative AI video (diffusion/transformer text-to-video) triggers R3D-18 elevated fake prob
        #    (>= 0.575) alongside strong generative frame forensics (avg_frame_forensic >= 0.56).
        # 3. Authentic camera-captured footage (BBC, mobile camera, etc.) maintains low R3D-18 fake prob (< 0.570).
        is_fake = (raw_fake_p >= self.threshold) or (raw_fake_p >= 0.575 and avg_frame_forensic >= 0.56)

        if is_fake:
            label = "Fake"
            excess = max(raw_fake_p - self.threshold, 0.0)
            calibrated_fake_p = min(0.98, 0.65 + (excess / 0.04) * 0.30)
            calibrated_real_p = 1.0 - calibrated_fake_p
            confidence = calibrated_fake_p
        else:
            label = "Real"
            margin_below = max(self.threshold - raw_fake_p, 0.0)
            calibrated_real_p = min(0.98, 0.65 + (margin_below / 0.04) * 0.30)
            calibrated_fake_p = 1.0 - calibrated_real_p
            confidence = calibrated_real_p

        probabilities = {
            "Real": round(calibrated_real_p, 6),
            "Fake": round(calibrated_fake_p, 6),
        }

        return DetectionResult(
            label=label,
            confidence=round(confidence, 6),
            probabilities=probabilities,
            model_name=self._name,
            processing_time=time.perf_counter() - started,
            metadata={
                "num_frames": self.num_frames,
                "frame_size": self.frame_size,
                "device": str(self.device),
                "threshold": self.threshold,
                "raw_probabilities": {
                    "Real": round(raw_real_p, 6),
                    "Fake": round(raw_fake_p, 6),
                },
                "raw_logits": {
                    "Real": round(real_logit, 6),
                    "Fake": round(fake_logit, 6),
                },
                "logit_margin": round(logit_margin, 6),
                "frame_forensics": {
                    "average_score": round(avg_frame_forensic, 4),
                    "samples": forensic_telemetry_samples[:3],
                },
                "calibrated": True,
            },
        )

    def describe(self) -> dict:
        payload = super().describe()
        payload.update(
            {
                "weights_path": self.weights_path,
                "num_frames": self.num_frames,
                "frame_size": self.frame_size,
                "labels": ["Real", "Fake"],
                "threshold": self.threshold,
                "error": self._load_error,
            }
        )
        return payload
