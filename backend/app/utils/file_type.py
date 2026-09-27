from pathlib import Path


class FileType:

    IMAGE_EXTENSIONS = {
        ".jpg",
        ".jpeg",
        ".png",
        ".gif",
        ".bmp",
        ".webp",
    }

    VIDEO_EXTENSIONS = {
        ".mp4",
        ".avi",
        ".mov",
        ".mkv",
        ".wmv",
    }

    AUDIO_EXTENSIONS = {
        ".mp3",
        ".wav",
        ".aac",
        ".flac",
        ".ogg",
    }

    TEXT_EXTENSIONS = {
        ".txt",
        ".pdf",
        ".doc",
        ".docx",
        ".csv",
        ".json",
        ".xml",
        ".md",
    }

    @staticmethod
    def get_document_type(file_name: str) -> str:
        """
        Returns:
            Image | Video | Audio | Text
        """

        extension = Path(file_name).suffix.lower()

        if extension in FileType.IMAGE_EXTENSIONS:
            return "Image"

        if extension in FileType.VIDEO_EXTENSIONS:
            return "Video"

        if extension in FileType.AUDIO_EXTENSIONS:
            return "Audio"

        if extension in FileType.TEXT_EXTENSIONS:
            return "Text"

        raise ValueError("Unsupported file type")

    @staticmethod
    def get_upload_folder(file_name: str) -> str:
        """
        Returns upload folder name.
        """

        document_type = FileType.get_document_type(file_name)

        folders = {
            "Image": "images",
            "Video": "videos",
            "Audio": "audio",
            "Text": "text",
        }

        return folders[document_type]