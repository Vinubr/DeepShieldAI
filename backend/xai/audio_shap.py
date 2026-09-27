"""
SHAP explanation for the Wav2Vec2-based AudioDetector.

The audio detector is trained on exactly 5-second / 80,000-sample
waveforms. Explaining all 80,000 individual samples would be both
computationally expensive and meaningless to display to a user.

Instead, the waveform is divided into a small number of time segments.
SHAP treats each segment as a feature and measures how much that segment
contributes to the model's predicted class.

Output:
    {
        "method": "shap",
        "artifact_type": "audio_segments",
        "artifact": [
            {
                "start": 0.0,
                "end": 0.25,
                "weight": ...
            },
            ...
        ],
        "metadata": {...}
    }
"""

import numpy as np
import torch

from app.ml.audio_preprocessing import preprocess_file


def generate(
    detector,
    file_path: str,
    num_segments: int = 12,
    nsamples: int = 15,
) -> dict:
    """
    Generate SHAP attribution values for an audio file.

    The 5-second waveform is divided into `num_segments` equal regions.
    SHAP then estimates the contribution of each region to the predicted
    class.

    Parameters
    ----------
    detector:
        Loaded AudioDetector instance.

    file_path:
        Path to the uploaded audio file.

    num_segments:
        Number of time regions to explain.

    nsamples:
        Number of SHAP samples used by the KernelExplainer.

    Returns
    -------
    dict
        Explanation result compatible with the project's explanation API.
    """

    import shap

    if detector._model is None or detector._feature_extractor is None:
        raise RuntimeError("Audio model is not loaded.")

    # ------------------------------------------------------------
    # 1. Load the exact waveform used by the detector
    # ------------------------------------------------------------

    waveform = preprocess_file(
        file_path,
        sample_rate=detector.sample_rate,
        num_samples=detector.num_samples,
    )

    waveform = np.asarray(waveform, dtype=np.float32)

    total_samples = len(waveform)
    segment_length = total_samples // num_segments

    # ------------------------------------------------------------
    # 2. Prediction function
    # ------------------------------------------------------------

    model = detector._model
    feature_extractor = detector._feature_extractor
    device = detector.device
    id2label = detector._id2label

    def predict_from_segments(segment_masks):
        """
        Convert SHAP's segment masks back into complete waveforms
        and run the actual Wav2Vec2 classifier.
        """

        segment_masks = np.asarray(segment_masks)

        if segment_masks.ndim == 1:
            segment_masks = segment_masks.reshape(1, -1)

        waveforms = []

        for mask in segment_masks:
            masked_waveform = waveform.copy()

            for segment_index in range(num_segments):
                if mask[segment_index] < 0.5:
                    start = segment_index * segment_length

                    if segment_index == num_segments - 1:
                        end = total_samples
                    else:
                        end = (segment_index + 1) * segment_length

                    masked_waveform[start:end] = 0.0

            waveforms.append(masked_waveform)

        inputs = feature_extractor(
            waveforms,
            sampling_rate=detector.sample_rate,
            return_tensors="pt",
            padding="max_length",
            truncation=True,
            max_length=detector.num_samples,
        )

        inputs = {
            key: value.to(device)
            for key, value in inputs.items()
        }

        with torch.no_grad():
            logits = model(**inputs).logits
            probabilities = torch.softmax(logits, dim=-1)

        return probabilities.cpu().numpy()

    # ------------------------------------------------------------
    # 3. Determine the actual predicted class
    # ------------------------------------------------------------

    full_input = np.ones((1, num_segments), dtype=np.float32)

    full_probabilities = predict_from_segments(full_input)

    predicted_id = int(np.argmax(full_probabilities[0]))

    predicted_label = id2label.get(
        predicted_id,
        str(predicted_id),
    )

    predicted_probability = float(
        full_probabilities[0][predicted_id]
    )

    # ------------------------------------------------------------
    # 4. Create SHAP explainer
    # ------------------------------------------------------------

    # All-zeros waveform is used as the baseline:
    # no audio segment contributes to the baseline prediction.
    background = np.zeros(
        (1, num_segments),
        dtype=np.float32,
    )

    explainer = shap.KernelExplainer(
        lambda masks: predict_from_segments(masks),
        background,
    )

    # Explain the complete audio (all segments present).
    shap_values = explainer.shap_values(
        full_input,
        nsamples=nsamples,
    )

    # SHAP output shape differs between SHAP versions/models.
    if isinstance(shap_values, list):
        values = np.asarray(shap_values[predicted_id])[0]
    else:
        values = np.asarray(shap_values)

        if values.ndim == 3:
            values = values[0, :, predicted_id]
        elif values.ndim == 2:
            values = values[0]

    values = values.astype(float)

    # ------------------------------------------------------------
    # 5. Convert SHAP values into time segments
    # ------------------------------------------------------------

    segment_duration = total_samples / detector.sample_rate / num_segments

    attributions = []

    for index, weight in enumerate(values):
        start_time = index * segment_duration
        end_time = (index + 1) * segment_duration

        attributions.append(
            {
                "segment": index,
                "start": round(float(start_time), 3),
                "end": round(float(end_time), 3),
                "weight": round(float(weight), 6),
            }
        )

    # Largest absolute contributions first.
    attributions.sort(
        key=lambda item: abs(item["weight"]),
        reverse=True,
    )

    return {
        "method": "shap",
        "artifact_type": "audio_segments",
        "artifact": attributions,
        "metadata": {
            "predicted_label": predicted_label,
            "predicted_probability": round(
                predicted_probability,
                6,
            ),
            "sample_rate": detector.sample_rate,
            "duration_seconds": round(
                total_samples / detector.sample_rate,
                3,
            ),
            "num_segments": num_segments,
            "segment_duration_seconds": round(
                segment_duration,
                3,
            ),
            "shap_samples": nsamples,
        },
    }