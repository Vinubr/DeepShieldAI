# Model Performance and Limitations

This document details the evaluation metrics, known failure modes, and reliability caveats for each detection modality.

## Performance Summary

| Modality | Test F1 | Test set size | Status | Reliability |
|---|---|---|---|---|
| Audio | **0.980** | 150 | Verified | Strongest model. |
| Review | **0.973** | 6,063 | Verified | High metrics, but check OOD caveat. |
| Text | 0.982 | 335 | Caution | High metrics, but training data loss bug noted. |
| Image | 0.782 | 100 | Live | Moderate; over-predicts FAKE. |
| Video | 0.385 | 11 | Broken | Unreliable; predicts one class. |

---

## Modality Details

### Image Model
- **Metric**: F1 $\approx$ 0.782.
- **Weakness**: Lower Genuine recall than Deepfake recall (misclassifies $\approx$ 1/3 of genuine images as fake).
- **Failure Modes**: Compression, filters, unusual lighting, profile faces, occlusion, small faces, screenshots, dashboards, illustrations, and non-face images.
- **Guidance**: A single photograph is not enough to prove manipulation.

### Audio Model
- **Metric**: F1 $\approx$ 0.980.
- **Weakness**: Performance may drop for music, background noise, very short clips, unusual accents, or audio significantly different from the training set.

### Review Model
- **Metric**: F1 $\approx$ 0.973.
- **OOD Caveat**: The model has learned to recognize the specific machine-generated style of its training dataset rather than "fake reviews" generally. Obvious hand-written spammy reviews are often classified as **Genuine (OR)**.

### Text Model
- **Metric**: Reported F1 $\approx$ 0.982.
- **Data Bug**: 40% of the dataset was lost during label encoding, and class balance collapsed (83/17). Headline metrics are likely inflated by this imbalance.

### Video Model
- **Metric**: F1 $\approx$ 0.385.
- **Failure Mode**: Predicts "real" for nearly every input (Fake recall = 0.00).
- **Root Cause**: Sample size too small (84 training clips) for a 33M-parameter 3D CNN. 
- **Guidance**: **Do not ship as forensic evidence.**

---

## Improving Reliability

- **Data**: Use balanced, representative training and validation data; keep an untouched test set.
- **Metrics**: Measure precision, recall, F1, and confusion matrices by modality.
- **Testing**: Test different codecs, resolutions, accents, writing styles, and compression levels.
- **Calibration**: Tune thresholds on validation data instead of forcing desired labels.
- **Monitoring**: Monitor false positives and false negatives after deployment.
