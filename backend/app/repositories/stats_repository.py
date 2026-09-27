from datetime import UTC, datetime, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.document import Document
from app.models.document_type import DocumentType
from app.models.knowledge_base import KnowledgeBase
from app.models.prediction import Prediction
from app.models.report import Report


class StatsRepository:
    """
    Read-only aggregate queries for the dashboard.

    Deliberately separate from PredictionRepository: that class owns the
    lifecycle of a single entity, whereas this one spans several tables and
    only ever reads. Mixing the two would make PredictionRepository depend on
    Document, Report and KnowledgeBase for no good reason.
    """

    def __init__(self, db: Session):
        self.db = db

    # ------------------------------------------------------------- totals
    def count_predictions(self, user_id: int | None = None) -> int:
        q = self.db.query(func.count(Prediction.id))
        if user_id is not None:
            q = q.join(Document, Prediction.document_id == Document.id).filter(Document.uploaded_by == user_id)
        return q.scalar() or 0

    def count_documents(self, user_id: int | None = None) -> int:
        q = self.db.query(func.count(Document.id))
        if user_id is not None:
            q = q.filter(Document.uploaded_by == user_id)
        return q.scalar() or 0

    def count_reports(self, user_id: int | None = None) -> int:
        q = self.db.query(func.count(Report.id))
        if user_id is not None:
            q = q.join(Prediction, Report.prediction_id == Prediction.id).join(Document, Prediction.document_id == Document.id).filter(Document.uploaded_by == user_id)
        return q.scalar() or 0

    def count_knowledge_entries(self, user_id: int | None = None) -> int:
        q = self.db.query(func.count(KnowledgeBase.id))
        if user_id is not None:
            q = q.join(Document, KnowledgeBase.document_id == Document.id).filter((Document.uploaded_by == user_id) | (Document.uploaded_by == 1))
        return q.scalar() or 0

    # ------------------------------------------------------------ averages
    def average_confidence(self, user_id: int | None = None) -> float | None:
        q = self.db.query(func.avg(Prediction.confidence_score))
        if user_id is not None:
            q = q.join(Document, Prediction.document_id == Document.id).filter(Document.uploaded_by == user_id)
        value = q.scalar()
        return float(value) if value is not None else None

    def average_processing_time(self, user_id: int | None = None) -> float | None:
        q = self.db.query(func.avg(Prediction.processing_time))
        if user_id is not None:
            q = q.join(Document, Prediction.document_id == Document.id).filter(Document.uploaded_by == user_id)
        value = q.scalar()
        return float(value) if value is not None else None

    # ---------------------------------------------------------- breakdowns
    def _grouped_count(self, column, user_id: int | None = None) -> list[tuple[str, int]]:
        """GROUP BY <column> ORDER BY count DESC — the shape every card wants."""
        q = self.db.query(column, func.count().label("count"))
        if user_id is not None:
            q = q.join(Document, Prediction.document_id == Document.id).filter(Document.uploaded_by == user_id)
        rows = (
            q.group_by(column)
            .order_by(func.count().desc())
            .all()
        )
        return [(str(name), int(count)) for name, count in rows]

    def label_breakdown(self, user_id: int | None = None) -> list[tuple[str, int]]:
        return self._grouped_count(Prediction.predicted_label, user_id=user_id)

    def status_breakdown(self, user_id: int | None = None) -> list[tuple[str, int]]:
        return self._grouped_count(Prediction.processing_status, user_id=user_id)

    def model_breakdown(self, user_id: int | None = None) -> list[tuple[str, int]]:
        return self._grouped_count(Prediction.model_name, user_id=user_id)

    def document_type_breakdown(self, user_id: int | None = None) -> list[tuple[str, int]]:
        q = (
            self.db.query(
                DocumentType.type_name,
                func.count(Document.id).label("count"),
            )
            .join(Document, Document.document_type_id == DocumentType.id)
        )
        if user_id is not None:
            q = q.filter(Document.uploaded_by == user_id)
        rows = (
            q.group_by(DocumentType.type_name)
            .order_by(func.count(Document.id).desc())
            .all()
        )
        return [(str(name), int(count)) for name, count in rows]

    # ------------------------------------------------------------ time series
    def daily_counts(self, days: int = 14, user_id: int | None = None) -> list[tuple[str, int]]:
        """
        Predictions per calendar day over the trailing window.
        """
        since = datetime.now(UTC) - timedelta(days=days)
        day = func.date(Prediction.created_at)

        q = self.db.query(day.label("day"), func.count().label("count")).filter(Prediction.created_at >= since)
        if user_id is not None:
            q = q.join(Document, Prediction.document_id == Document.id).filter(Document.uploaded_by == user_id)

        rows = (
            q.group_by(day)
            .order_by(day)
            .all()
        )
        return [(str(value), int(count)) for value, count in rows]
