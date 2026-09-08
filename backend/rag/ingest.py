"""Extract and split knowledge documents before vector indexing."""

from pathlib import Path

SUPPORTED_TEXT_EXTENSIONS = {".txt", ".md", ".csv", ".json", ".xml"}


def extract_text(file_path: str) -> list[tuple[str, int | None]]:
    """Return (text, page_number) pairs from a supported source file."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Knowledge source not found: {file_path}")

    suffix = path.suffix.lower()
    if suffix in SUPPORTED_TEXT_EXTENSIONS:
        return [(path.read_text(encoding="utf-8", errors="replace"), None)]

    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("Install pypdf to ingest PDF knowledge sources.") from exc
        reader = PdfReader(str(path))
        return [((page.extract_text() or ""), index + 1) for index, page in enumerate(reader.pages)]

    if suffix == ".docx":
        try:
            from docx import Document
        except ImportError as exc:
            raise RuntimeError("Install python-docx to ingest DOCX knowledge sources.") from exc
        document = Document(str(path))
        return [("\n".join(paragraph.text for paragraph in document.paragraphs), None)]

    raise ValueError(f"Unsupported knowledge source type: {suffix}")


def split_text(text: str, chunk_size: int = 800, overlap: int = 120) -> list[str]:
    """Split text into overlapping word-based chunks."""
    if chunk_size <= 0 or overlap < 0 or overlap >= chunk_size:
        raise ValueError("chunk_size must be positive and overlap must be smaller than chunk_size")

    words = text.split()
    chunks = []
    step = chunk_size - overlap
    for start in range(0, len(words), step):
        chunk = " ".join(words[start : start + chunk_size]).strip()
        if chunk:
            chunks.append(chunk)
        if start + chunk_size >= len(words):
            break
    return chunks


def build_chunks(file_path: str, chunk_size: int = 800, overlap: int = 120) -> list[dict]:
    """Extract a source and return chunks with citation metadata."""
    chunks = []
    for text, page_number in extract_text(file_path):
        for chunk in split_text(text, chunk_size=chunk_size, overlap=overlap):
            chunks.append({"text": chunk, "page_number": page_number})
    return chunks
