from sqlalchemy.orm import Session

from app.models.prediction import Prediction


class PredictionRepository:

    def __init__(self, db: Session):
        self.db = db

    def create_prediction(
        self,
        prediction: Prediction
    ) -> Prediction:

        self.db.add(prediction)
        self.db.commit()
        self.db.refresh(prediction)

        return prediction

    def get_prediction_by_id(
        self,
        prediction_id: int
    ) -> Prediction | None:

        return (
            self.db.query(Prediction)
            .filter(Prediction.id == prediction_id)
            .first()
        )

    def get_predictions_by_document(
        self,
        document_id: int
    ):

        return (
            self.db.query(Prediction)
            .filter(
                Prediction.document_id == document_id
            )
            .order_by(Prediction.created_at.desc())
            .all()
        )

    def get_all_predictions(self, skip: int = 0, limit: int = 50):

        return (
            self.db.query(Prediction)
            .order_by(Prediction.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def get_predictions_by_user(self, user_id: int, skip: int = 0, limit: int = 50):
        from app.models.document import Document
        return (
            self.db.query(Prediction)
            .join(Document, Prediction.document_id == Document.id)
            .filter(Document.uploaded_by == user_id)
            .order_by(Prediction.created_at.desc())
            .offset(skip)
            .limit(limit)
            .all()
        )

    def update_prediction(
        self,
        prediction: Prediction
    ) -> Prediction:

        self.db.commit()
        self.db.refresh(prediction)

        return prediction

    def delete_prediction(
        self,
        prediction: Prediction
    ) -> None:

        self.db.delete(prediction)
        self.db.commit()