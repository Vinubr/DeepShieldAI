"""
SHAP token attribution for the DistilBERT-based Text and Review detectors.

Both models are the same architecture (`distilbert-base-uncased` sequence
classifier) wired the same way (app/ml/text_detector.py,
app/ml/review_detector.py), so one implementation serves both — it only
touches the small public surface both classes expose
(`underlying_model`, `tokenizer`, `labels`, `device`, `max_length`), not
which modality the detector belongs to.

Approach: SHAP's `Explainer` with a `Text` masker treats the model as a
black box — it perturbs (masks out) tokens and observes how the predicted
probabilities move, then fits Shapley values explaining each token's
contribution to the predicted class. This is the standard modern
(`shap>=0.44`) text-explanation path and needs no gradient access, unlike
Grad-CAM, so it doesn't care that the underlying model is a plain
`transformers` model rather than anything Keras-specific.
"""
import numpy as np
import torch

from app.ml.text_preprocessing import load_text


def generate(detector, file_path: str) -> dict:
    """
    Run SHAP against a loaded TextDetector or ReviewDetector for the text
    file at `file_path`. Returns per-token attribution weights for
    whichever class the model actually predicted — not a fixed class index,
    since "Fake" is index 0 for Text but the two detectors don't
    necessarily share a label ordering (see each detector's own
    docstring on why labels are read from the checkpoint, not hardcoded).
    """
    import shap

    text = load_text(file_path)

    model = detector.underlying_model
    tokenizer = detector.tokenizer
    device = detector.device
    max_length = detector.max_length
    id2label = detector.labels

    def predict_proba(texts) -> np.ndarray:
        inputs = tokenizer(
            list(texts),
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=max_length,
        )
        inputs = {key: value.to(device) for key, value in inputs.items()}

        with torch.no_grad():
            logits = model(**inputs).logits
            probs = torch.softmax(logits, dim=-1)

        return probs.cpu().numpy()

    masker = shap.maskers.Text(tokenizer)
    explainer = shap.Explainer(predict_proba, masker, silent=True)
    shap_values = explainer([text])

    predicted_id = int(np.argmax(predict_proba([text])[0]))

    tokens = shap_values.data[0]
    weights = shap_values.values[0][:, predicted_id]

    attributions = [
        {"token": str(token), "weight": round(float(weight), 6)}
        for token, weight in zip(tokens, weights)
        # SHAP's Text masker emits whitespace/empty tokens or special tokens as masking
        # boundaries — meaningless to show as an "important word" in the UI.
        if str(token).strip() and str(token).strip() not in {"[CLS]", "[SEP]", "[PAD]", "<s>", "</s>", "<pad>"}
    ]

    return {
        "method": "shap",
        "artifact_type": "tokens",
        "artifact": attributions,
        "metadata": {
            "predicted_label": id2label.get(predicted_id, str(predicted_id)),
            "characters_read": len(text),
            "token_count": len(attributions),
        },
    }


