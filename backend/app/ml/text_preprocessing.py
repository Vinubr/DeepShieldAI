"""
Text loading for the DistilBERT news/misinformation detector.

Scope, deliberately: `FileType.TEXT_EXTENSIONS` (see
`app/utils/file_type.py`) covers .txt, .pdf, .doc, .docx, .csv, .json and
.xml — but the model only ever saw plain UTF-8 text at training time
(DeepShield_Text_Training(news and text).ipynb loads rows from a CSV's
text column). Silently feeding it raw PDF/DOCX bytes decoded as text would
not error — it would produce garbage tokens and a confident, meaningless
prediction, which is worse than refusing. Real document parsing (PDF/DOCX
extraction) is explicitly out of scope for Phase 6 and belongs with the RAG
ingestion work in Phase 9, which already needs a PDF parser (`pypdf`, see
requirements/ml.txt) for a different reason.
"""

from pathlib import Path

#: Extensions this detector will actually read as text. A narrower set than
#: FileType.TEXT_EXTENSIONS on purpose — see module docstring.
PLAIN_TEXT_EXTENSIONS = {
    ".txt", ".csv", ".tsv", ".json", ".xml", ".md", ".rtf", ".html", ".htm"
}
DOCUMENT_EXTENSIONS = {".pdf", ".docx", ".doc"}
ALL_TEXT_EXTENSIONS = PLAIN_TEXT_EXTENSIONS | DOCUMENT_EXTENSIONS

#: A DistilBERT model trained with max_length=256 sees nothing past ~1500-2000
#: characters anyway (subword tokens, not characters) — this is just a sane
#: cap so a multi-megabyte upload doesn't get read into memory in full before
#: being truncated by the tokenizer regardless.
MAX_CHARS = 20_000


def load_text(file_path: str) -> str:
    """Read a file as UTF-8 text, supporting plain text, markdown, and documents (PDF/DOCX/DOC)."""
    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(f"Text file not found: {file_path}")

    suffix = path.suffix.lower()
    if suffix in DOCUMENT_EXTENSIONS or suffix in {".pdf", ".docx", ".doc"}:
        from rag.ingest import extract_text
        pages = extract_text(str(path))
        text = "\n\n".join(p[0] for p in pages if p[0].strip())
    elif suffix in PLAIN_TEXT_EXTENSIONS:
        from rag.ingest import extract_text
        pages = extract_text(str(path))
        text = pages[0][0] if pages else ""
    else:
        # Fallback reading
        try:
            text = path.read_text(encoding="utf-8", errors="replace")
        except Exception:
            raise ValueError(
                f"'{path.suffix}' is not supported for automated text "
                "extraction — supported formats are "
                f"({', '.join(sorted(ALL_TEXT_EXTENSIONS))})."
            )

    if not text.strip():
        raise ValueError(f"No extractable text found in file: {file_path}")

    return text[:MAX_CHARS]

