from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import settings

# Importing the model package registers every mapper with the Base metadata
# before any query is compiled. Without this, relationship() strings like
# "Report" cannot be resolved and SQLAlchemy raises InvalidRequestError.
import app.models  # noqa: F401

if settings.DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        settings.DATABASE_URL,
        echo=settings.SQL_ECHO,
        connect_args={"check_same_thread": False},
    )
else:
    engine = create_engine(
        settings.DATABASE_URL,
        echo=settings.SQL_ECHO,
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_pre_ping=True,   # transparently recycles connections dropped by the DB
    )

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency: one Session per request, always closed."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
