"""ChromaDB persistence for embedded knowledge chunks."""

from pathlib import Path


class ChromaStore:
    """Small wrapper around ChromaDB and sentence-transformers."""

    _embedders = {}

    def __init__(self, persist_directory: str | None = None, embedding_model: str = "all-MiniLM-L6-v2"):
        backend_root = Path(__file__).resolve().parents[1]
        self.persist_directory = Path(persist_directory) if persist_directory else backend_root / "storage" / "chroma"
        self.embedding_model_name = embedding_model
        self._collection = None
        self._embedder = None

    def _load(self) -> None:
        if self._collection is not None:
            return
        try:
            import chromadb
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError(
                "Install chromadb and sentence-transformers before using RAG."
            ) from exc

        self.persist_directory.mkdir(parents=True, exist_ok=True)
        client = chromadb.PersistentClient(path=str(self.persist_directory))
        self._collection = client.get_or_create_collection("deepshield_knowledge")
        cache_key = (str(self.persist_directory), self.embedding_model_name)
        self._embedder = self._embedders.get(cache_key)
        if self._embedder is None:
            self._embedder = SentenceTransformer(self.embedding_model_name)
            self._embedders[cache_key] = self._embedder

    def add_chunks(self, chunks: list[dict], document_id: int, source_filename: str) -> int:
        """Embed and persist chunks for one source document."""
        self._load()
        self.delete_document(document_id)
        if not chunks:
            return 0

        ids = [f"doc-{document_id}-chunk-{index}" for index in range(len(chunks))]
        texts = [chunk["text"] for chunk in chunks]
        embeddings = self._embedder.encode(texts).tolist()
        metadatas = [
            {
                "document_id": document_id,
                "source_filename": source_filename,
                "page_number": chunk.get("page_number") or 0,
            }
            for chunk in chunks
        ]
        self._collection.upsert(ids=ids, documents=texts, embeddings=embeddings, metadatas=metadatas)
        return len(texts)

    def add_source_chunks(
        self,
        chunks: list[dict],
        source_id: str,
        source_filename: str,
        fingerprint: str,
    ) -> int:
        """Replace all vectors for one automatically indexed source file."""
        self._load()
        self.delete_source(source_id)
        ids = [f"source-{source_id}-chunk-{index}" for index in range(len(chunks))]
        texts = [chunk["text"] for chunk in chunks]
        embeddings = self._embedder.encode(texts).tolist()
        metadatas = [
            {
                "source_id": source_id,
                "source_filename": source_filename,
                "fingerprint": fingerprint,
                "page_number": chunk.get("page_number") or 0,
            }
            for chunk in chunks
        ]
        self._collection.upsert(
            ids=ids,
            documents=texts,
            embeddings=embeddings,
            metadatas=metadatas,
        )
        return len(texts)

    def delete_document(self, document_id: int) -> None:
        """Remove every stored chunk belonging to a source document."""
        self._load()
        self._collection.delete(where={"document_id": document_id})

    def delete_source(self, source_id: str) -> None:
        """Remove all vectors belonging to one automatically indexed source."""
        self._load()
        self._collection.delete(where={"source_id": source_id})

    def source_records(self) -> dict[str, dict]:
        """Return fingerprints for automatically indexed sources."""
        self._load()
        records = self._collection.get(include=["metadatas"]).get("metadatas", [])
        result = {}
        for metadata in records:
            source_id = metadata.get("source_id") if metadata else None
            if source_id:
                result[source_id] = metadata
        return result

    def count(self) -> int:
        self._load()
        return self._collection.count()

    def query(self, question: str, top_k: int = 5) -> list[dict]:
        """Return the nearest chunks with source metadata."""
        self._load()
        if not question.strip():
            return []
        if self._collection.count() == 0:
            return []

        embedding = self._embedder.encode([question]).tolist()
        result = self._collection.query(
            query_embeddings=embedding,
            n_results=min(max(top_k * 5, 1), self._collection.count()),
        )
        documents = result.get("documents", [[]])[0]
        metadatas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]

        # Keep chunks from both official knowledge sources and user-indexed documents
        filtered_results = [
            {"text": text, "metadata": metadata, "distance": distance}
            for text, metadata, distance in zip(documents, metadatas, distances)
            if metadata
        ]

        return filtered_results[:top_k]
