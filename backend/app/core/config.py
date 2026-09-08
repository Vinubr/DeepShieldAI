from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Centralised application configuration (12-Factor: config in the environment).

    Every value here is overridable by an environment variable of the same
    name, which is what makes the same image runnable in dev, CI and prod.
    """

    # ---------- Application ----------
    PROJECT_NAME: str = "DeepShieldAI API"
    VERSION: str = "1.0.0"
    API_PREFIX: str = "/api"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # ---------- Database ----------
    DATABASE_URL: str
    SQL_ECHO: bool = False
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 10

    # ---------- Security ----------
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ---------- CORS ----------
    # Comma-separated list, e.g. "http://localhost:5173,https://app.example.com"
    CORS_ORIGINS: str = "http://localhost:5173"

    # ---------- Storage ----------
    UPLOAD_DIR: str = "uploads"
    MAX_UPLOAD_SIZE_MB: int = 100
    KNOWLEDGE_SOURCE_DIR: str = "../knowledge-sources"
    RAG_EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
    RAG_CHUNK_SIZE: int = 150

    # ---------- ML ----------
    MODEL_DIR: str = "models"
    INFERENCE_DEVICE: str = "cpu"          # "cuda" if a GPU is available

    # Image detector (Keras / MobileNetV2, trained artefact `best_model.keras`)
    IMAGE_MODEL_PATH: str = "models/image/best_model.keras"
    IMAGE_INPUT_SIZE: int = 224

    # CONFIRMED from Image_Training_Model.ipynb (cell 13):
    #     image = tf.cast(image, tf.float32) / 255.0
    # The notebook scaled to [0, 1] — NOT MobileNetV2's usual [-1, 1]
    # preprocess_input. Using the wrong one degrades accuracy silently.
    IMAGE_PREPROCESS_MODE: str = "rescale"

    # CONFIRMED from the notebook (cell 11):  label 0 = REAL, label 1 = FAKE
    # and LABEL_NAMES = {0: "REAL", 1: "FAKE"}.
    # The head is Dense(1, sigmoid), so the raw output is P(FAKE).
    # A high sigmoid therefore means Deepfake, not Genuine.
    IMAGE_POSITIVE_LABEL: str = "Deepfake"
    IMAGE_NEGATIVE_LABEL: str = "Genuine"
    IMAGE_DECISION_THRESHOLD: float = 0.5

    # Audio detector (wav2vec2-base, fine-tuned; trained artefact
    # `Models/audio_model/` -> config.json + model.safetensors +
    # preprocessor_config.json, copied locally to AUDIO_MODEL_PATH).
    #
    # No positive/negative label settings here, unlike Image: transformers
    # persists `id2label` inside config.json at save time, so
    # audio_detector.py reads the label mapping from the checkpoint itself
    # instead of hardcoding it — see audio_detector.py's docstring.
    AUDIO_MODEL_PATH: str = "models/audio"

    # CONFIRMED from Audio_Model_Training.ipynb: librosa-loaded, mono,
    # resampled to 16000 Hz, every clip fixed to 5s (80000 samples) before
    # the feature extractor. Must match at inference or predictions are
    # out-of-distribution for the classifier head.
    AUDIO_SAMPLE_RATE: int = 16_000
    AUDIO_MAX_SECONDS: float = 5.0

    # Video detector (R3D-18, fine-tuned via selective layer4 unfreezing;
    # trained artefact `Models/video_model/video_model_finetuned.pth` +
    # `class_names.pkl`, copied locally to VIDEO_MODEL_PATH /
    # VIDEO_CLASS_NAMES_PATH). See docs/MODELS.md and
    # PROJECT_STATUS_RECHECK for how this model went from unusable
    # (F1 0.385) to a genuine, if still small-sample, 0.75 test accuracy.
    VIDEO_MODEL_PATH: str = "models/video/video_model_finetuned.pth"
    VIDEO_CLASS_NAMES_PATH: str = "models/video/class_names.pkl"

    # CONFIRMED from DeepShieldAI_Video_Retraining.ipynb: 16 frames
    # uniformly sampled per clip, 224x224.
    VIDEO_NUM_FRAMES: int = 16
    VIDEO_FRAME_SIZE: int = 224

    # Text detector (distilbert-base-uncased, fine-tuned for news/AI-text
    # classification; trained artefact `checkpoints/text/`, copied locally
    # to TEXT_MODEL_PATH). No positive/negative label settings, same reason
    # as Audio: transformers persists id2label in config.json, so
    # text_detector.py reads it from the checkpoint instead of hardcoding it.
    TEXT_MODEL_PATH: str = "models/text"

    # CONFIRMED from DeepShield_Text_Training(news and text).ipynb:
    # max_length=256, padding="max_length", truncation=True.
    TEXT_MAX_LENGTH: int = 256

    # Review detector (distilbert-base-uncased, fine-tuned for fake vs.
    # genuine product/service reviews; trained artefact
    # `Models/review_model/`, copied locally to REVIEW_MODEL_PATH). Same
    # checkpoint-native label pattern as Audio/Text: id2label lives in
    # config.json, review_detector.py reads it rather than hardcoding it.
    #
    # CONFIRMED from Review_Model_Training.ipynb: max_length=256, truncation,
    # dynamic padding (DataCollatorWithPadding) rather than a fixed
    # max_length pad. For a single inference request (batch of one) dynamic
    # padding just means "pad to that input's own length", so
    # review_detector.py tokenizes with padding=True rather than
    # padding="max_length" to mirror training as closely as possible.
    #
    # Known limitation, not a bug — recorded here so it isn't rediscovered
    # the hard way during a demo: on held-out data (n=6063) this model
    # scores F1 0.973, but the training notebook's own ad-hoc examples show
    # it misclassifies obviously spammy, hand-written reviews as genuine
    # with high confidence. It has learned this dataset's specific
    # machine-generated style, not "fake review" as a general concept.
    REVIEW_MODEL_PATH: str = "models/review"
    REVIEW_MAX_LENGTH: int = 256

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [
            origin.strip()
            for origin in self.CORS_ORIGINS.split(",")
            if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    """Cached accessor — Settings is parsed once per process."""
    return Settings()


settings = get_settings()
