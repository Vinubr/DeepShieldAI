# Model Technical Specifications

This document provides the technical architecture, training parameters, and input requirements for the DeepShieldAI detector suite.

## 1. Image Model
- **Architecture**: MobileNetV2 (ImageNet, frozen) → GAP → Dropout(0.3) → Dense(128, relu) → Dropout(0.2) → Dense(1, sigmoid).
- **Input**: 224×224×3 RGB.
- **Scaling**: `image / 255.0` → [0, 1].
- **Labels**: `0 = REAL`, `1 = FAKE` (sigmoid output is P(FAKE)).
- **Training**: 500 real + 500 fake; split 800/100/100. 3 epochs, Adam lr 1e-4, batch 16, binary crossentropy.
- **Augmentation**: RandomFlip(horizontal), RandomRotation(0.1), RandomZoom(0.1).

## 2. Audio Model
- **Architecture**: `facebook/wav2vec2-base`, `Wav2Vec2ForSequenceClassification`.
- **Preprocessing**: mono, 16,000 Hz, max 5 s (80,000 samples), `truncation=True, padding="max_length"`.
- **Labels**: `{"fake": 0, "real": 1}` · id2label `{0: "Fake", 1: "Real"}`.
- **Training**: 500 real + 500 fake; 700/150/150 split. 5 epochs, lr 3e-5, batch 8, warmup 0.1, weight decay 0.01, feature encoder frozen.

## 3. Review Model
- **Architecture**: `distilbert-base-uncased`.
- **Tokenization**: `max_length=256`, truncation, dynamic padding (`DataCollatorWithPadding`).
- **Labels**: `{"CG": 0, "OR": 1}` · id2label `{0: "Fake (CG)", 1: "Genuine (OR)"}`.
- **Training**: 40,420 rows (balanced); 28,294 train / 6,063 test. 3 epochs, lr 2e-5, batch 16.

## 4. Text/News Model
- **Architecture**: `distilbert-base-uncased`.
- **Tokenization**: `max_length=256`, truncation, `padding="max_length"`.
- **Labels**: id2label `{0: "FAKE", 1: "REAL"}`.
- **Training**: 3 epochs, lr 2e-5, batch 8.

## 5. Video Model
- **Architecture**: R3D-18 (torchvision, pretrained Kinetics), fc → Linear(512, 2).
- **Preprocessing**: 16 frames uniformly sampled, 224×224, `/255`, then normalized (mean `[0.43216, 0.394666, 0.37645]`, std `[0.22803, 0.22145, 0.216989]`). Tensor shape `(C, T, H, W)`.
- **Labels**: `CLASS_NAMES = ["videos_real", "videos_fake"]` → 0 = real, 1 = fake.
- **Training**: 106 videos total (53 real / 53 fake); 84 train / 11 val / 11 test. 3 epochs, Adam lr 1e-4, batch 4.