def generate_image(
    detector,
    file_path: str,
    num_segments: int = 12,
    nsamples: int = 10,
    alpha: float = 0.45,
) -> dict:
    """
    Run SHAP attribution on an Image detector (MobileNetV2).
    Segments the image into superpixels, generates perturbation masks, fits
    Shapley kernel values to assess superpixel contributions, and renders
    a heatmap overlay.
    """
    import base64
    import io
    from PIL import Image
    from skimage.segmentation import slic
    from sklearn.linear_model import Ridge
    from app.ml.preprocessing import load_image, to_batch
    from xai.gradcam import _apply_colormap

    original = load_image(file_path)
    input_size = getattr(detector, "input_size", 224)
    mode = getattr(detector, "preprocess_mode", "rescale")
    img_resized = original.resize((input_size, input_size), Image.BILINEAR)
    img_np = np.asarray(img_resized)

    segments = slic(img_np, n_segments=num_segments, compactness=10.0, start_label=0)
    unique_segments = np.unique(segments)
    n_segs = len(unique_segments)

    # Base prediction
    base_batch = to_batch(original, input_size=input_size, mode=mode)
    base_tensor = torch.tensor(base_batch)
    with torch.inference_mode():
        base_pred = float(detector.underlying_model(base_tensor).squeeze().cpu().numpy())

    # Background color for masked superpixels
    bg_color = img_np.mean(axis=(0, 1), keepdims=True)

    rng = np.random.default_rng(42)
    masks = rng.integers(0, 2, size=(nsamples, n_segs))
    masks[0] = 1
    masks[1] = 0

    perturbed_images = []
    for mask in masks:
        perturbed = img_np.copy()
        for idx in range(n_segs):
            if mask[idx] == 0:
                perturbed[segments == unique_segments[idx]] = bg_color
        batch_sample = to_batch(
            Image.fromarray(perturbed),
            input_size=input_size,
            mode=mode,
        )
        perturbed_images.append(batch_sample[0])

    batch_tensor = torch.tensor(np.stack(perturbed_images, axis=0))
    with torch.inference_mode():
        preds = detector.underlying_model(batch_tensor).squeeze().cpu().numpy()

    # Shapley kernel weights
    s = masks.sum(axis=1)
    weights = np.ones(nsamples, dtype=np.float32)
    for i in range(nsamples):
        size = s[i]
        if 0 < size < n_segs:
            weights[i] = (n_segs - 1) / (size * (n_segs - size))
        else:
            weights[i] = 1.0

    reg = Ridge(alpha=1.0)
    reg.fit(masks, preds, sample_weight=weights)
    shap_weights = reg.coef_

    # Map back to 2D heatmap
    heatmap = np.zeros((input_size, input_size), dtype=np.float32)
    for idx in range(n_segs):
        heatmap[segments == unique_segments[idx]] = shap_weights[idx]

    heatmap = np.maximum(0, heatmap)
    peak = float(heatmap.max())
    if peak > 0:
        heatmap = heatmap / peak

    colored = _apply_colormap(np.uint8(255 * heatmap))
    overlay = Image.blend(img_resized.convert("RGB"), colored, alpha=alpha)

    buffer = io.BytesIO()
    overlay.save(buffer, format="PNG")
    artifact = base64.b64encode(buffer.getvalue()).decode("ascii")

    return {
        "method": "shap",
        "artifact_type": "image",
        "artifact": artifact,
        "metadata": {
            "num_superpixels": n_segs,
            "nsamples": nsamples,
            "peak_attribution": peak,
        },
    }


def generate_video(
    detector,
    file_path: str,
    num_segments: int = 6,
) -> dict:
    """
    Run fast spatio-temporal Grad-SHAP attribution on Video detector (R3D-18).
    Hooks layer4 spatio-temporal feature maps, computes gradients w.r.t the
    predicted class, and derives Shapley values for each temporal video segment.
    """
    from app.ml.video_preprocessing import extract_frames

    frames = extract_frames(
        file_path,
        num_frames=detector.num_frames,
        frame_size=detector.frame_size,
    )

    tensor = (
        torch.from_numpy(frames)
        .permute(3, 0, 1, 2)
        .unsqueeze(0)
        .to(detector.device)
        .contiguous()
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
    base_prob = float(torch.softmax(output, dim=-1)[0, pred_idx].detach().cpu())

    grads_tuple = torch.autograd.grad(score, features, retain_graph=False, allow_unused=True)
    grads = grads_tuple[0] if grads_tuple[0] is not None else torch.ones_like(features)
    # Grad-SHAP temporal contribution: sum over channels, average over space
    temporal_raw = (
        (grads * features).sum(dim=1).mean(dim=(2, 3))[0].detach().cpu().numpy()
    )

    t_len = len(temporal_raw)
    seg_indices = np.linspace(0, t_len - 1, num_segments)
    shap_weights = np.interp(seg_indices, np.arange(t_len), temporal_raw)

    norm_denom = float(np.max(np.abs(shap_weights))) or 1.0
    shap_weights = shap_weights / norm_denom

    duration = 5.0
    seg_dur = duration / num_segments
    segments = []
    for i in range(num_segments):
        segments.append(
            {
                "start": round(i * seg_dur, 2),
                "end": round((i + 1) * seg_dur, 2),
                "weight": round(float(shap_weights[i]), 6),
            }
        )

    class_name = (
        detector._class_names[pred_idx]
        if hasattr(detector, "_class_names") and pred_idx < len(detector._class_names)
        else str(pred_idx)
    )

    return {
        "method": "shap",
        "artifact_type": "audio_segments",
        "artifact": segments,
        "metadata": {
            "num_segments": num_segments,
            "predicted_class": class_name,
            "base_confidence": round(base_prob, 4),
        },
    }

