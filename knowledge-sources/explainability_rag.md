# Explainability and RAG Guide

## Explainability Methods

DeepShieldAI uses several local approximation methods to highlight influential features in the input data. These are not proof of manipulation, but indicators of model focus.

- **Grad-CAM**: Uses gradients from a convolutional feature layer to highlight image regions (or video frames) that influenced the selected class.
- **Integrated Gradients**: Compares the audio waveform with a silence baseline to identify influential time windows.
- **SHAP**: Masks text tokens and estimates how their presence changes the selected class score.
- **LIME**: Perturbs image superpixels or text tokens and fits a simple local surrogate model.

*Note: Explanations are meaningful only when the underlying detector has learned relevant and generalizable signals.*

## RAG Behavior

The application automatically synchronizes supported files in `knowledge-sources/` into ChromaDB.
- **Process**: Files are extracted, split into chunks, embedded with `all-MiniLM-L6-v2`, and stored in the `deepshield_knowledge` collection.
- **Retrieval**: Questions retrieve the nearest passages with source metadata.
- **Purpose**: RAG explains detection methods, limitations, confidence scores, file requirements, and investigation procedures. It does **not** classify media or replace ML detectors.
- **Configuration**: Recommended chunk size is 500. ChromaDB is persisted in `backend/storage/chroma/`.

## Frequently Asked Questions

### Why can two different files receive the same result?
The model may focus on shared features, be biased toward one class, or encounter files outside its training distribution. Confirm the document IDs and compare confidence scores.

### Why can a genuine image receive a Deepfake result?
Compression, lighting, filters, small faces, pose, and model limitations can cause false positives. Test known examples and review the image manually.

### Why can an audio-only MP4 not be analyzed as video?
Its container is MP4, but it contains only an audio stream. Upload it as audio or convert it to WAV/MP3.

### What should a complete investigation include?
It should combine the prediction, confidence, model limitations, explanation artifact, provenance, independent evidence, and human review decision.
