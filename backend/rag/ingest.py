"""Extract and split knowledge documents before vector indexing."""

from pathlib import Path

import re

SUPPORTED_TEXT_EXTENSIONS = {
    ".txt", ".md", ".csv", ".tsv", ".json", ".xml", ".rtf", ".html", ".htm"
}


def clean_document_text(text: str) -> str:
    """Normalize extracted document text while preserving paragraphs and lists."""
    if not text:
        return ""

    text = text.replace("\u200b", "").replace("\xa0", " ").replace("\x0c", "\n")

    # If the text has words broken on every line (common with some PDF text streams)
    raw_lines = [line.strip() for line in text.splitlines()]
    non_empty = [l for l in raw_lines if l]

    if non_empty and (sum(len(l.split()) for l in non_empty) / len(non_empty)) < 2.0:
        out = []
        for word in non_empty:
            if word in [":", ";", ",", ".", "!", "?", "%"]:
                if out:
                    out[-1] += word
                else:
                    out.append(word)
            elif word.startswith(("•", "-", "*", "●", "▪", "–")) or re.match(r"^\d+[\.\)]$", word):
                out.append("\n" + word)
            elif word in ["Title:", "Verdict:", "Rating:", "Summary:", "Overview:"]:
                if out and not out[-1].endswith("\n"):
                    out.append("\n\n" + word)
                else:
                    out.append(word)
            else:
                out.append(word)
        joined = " ".join(out)
        joined = re.sub(r" \n", "\n", joined)
        joined = re.sub(r"\n ", "\n", joined)
        joined = re.sub(r"\n{3,}", "\n\n", joined)
        text = joined
    else:
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


def extract_text(file_path: str) -> list[tuple[str, int | None]]:
    """Return (text, page_number) pairs from a supported source file."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"Knowledge source not found: {file_path}")

    suffix = path.suffix.lower()

    if suffix in SUPPORTED_TEXT_EXTENSIONS:
        raw = path.read_text(encoding="utf-8", errors="replace")
        if suffix in {".html", ".htm"}:
            raw = re.sub(r"<[^>]+>", " ", raw)
        elif suffix == ".rtf":
            raw = re.sub(r"\\[a-zA-Z0-9\-]+ ?|\{|\}", " ", raw)
        return [(clean_document_text(raw), None)]

    if suffix == ".pdf":
        try:
            from pypdf import PdfReader
        except ImportError as exc:
            raise RuntimeError("Install pypdf to ingest PDF knowledge sources.") from exc
        reader = PdfReader(str(path))
        pages = []
        for index, page in enumerate(reader.pages):
            raw_page = page.extract_text() or ""
            cleaned = clean_document_text(raw_page)
            if cleaned:
                pages.append((cleaned, index + 1))
        if not pages:
            # Fallback if pages returned empty
            pages.append(("", 1))
        return pages

    if suffix in {".docx", ".doc"}:
        try:
            from docx import Document
            document = Document(str(path))
            paragraphs = [p.text.strip() for p in document.paragraphs if p.text.strip()]
            cleaned = clean_document_text("\n\n".join(paragraphs))
            return [(cleaned, None)]
        except Exception as docx_err:
            if suffix == ".doc":
                # Fallback text extraction for legacy binary .doc files
                try:
                    data = path.read_bytes()
                    # Extract printable character sequences
                    matches = re.findall(rb"[\x20-\x7E\s]{4,}", data)
                    extracted = b" ".join(matches).decode("ascii", errors="replace")
                    cleaned = clean_document_text(extracted)
                    if cleaned:
                        return [(cleaned, None)]
                except Exception:
                    pass
            raise RuntimeError(f"Failed to extract document text: {docx_err}") from docx_err

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
