from app.models.report import Report
from app.repositories.prediction_repository import PredictionRepository
from app.repositories.report_repository import ReportRepository
from app.schemas.report import (
    ReportCreate,
    ReportUpdate,
)


class ReportService:

    def __init__(
        self,
        report_repository: ReportRepository,
        prediction_repository: PredictionRepository,
    ):
        self.report_repository = report_repository
        self.prediction_repository = prediction_repository

    def create_report(
        self,
        report_data: ReportCreate,
    ):

        prediction = (
            self.prediction_repository.get_prediction_by_id(
                report_data.prediction_id
            )
        )

        if prediction is None:
            raise ValueError(
                "Prediction not found."
            )

        report = Report(
            prediction_id=report_data.prediction_id,
            report_title=report_data.report_title,
            report_summary=report_data.report_summary,
            report_path=report_data.report_path,
        )

        return self.report_repository.create_report(
            report
        )

    def generate_report(self, prediction_id: int) -> Report:
        prediction = self.prediction_repository.get_prediction_by_id(prediction_id)
        if prediction is None:
            raise ValueError("Prediction not found.")

        doc = prediction.document
        modality = doc.document_type.type_name if doc and doc.document_type else "Media"
        filename = doc.original_file_name if doc else f"Document #{prediction.document_id}"

        title = f"Forensic Assessment Report: {filename} ({prediction.predicted_label})"
        is_fake = prediction.predicted_label in ["Deepfake", "Fake", "CG"]
        if is_fake:
            action_proto = (
                f"Protocol: Immediate quarantine of {modality.lower()} asset. "
                f"Trigger forensic incident log and restrict automated distribution pipelines."
            )
        else:
            action_proto = (
                "Protocol: Integrity verified. Cleared for storage and standard operational processing."
            )

        summary = (
            f"Automated forensic examination for {modality} asset '{filename}'.\n"
            f"Model verdict: {prediction.predicted_label} (Engine: {prediction.model_name}).\n"
            f"Risk Level: {'CRITICAL / SYNTHETIC MANIPULATION' if is_fake else 'LOW / AUTHENTIC BASELINE'}.\n"
            f"{action_proto}"
        )

        report = Report(
            prediction_id=prediction_id,
            report_title=title,
            report_summary=summary,
            report_path=f"/reports/rep_{prediction_id}.pdf",
        )
        return self.report_repository.create_report(report)

    def get_report_by_id(
        self,
        report_id: int,
    ):

        report = (
            self.report_repository.get_report_by_id(
                report_id
            )
        )

        if report is None:
            raise ValueError(
                "Report not found."
            )

        return report

    def get_reports_by_prediction(
        self,
        prediction_id: int,
    ):

        return (
            self.report_repository.get_reports_by_prediction(
                prediction_id
            )
        )

    def get_all_reports(self, skip: int = 0, limit: int = 50, user_id: int | None = None):
        if user_id is not None:
            return self.report_repository.get_reports_by_user(user_id, skip, limit)
        return self.report_repository.get_all_reports(skip, limit)

    def get_reports_by_user(self, user_id: int, skip: int = 0, limit: int = 50):
        return self.report_repository.get_reports_by_user(user_id, skip, limit)

    def update_report(
        self,
        report_id: int,
        updated_data: ReportUpdate,
    ):

        report = (
            self.report_repository.get_report_by_id(
                report_id
            )
        )

        if report is None:
            raise ValueError(
                "Report not found."
            )

        if updated_data.report_title is not None:
            report.report_title = updated_data.report_title

        if updated_data.report_summary is not None:
            report.report_summary = updated_data.report_summary

        if updated_data.report_path is not None:
            report.report_path = updated_data.report_path

        return self.report_repository.update_report(
            report
        )

    def delete_report(
        self,
        report_id: int,
    ):

        report = (
            self.report_repository.get_report_by_id(
                report_id
            )
        )

        if report is None:
            raise ValueError(
                "Report not found."
            )

        self.report_repository.delete_report(
            report
        )

        return {
            "message": "Report deleted successfully."
        }