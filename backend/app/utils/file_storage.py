import os
import shutil
import uuid
from pathlib import Path

from fastapi import UploadFile

# Base upload directory
UPLOAD_DIR = Path("uploads")


class FileStorage:

    @staticmethod
    def create_upload_directories() -> None:
        """
        Create all required upload folders.
        """

        folders = [
            "images",
            "videos",
            "audio",
            "text",
            "reports",
            "xai",
        ]

        for folder in folders:
            (UPLOAD_DIR / folder).mkdir(
                parents=True,
                exist_ok=True,
            )

    @staticmethod
    def save_file(
        file: UploadFile,
        folder: str,
    ) -> tuple[str, str]:

        extension = os.path.splitext(
            file.filename
        )[1]

        unique_filename = (
            f"{uuid.uuid4()}{extension}"
        )

        destination = (
            UPLOAD_DIR
            / folder
            / unique_filename
        )

        with destination.open("wb") as buffer:
            shutil.copyfileobj(
                file.file,
                buffer,
            )

        return (
            unique_filename,
            str(destination),
        )

    @staticmethod
    def delete_file(
        file_path: str,
    ) -> None:
        try:
            path = Path(file_path)
            if path.exists() and path.is_file():
                path.unlink()
        except Exception:
            pass