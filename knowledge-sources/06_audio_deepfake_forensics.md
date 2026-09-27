# Audio Deepfake Forensics and Synthetic Voice Detection

## 1. Synthetic Speech and Voice Cloning Typology
Audio deepfakes and manipulated voice recordings pose significant threats to identity verification, social engineering defense, and legal evidence authentication. Synthetic audio falls into three primary generation paradigms:

1. **Text-to-Speech (TTS) Synthesis**: Fully synthetic speech generated directly from text scripts using acoustic models (e.g., Tacotron2, FastSpeech2, VITS) combined with neural vocoders.
2. **Voice Conversion (VC) & Speaker Cloning**: Transforming the vocal timbre and resonance of a source speaker into a target identity while preserving linguistic content (e.g., Retrieval-based Voice Conversion / RVC, StarGAN-v2, ElevenLabs).
3. **Replay and Splicing Manipulation**: Assembling fragments of authentic speech to alter semantics, often introducing unnatural silence transitions and phase discontinuities.

## 2. Forensic Acoustic Signatures of Synthetic Audio
Forensic audio analysis examines physiological speech anomalies and mathematical artifacts introduced by neural synthesis pipelines:

- **Unnatural Pitch (F0) Dynamics**: Authentic human vocal folds produce continuous micro-variations (jitter and shimmer) driven by biological muscle tremor. Synthetic voices frequently exhibit unnaturally steady fundamental frequency (F0) contours or mathematically quantized pitch transitions.
- **Vocal Tract Formant Continuity**: Natural speech transitions smoothly across vowel formants (F1, F2, F3) as the tongue, jaw, and lips move continuously. Neural vocoders can introduce abrupt formant shifts or blur spectral resonance peaks.
- **High-Frequency Phase Inconsistencies**: Vocoders (such as HiFi-GAN, WaveGlow, MelGAN) often struggle to reconstruct coherent phase information above 6–8 kHz, producing characteristic metallic timbre, buzzing, or sharp spectral roll-off anomalies.
- **Unnatural Silence and Breath Boundaries**: Living speakers naturally inhale before phonation and produce subtle acoustic room reverberation during pauses. Synthetic audio often contains mathematically pure digital zeros or uniform synthetic noise during speech pauses, completely lacking natural breathing acoustics.

## 3. DeepShieldAI Wav2Vec2 Detection Architecture
DeepShieldAI employs a fine-tuned `wav2vec2-base` architecture for automated sequence classification:
- **Audio Normalization**: All input files are resampled to 16,000 Hz mono and fixed to 5.0 seconds (80,000 samples) to ensure consistency with pre-trained acoustic self-attention representations.
- **Classification Output**: Binary softmax probability distribution mapping to `0 = Fake` (Synthetic/Cloned voice) and `1 = Real` (Authentic human voice).
- **Multi-Segment Inference**: For clips exceeding 5 seconds, temporal windowing evaluates beginning, middle, and end segments to detect localized voice cloning within longer conversations.

## 4. Multimodal Explainability for Audio
To ensure full forensic transparency, DeepShieldAI provides three complementary explainability modalities:
1. **Temporal SHAP (`audio_shap.py`)**: Divides the 5-second clip into 12 distinct time segments and fits a Shapley kernel to quantify the exact marginal contribution of each time window toward the final verdict. Time regions exhibiting synthetic vocoder artifacts receive strong attribution weights.
2. **1D Temporal Grad-CAM (`gradcam.py`)**: Computes gradient activations from the final 1D convolutional feature layer of the Wav2Vec2 feature extractor (`conv_layers[-1]`), projecting heatmaps across temporal segments to highlight acoustic anomaly regions.
3. **Audio LIME (`lime_explainer.py`)**: Fits an interpretable local linear surrogate model across perturbed audio chunks to verify decision stability.
