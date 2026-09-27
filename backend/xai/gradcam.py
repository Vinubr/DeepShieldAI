"""
Grad-CAM for the Image detector (MobileNetV2, running as a Keras 3 model on
the PyTorch backend — see app/ml/image_detector.py's docstring for why
there's no `tensorflow` install in this project at all).

`docs/MODELS.md` originally assumed `tf-keras-vis` for this, but that
library is TensorFlow-only and this project deliberately runs Keras on
the PyTorch backend instead. Rather than fight that mismatch, Grad-CAM is
implemented directly here using plain `torch.autograd` — since the active
backend is torch, a Keras 3 model's forward pass already produces real
torch.Tensor objects wired into torch's autograd graph, so the standard
Grad-CAM recipe (grab the last conv layer's activations, take the gradient
of the target output w.r.t. them, weight the channels by their average
gradient) works exactly as it would for a hand-written torch model.

Algorithm (Selvaraju et al., 2017):
    1. Build a second model exposing (last_conv_layer_output, final_output).
    2. Forward the input through it.
    3. Take d(final_output)/d(last_conv_layer_output) via autograd.
    4. Global-average-pool that gradient over space -> one weight per
       channel (this is "how much did this channel matter overall").
    5. Weight each channel of the conv activations by that and sum -> a
       single-channel heatmap over the conv layer's spatial resolution.
    6. ReLU it (Grad-CAM only cares about features that *increase* the
       target score) and normalise to [0, 1].
    7. Upsample to the input resolution and alpha-blend over the image.
"""
import base64
import io

import numpy as np
import torch
from PIL import Image

from app.ml.preprocessing import load_image, to_batch


def _find_last_conv_layer(model):
    """
    The last layer whose output is a 4D (batch, height, width, channels)
    feature map. Found by walking the model's layers rather than hardcoded
    by name — MobileNetV2's internal layer names aren't something this
    project should have to keep in sync with the trained `.keras` artefact
    by hand (same reasoning as reading id2label from a checkpoint instead
    of hardcoding it, elsewhere in app/ml/).
    """
    for layer in reversed(model.layers):
        shape = getattr(getattr(layer, "output", None), "shape", None)
        if shape is not None and len(shape) == 4:
            return layer

    raise ValueError(
        "No 4D convolutional-style layer found — Grad-CAM needs one to "
        "explain a spatial region of the input."
    )


def _apply_colormap(gray: np.ndarray) -> Image.Image:
    """
    A minimal black -> red -> yellow colormap, so a heatmap overlay doesn't
    require pulling in matplotlib as a dependency just for this. `gray` is
    uint8, shape (H, W).
    """
    r = np.clip(gray.astype("int16") * 2, 0, 255).astype("uint8")
    g = np.clip((gray.astype("int16") - 128) * 2, 0, 255).astype("uint8")
    b = np.zeros_like(gray, dtype="uint8")
    return Image.fromarray(np.stack([r, g, b], axis=-1), mode="RGB")


def generate(
    model,
    file_path: str,
    input_size: int = 224,
    preprocess_mode: str = "rescale",
    alpha: float = 0.45,
) -> dict:
    """
    Run Grad-CAM against a loaded ImageDetector's Keras model for the image
    at `file_path`. `model` is `ImageDetector.underlying_model`;
    `input_size`/`preprocess_mode` should be the same detector's own
    settings, so the explanation sees exactly what the classifier saw.

    Returns {"method", "artifact_type", "artifact", "metadata"} — see
    app/models/explanation.py for what "artifact_type": "image" means on
    the wire.
    """
    import keras

    original = load_image(file_path)
    batch = to_batch(original, input_size=input_size, mode=preprocess_mode)

    last_conv_layer = _find_last_conv_layer(model)
    grad_model = keras.Model(
        inputs=model.inputs,
        outputs=[last_conv_layer.output, model.output],
    )

    input_tensor = torch.tensor(batch, requires_grad=True)
    conv_output, predictions = grad_model(input_tensor)

    # Single sigmoid unit (see ImageDetector's docstring): there's no
    # softmax/argmax to pick a class from — the one output *is* the target.
    target = predictions[:, 0]

    grads = torch.autograd.grad(target, conv_output)[0]

    # Channels-last (N, H, W, C) — average the gradient spatially to get one
    # importance weight per channel, per the Grad-CAM paper.
    pooled_grads = grads.mean(dim=(0, 1, 2))

    conv_output = conv_output[0]  # drop the batch dim -> (H, W, C)
    heatmap = torch.einsum("hwc,c->hw", conv_output, pooled_grads)
    heatmap = torch.relu(heatmap)

    heatmap = heatmap.detach().cpu().numpy()
    peak = float(heatmap.max())
    if peak > 0:
        heatmap = heatmap / peak

    resized_original = original.resize((input_size, input_size), Image.BILINEAR)
    heatmap_img = Image.fromarray(np.uint8(255 * heatmap)).resize(
        (input_size, input_size), Image.BILINEAR
    )
    colored = _apply_colormap(np.asarray(heatmap_img))
    overlay = Image.blend(resized_original.convert("RGB"), colored, alpha=alpha)

    buffer = io.BytesIO()
    overlay.save(buffer, format="PNG")
    artifact = base64.b64encode(buffer.getvalue()).decode("ascii")

    return {
        "method": "gradcam",
        "artifact_type": "image",
        "artifact": artifact,
        "metadata": {
            "layer": getattr(last_conv_layer, "name", "unknown"),
            "input_size": input_size,
            "peak_activation": peak,
        },
    }


