# Explainability and RAG Guide

## Explainability Methods

DeepShieldAI uses several local approximation methods to highlight influential features in the input data. These are not proof of manipulation, but indicators of model focus.

- **Grad-CAM**: Uses gradients from convolutional feature layers to highlight 2D spatial heatmap regions for Image, 3D keyframe overlays for Video, and 1D temporal segment activations for Audio.
- **SHAP**: Provides Shapley additive attributions across Text/Review word tokens (highlighting promotional hyperbole vs grounded purchase details), Image superpixels, and Audio temporal waveform segments.
- **LIME**: Perturbs tokens, superpixels, or temporal chunks and fits an interpretable local surrogate linear model across all modalities (Text, Review, Image, Video, Audio).
- **Linguistic Forensics**: Analyzes Type-Token Ratio (TTR), stylometric punctuation clustering, commercial hyperbole constructs, and cross-references them against grounded RAG knowledge citations.

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
