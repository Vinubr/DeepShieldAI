"""Query helpers for retrieving cited knowledge passages."""

from .store import ChromaStore


def retrieve(question: str, top_k: int = 5, store: ChromaStore | None = None) -> list[dict]:
    """Retrieve relevant passages; answer generation belongs above this layer."""
    return (store or ChromaStore()).query(question, top_k=top_k)