def generate_video(
    detector,
    file_path: str,
    alpha: float = 0.45,
) -> dict:
    """
    Run 3D Spatio-Temporal Grad-CAM for the Video detector (R3D-18).
    Hooks layer4 (last 3D conv block), computes gradients, finds keyframe with
    highest spatial activation, and blends a Grad-CAM heatmap over that keyframe.
    """
    import cv2
    from app.ml.video_preprocessing import MEAN, STD, extract_frames

    frames = extract_frames(
        file_path,
        num_frames=detector.num_frames,
        frame_size=detector.frame_size,
    )
    # Unnormalize to original uint8 RGB for visualization
    unnorm = np.clip((frames * STD + MEAN) * 255.0, 0, 255).astype(np.uint8)

    tensor = (
        torch.from_numpy(frames)
        .permute(3, 0, 1, 2)
        .unsqueeze(0)
        .to(detector.device)
    )
    tensor.requires_grad = True

    features = None

    def hook_fn(module, inp, out):
        nonlocal features
        features = out

    handle = detector._model.layer4.register_forward_hook(hook_fn)
    output = detector._model(tensor)
    handle.remove()

    pred_idx = output.argmax(dim=-1).item()
    score = output[0, pred_idx]
    grads_tuple = torch.autograd.grad(score, features, retain_graph=False, allow_unused=True)
    grads = grads_tuple[0] if grads_tuple[0] is not None else torch.ones_like(features)

    # features and grads shape: (1, C, T', H', W')
    weights = grads.mean(dim=(3, 4), keepdim=True)
    cam = torch.relu((weights * features).sum(dim=1))[0]  # (T', H', W')
    cam_np = cam.detach().cpu().numpy()

    # Find keyframe with highest spatial activation
    t_max = int(np.argmax(cam_np.mean(axis=(1, 2))))
    orig_idx = min(
        detector.num_frames - 1,
        max(0, int(round(t_max * (detector.num_frames / cam_np.shape[0])))),
    )
    frame_img = Image.fromarray(unnorm[orig_idx])
    heatmap_2d = cv2.resize(cam_np[t_max], (detector.frame_size, detector.frame_size))
    peak = float(heatmap_2d.max())
    if peak > 0:
        heatmap_2d = heatmap_2d / peak

    colored = _apply_colormap(np.uint8(255 * heatmap_2d))
    overlay = Image.blend(frame_img, colored, alpha=alpha)

    buffer = io.BytesIO()
    overlay.save(buffer, format="PNG")
    artifact = base64.b64encode(buffer.getvalue()).decode("ascii")

    class_name = (
        detector._class_names[pred_idx]
        if hasattr(detector, "_class_names") and pred_idx < len(detector._class_names)
        else str(pred_idx)
    )

    return {
        "method": "gradcam",
        "artifact_type": "image",
        "artifact": artifact,
        "metadata": {
            "keyframe_index": orig_idx,
            "total_frames": detector.num_frames,
            "peak_activation": peak,
            "predicted_class": class_name,
        },
    }


def generate_audio(
    detector,
    file_path: str,
    num_segments: int = 20,
) -> dict:
    """
    Run 1D Temporal Grad-CAM for Audio detector (Wav2Vec2).
    Hooks the final 1D conv layer in the feature extractor, derives temporal
    gradients, and pools them into temporal segments across the audio clip.
    """
    from app.ml.audio_preprocessing import preprocess_file

    waveform = preprocess_file(
        file_path,
        sample_rate=detector.sample_rate,
        num_samples=detector.num_samples,
    )
    waveform = np.asarray(waveform, dtype=np.float32)

    model = detector._model
    device = detector.device

    last_conv = model.wav2vec2.feature_extractor.conv_layers[-1]
    features = None

    def hook_fn(module, inp, out):
        nonlocal features
        features = out

    handle = last_conv.register_forward_hook(hook_fn)
    inputs = torch.tensor(waveform).unsqueeze(0).to(device)
    logits = model(inputs).logits
    handle.remove()

    pred_idx = logits.argmax(dim=-1).item()
    score = logits[0, pred_idx]
    grads = torch.autograd.grad(score, features, retain_graph=False)[0]

    # features shape: (1, channels, T_feat)
    weights = grads.mean(dim=-1, keepdim=True)
    cam = torch.relu((weights * features).sum(dim=1))[0]  # (T_feat,)
    cam_np = cam.detach().cpu().numpy()

    t_len = len(cam_np)
    seg_size = max(1, t_len // num_segments)
    duration = detector.num_samples / detector.sample_rate
    seg_dur = duration / num_segments

    segments = []
    for i in range(num_segments):
        start_idx = i * seg_size
        end_idx = min(t_len, (i + 1) * seg_size) if i < num_segments - 1 else t_len
        weight = float(cam_np[start_idx:end_idx].mean()) if end_idx > start_idx else 0.0
        segments.append(
            {
                "start": round(i * seg_dur, 2),
                "end": round((i + 1) * seg_dur, 2),
                "weight": round(weight, 6),
            }
        )

    max_w = max(1e-6, max(s["weight"] for s in segments))
    for s in segments:
        s["weight"] = round(s["weight"] / max_w, 4)

    label_str = (
        detector._id2label.get(pred_idx, str(pred_idx))
        if hasattr(detector, "_id2label")
        else str(pred_idx)
    )

    return {
        "method": "gradcam",
        "artifact_type": "audio_segments",
        "artifact": segments,
        "metadata": {
            "num_segments": num_segments,
            "duration": duration,
            "predicted_label": label_str,
        },
    }

