# Video Deepfake Forensics and Spatiotemporal Analysis

## 1. Overview and Detection Methodology
DeepShieldAI employs an end-to-end 3D Convolutional Neural Network (R3D-18) to analyze both spatial facial features and temporal inter-frame consistency in digital video recordings. The detector identifies synthetic face swaps, reenactment manipulations, and neural lip-sync modifications.

## 2. Model Architecture and Spatiotemporal Pipeline
- **Backbone**: Pretrained 3D ResNet-18 (torchvision `r3d_18`) with spatiotemporal residual blocks that compute 3D convolutions across $(C, T, H, W)$.
- **Temporal Frame Sampling**: 16 uniformly sampled frames across the video duration to capture dynamic motions, blinks, and micro-expressions.
- **Frame Preprocessing**: 224×224 resolution, normalized with standard video tensors (mean `[0.432, 0.395, 0.376]`, std `[0.228, 0.221, 0.217]`).
- **Classification Head**: Global 3D pooling followed by a linear layer projecting to 2 classes: `videos_real` (0) and `videos_fake` (1).
- **Decision Threshold**: Probability threshold set to 0.60 to minimize false positives in high-compression video streams.

## 3. Key Video Forensic Artifacts
- **Temporal Flicker and Jitter**: Inconsistent frame-to-frame rendering of hair strands, teeth textures, and lighting highlights causing high-frequency temporal flicker.
- **Facial Boundary and Blending Seams**: Warping along facial perimeters, jawline blending halos, and skin-tone mismatches between the synthetic face mask and the underlying real body.
- **Blink and Micro-Expression Dynamics**: Unnatural, rigid, or absent blink rates and non-physiological eye saccades.
- **Audio-Visual Asynchrony**: Inconsistencies between phoneme pronunciation mouth shapes and temporal audio waveforms.

## 4. Spatiotemporal Explainability
- **3D Grad-CAM**: Extracts gradient activations from the final 3D convolutional stage (`layer4`), projecting saliency heatmaps across all 16 keyframes to pinpoint both where and when manipulation occurs.
- **Temporal Attribution**: Identifies the specific frames containing the highest concentration of blending seams or neural artifacts.
