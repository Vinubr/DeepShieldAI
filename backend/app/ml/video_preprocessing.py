"""
Video preprocessing for the R3D-18 detector.

Every constant here is copied verbatim from `DeepShieldAI_Video_Retraining.ipynb`
(confirmed by reading the notebook cell-by-cell, not from its prose) — 16
frames uniformly sampled per clip, resized to 224x224, scaled to [0,1], then
normalized with Kinetics-400 mean/std (the stats R3D-18's ImageNet/Kinetics
pretraining used). A model this small (84 training clips) has zero slack to
absorb a preprocessing mismatch the way a model trained on millions of
images might.
"""

from pathlib import Path

import cv2
import numpy as np

NUM_FRAMES = 16
FRAME_SIZE = 224

# CONFIRMED from the retraining notebook, cell 8 — Kinetics-400 statistics,
# not ImageNet's. Using ImageNet's [0.485, 0.456, 0.406] here would be a
# silent, hard-to-notice preprocessing bug identical in spirit to the image
# model's polarity bug.
MEAN = np.array([0.43216, 0.394666, 0.37645], dtype=np.float32)
STD = np.array([0.22803, 0.22145, 0.216989], dtype=np.float32)


def extract_frames(
    video_path: str,
    num_frames: int = NUM_FRAMES,
    frame_size: int = FRAME_SIZE,
) -> np.ndarray:
    """
    Uniformly sample `num_frames` frames across the clip and preprocess them.

    Returns an array of shape (T, H, W, C), float32, normalized — the same
    shape and preprocessing the training notebook produced before permuting
    to PyTorch's (C, T, H, W) channel order (done separately in
    `video_detector.py`, mirroring the notebook's own dataset class).
    """
    path = Path(video_path)

    if not path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")

    cap = cv2.VideoCapture(str(path))

    if not cap.isOpened():
        cap.release()
        raise ValueError(f"OpenCV could not open video: {video_path}")

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

    if total_frames <= 0:
        cap.release()
        raise ValueError(f"Video reports zero frames: {video_path}")

    frame_indices = np.linspace(0, total_frames - 1, num_frames).astype(int)

    # 1. Fast direct seek extraction
    frames = []
    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ret, frame = cap.read()
        if ret and frame is not None:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frame = cv2.resize(frame, (frame_size, frame_size))
            frames.append(frame)

    # 2. Sequential fallback if direct seek was unsupported or yielded insufficient frames
    if len(frames) < num_frames // 2:
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        frames = []
        frame_idx_set = set(frame_indices.tolist())
        current_idx = 0
        max_idx = frame_indices.max()

        while current_idx <= max_idx:
            ret, frame = cap.read()
            if not ret:
                break
            if current_idx in frame_idx_set:
                frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frame = cv2.resize(frame, (frame_size, frame_size))
                frames.append(frame)
            current_idx += 1

    cap.release()

    if len(frames) == 0:
        raise ValueError(f"Could not extract any frames from: {video_path}")

    # A short/corrupt clip that yields fewer frames than requested is padded
    # by repeating the last good frame — matches the training notebook
    # exactly, rather than erroring on an edge case training never saw.
    while len(frames) < num_frames:
        frames.append(frames[-1])

    frames = np.array(frames[:num_frames], dtype=np.float32)
    frames /= 255.0
    frames = (frames - MEAN) / STD

    return frames
