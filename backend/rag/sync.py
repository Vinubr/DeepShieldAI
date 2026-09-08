"""Automatic synchronization of the repository knowledge-sources folder."""

import hashlib
from pathlib import Path

from rag.ingest import SUPPORTED_TEXT_EXTENSIONS, build_chunks
from rag.store import ChromaStore

SUPPORTED_SOURCE_EXTENSIONS = SUPPORTED_TEXT_EXTENSIONS | {".pdf", ".docx"}


def source_id(path: Path) -> str:
    """Return a stable identifier for a knowledge-source file."""
    return hashlib.sha256(str(path.resolve()).encode("utf-8")).hexdigest()[:24]


def source_fingerprint(path: Path) -> str:
    """Return a content fingerprint used to skip unchanged files."""
    return hashlib.sha256(path.read_bytes()).hexdigest()


def sync_knowledge_sources(
    source_directory: str | Path,
    embedding_model: str = "all-MiniLM-L6-v2",
    chunk_size: int = 500,
) -> dict:
    """Index changed sources and remove vectors for deleted sources."""
    root = Path(source_directory).resolve()
    root.mkdir(parents=True, exist_ok=True)
    store = ChromaStore(embedding_model=embedding_model)
    store._load()

    paths = sorted(
        path
        for path in root.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_SOURCE_EXTENSIONS
    )
    active_ids = {source_id(path) for path in paths}
    indexed = 0
    skipped = 0
    chunks = 0

    existing = store.source_records()
    for path in paths:
        key = source_id(path)
        fingerprint = source_fingerprint(path)
        record = existing.get(key)
        if record and record.get("fingerprint") == fingerprint:
            skipped += 1
            continue

        file_chunks = build_chunks(str(path), chunk_size=chunk_size)
        if not file_chunks:
            store.delete_source(key)
            continue
        chunks += store.add_source_chunks(
            file_chunks,
            source_id=key,
            source_filename=str(path.relative_to(root)),
            fingerprint=fingerprint,
        )
        indexed += 1

    for key in set(existing) - active_ids:
        store.delete_source(key)

    return {
        "directory": str(root),
        "indexed_files": indexed,
        "skipped_files": skipped,
        "removed_files": len(set(existing) - active_ids),
        "chunks": chunks,
        "total_chunks": store.count(),
    }
