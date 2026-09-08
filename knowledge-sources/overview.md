# DeepShieldAI System Overview

DeepShieldAI analyzes images, audio, video, news or article text, and product or service reviews with separate machine-learning detectors. Each result is an automated assessment, not absolute proof. Interpret it with the confidence score, file quality, detector modality, provenance, and independent evidence.

## Result Labels

- **Genuine or Real**: The detector found authentic content more likely.
- **Deepfake or Fake**: The detector found manipulated or synthetic content more likely.
- **Suspicious**: The file should receive additional human review.
- **Uncertain**: A confidence near 50 percent indicates uncertainty.

*Note: A high score can still be wrong for unfamiliar media, poor-quality files, or content outside training data.*

## Supported Input Formats

- **Images**: JPG, JPEG, PNG. The image detector expects a visible subject and processes RGB input at 224 by 224 pixels.
- **Audio**: WAV, MP3, M4A, AAC, FLAC, and OGG when supported by the installed reader. Audio is converted to mono at 16 kHz and processed as a five-second window.
- **Video**: A readable video file such as an H.264 MP4 containing real video frames. The video detector samples 16 frames.
- **Text and Reviews**: TXT or Markdown with readable text. Empty or image-only documents cannot be analyzed as text.

## Input Handling Guidance

Use the detector that matches the actual media stream, not merely the filename. 
- **Audio-only MP4 files**: Must be uploaded as audio or converted to WAV/MP3.
- **Video files**: Need readable frames. If OpenCV cannot open a video, confirm that it contains a video stream, is not corrupted, and uses a compatible codec. Re-exporting as H.264 MP4 can help.
- **Text files**: Need extractable text; an image pasted into a document is not automatically OCR-processed.
