# Image Deepfake Forensics and Synthetic Visual Analysis

## 1. Overview and Detection Methodology
DeepShieldAI utilizes a dedicated transfer-learning convolutional neural network built on MobileNetV2 for automated detection of synthetic and AI-manipulated images. The detector differentiates between authentic camera-captured photographs and computer-generated images produced by Generative Adversarial Networks (GANs such as StyleGAN, ProGAN) and Latent Diffusion Models (LDMs such as Stable Diffusion, Midjourney, DALL-E).

## 2. Model Architecture and Processing Pipeline
- **Base Backbone**: Pretrained MobileNetV2 with inverted residual blocks and depthwise separable convolutions.
- **Classification Head**: Global Average Pooling (GAP) → Dropout(0.3) → Dense(128, ReLU) → Dropout(0.2) → Dense(1, Sigmoid).
- **Input Dimensions**: 224×224 pixels RGB normalized by standard `[0, 1]` rescaling (`pixel / 255.0`).
- **Output Probability**: The final sigmoid activation produces $P(\text{Fake})$, where values $\ge 0.50$ indicate synthetic or manipulated imagery and values $< 0.50$ indicate authentic camera captures.

## 3. Key Forensic Indicators and Visual Artifacts
- **Frequency Domain Discrepancies**: Transposed convolutions in GAN upsampling layers create characteristic periodic checkerboard patterns in the 2D Fast Fourier Transform (FFT) spectrum.
- **Corneal and Specular Reflection Inconsistencies**: Synthetic portraits frequently feature mismatched specular highlights in human eyes, inconsistent light source angles, or non-matching iris boundaries.
- **Micro-Texture and Skin Detail Dissolution**: Diffusion models often over-smooth skin surfaces while omitting realistic pores, micro-wrinkles, and fine facial hair roots.
- **Anatomical and Boundary Warping**: Background geometric warping near peripheral boundaries, blending artifacts along collar and jewelry edges, and irregular finger or ear anatomy.

## 4. Explainable AI (XAI) for Image Forensics
- **Grad-CAM**: Generates class-discriminative localization heatmaps from the final convolutional layer (`Conv_1`), highlighting the exact spatial regions (e.g., eyes, mouth perimeter, hair-background boundary) driving the deepfake decision.
- **Kernel SHAP**: Partitions the image into superpixels and computes Shapley attribution values to quantify each visual segment's contribution to the authenticity score.
- **LIME Image Perturbations**: Occludes randomized superpixel patches to train an interpretable local linear surrogate model.
