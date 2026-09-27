import os
import re
from typing import Any
import requests
from app.core.config import settings
from app.core.logging import get_logger
from .store import ChromaStore

logger = get_logger(__name__)

STOP_WORDS = {
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "has", "he", "in", "is", "it", "its", "of", "on", "that", "the",
    "to", "was", "were", "will", "with", "what", "why", "how", "when",
    "where", "who", "which", "can", "could", "should", "would", "does", "do"
}


def clean_sentence(sentence: str) -> str:
    """Clean markdown and formatting artifacts from an extracted sentence."""
    s = re.sub(r"^[\s\-*#>\d.]+", "", sentence).strip()
    s = re.sub(r"\*\*|\*", "", s)
    s = re.sub(r"`[^`]*`", "", s)
    s = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def synthesize_grok_answer(question: str, chunks: list[dict], sources_list: list[str]) -> str | None:
    """
    Synthesize an authoritative, strictly grounded forensic answer using xAI Grok API.
    Returns None if no API key is set, or if an API / network error occurs,
    triggering seamless fallback to local extractive synthesis.
    """
    api_key = (
        getattr(settings, "GROK_API_KEY", "")
        or getattr(settings, "XAI_API_KEY", "")
        or os.getenv("GROK_API_KEY", "")
        or os.getenv("XAI_API_KEY", "")
    ).strip()

    if not api_key:
        return None

    # Construct context blocks from retrieved chunks
    context_blocks = []
    for idx, chunk in enumerate(chunks, 1):
        meta = chunk.get("metadata", {})
        src = meta.get("source_filename") or (f"Document #{meta.get('document_id')}" if "document_id" in meta else f"Document #{idx}")
        page = meta.get("page_number", 0)
        src_label = f"{src} (Page {page})" if page > 0 else src
        text = chunk.get("text", "").strip()
        context_blocks.append(f"--- Document Source {idx}: {src_label} ---\n{text}")

    context_str = "\n\n".join(context_blocks)

    system_prompt = (
        "You are DeepShieldAI Forensic Intelligence Assistant, a digital multimedia forensics and security expert. "
        "Your role is to provide authoritative, accurate, and deeply informative explanations of deepfake detection methodologies "
        "(image, video, audio, text, and deceptive reviews), explainable AI (Grad-CAM, SHAP, LIME), model architectures, and investigation SOPs.\n\n"
        "STRICT GROUNDING & CITATION RULES:\n"
        "1. Base your answer STRICTLY and EXCLUSIVELY on the provided Context Documents.\n"
        "2. If the user's question cannot be answered from the provided context, output EXACTLY:\n"
        "   Answer:\n"
        "   - The requested information was not found in the indexed knowledge base documents.\n\n"
        "   Sources:\n"
        "   - None\n"
        "3. When answering, structure your output strictly with the 'Answer:' header followed by 3 to 6 rich, informative bullet points:\n"
        "   Answer:\n"
        "   - Point 1: [Primary detection mechanism, mathematical basis, or key architectural component]\n"
        "   - Point 2: [Specific forensic artifacts, anomalies, or telemetry metrics observed]\n"
        "   - Point 3: [Model behavior, training dataset nuances, or explainability method details]\n"
        "   - Point 4: [Optional: Actionable security protocol or procedural recommendation]\n\n"
        "   Sources:\n"
        "   - [source_file_1]\n"
        "   - [source_file_2]\n"
        "4. Never hallucinate metrics, models, or citations not present in the provided context."
    )

    user_prompt = (
        f"Context Documents:\n{context_str}\n\n"
        f"Question: {question}\n\n"
        "Please provide your grounded forensic synthesis following the specified format:"
    )

    api_base = getattr(settings, "GROK_API_BASE", "https://api.x.ai/v1").rstrip("/")
    model = getattr(settings, "GROK_MODEL", "grok-2-latest")

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "temperature": 0.15,
        "max_tokens": 800,
    }

    try:
        url = f"{api_base}/chat/completions"
        resp = requests.post(url, headers=headers, json=payload, timeout=12)
        if resp.status_code == 200:
            data = resp.json()
            content = data["choices"][0]["message"]["content"].strip()
            # Verify and enforce format compliance
            if not content.startswith("Answer:"):
                content = "Answer:\n" + content
            if "Sources:" not in content and sources_list:
                content += "\n\nSources:\n" + "\n".join(f"- {s}" for s in sources_list)
            logger.info("Grok LLM synthesis generated successfully using %s", model)
            return content
        else:
            logger.warning(
                "Grok API returned status %s (%s). Falling back to local extractive engine.",
                resp.status_code,
                resp.text[:180],
            )
            return None
    except Exception as exc:
        logger.warning("Grok API call failed (%s). Falling back to local extractive engine.", exc)
        return None


def synthesize_bullet_answer(question: str, chunks: list[dict]) -> dict[str, Any]:
    """
    Generate a concise, human-understandable answer strictly grounded in
    retrieved knowledge base chunks, formatted as:

    Answer:
    - Point 1: ...
    - Point 2: ...
    - Point 3: ...

    Sources:
    - Document name (Page/Section)
    """
    if not question.strip() or not chunks:
        return {
            "answer": "Answer:\n- The requested information was not found in the indexed knowledge base documents.\n\nSources:\n- None",
            "sources": [],
            "results": [],
            "total_results": 0,
        }

    # Extract non-stop query terms
    query_tokens = {
        w.lower()
        for w in re.findall(r"\b[a-zA-Z0-9'-]+\b", question)
        if w.lower() not in STOP_WORDS and len(w) > 2
    }

    # Verify minimum retrieval confidence / relevance
    best_distance = chunks[0].get("distance", 1.0)
    has_token_overlap = any(
        any(term in chunk["text"].lower() for term in query_tokens)
        for chunk in chunks
    ) if query_tokens else True

    # Only fall back if completely out-of-domain (distance > 1.65 and no keyword overlap)
    if best_distance > 1.65 and not has_token_overlap:
        return {
            "answer": "Answer:\n- The requested information was not found in the indexed knowledge base documents.\n\nSources:\n- None",
            "sources": [],
            "results": chunks,
            "total_results": len(chunks),
        }

    # Extract sentences and score relevance
    scored_points: list[tuple[float, str, str]] = []
    seen_texts: set[str] = set()
    sources_set: set[str] = set()

    for chunk in chunks:
        text = chunk.get("text", "")
        meta = chunk.get("metadata", {})
        doc_name = meta.get("source_filename") or (f"Document #{meta['document_id']}" if "document_id" in meta else "Knowledge Base")
        page = meta.get("page_number", 0)
        source_label = f"{doc_name} (Page {page})" if page > 0 else doc_name
        sources_set.add(source_label)

    sources_list = sorted(sources_set)

    # 1. Attempt Grok LLM synthesis if API key is configured
    grok_answer = synthesize_grok_answer(question, chunks, sources_list)
    if grok_answer:
        return {
            "answer": grok_answer,
            "sources": sources_list,
            "results": chunks,
            "total_results": len(chunks),
            "engine": "grok-llm",
        }

    # 2. Local extractive sentence ranking (high-performance offline fallback)
    for chunk in chunks:
        text = chunk.get("text", "")
        meta = chunk.get("metadata", {})
        doc_name = meta.get("source_filename") or (f"Document #{meta['document_id']}" if "document_id" in meta else "Knowledge Base")
        page = meta.get("page_number", 0)
        source_label = f"{doc_name} (Page {page})" if page > 0 else doc_name
        chunk_dist = chunk.get("distance", 1.2)
        relevance_boost = max(0.0, 1.6 - chunk_dist) * 2.0

        # Split into distinct sentences / lines
        lines = [line.strip() for line in re.split(r"(?<=[.!?])\s+|\n+", text) if line.strip()]
        for line in lines:
            cleaned = clean_sentence(line)
            if len(cleaned) < 20 or len(cleaned) > 420:
                continue

            cleaned_lower = cleaned.lower()
            if cleaned_lower in seen_texts:
                continue

            overlap = sum(1 for term in query_tokens if term in cleaned_lower)
            # Favor informative sentences with substance and top-ranking chunk distance
            score = (overlap * 3.0) + relevance_boost
            if any(term in cleaned_lower for term in ["because", "due to", "uses", "works", "detector", "accuracy", "model", "limitation", "result", "feature", "frequency", "temporal", "spectral", "gradient", "f1", "entropy", "artifact", "phase", "layer"]):
                score += 1.0

            if score > 0 or len(scored_points) < 3:
                seen_texts.add(cleaned_lower)
                scored_points.append((score, cleaned, source_label))

    scored_points.sort(key=lambda x: x[0], reverse=True)
    selected_points = scored_points[:5]

    if not selected_points:
        top_snippet = clean_sentence(chunks[0]["text"][:280])
        if top_snippet:
            selected_points = [(1.0, top_snippet, next(iter(sources_set), "Knowledge Base"))]

    if not selected_points:
        return {
            "answer": "Answer:\n- The requested information was not found in the indexed knowledge base documents.\n\nSources:\n- None",
            "sources": [],
            "results": chunks,
            "total_results": len(chunks),
        }

    # Format the final response
    answer_lines = ["Answer:"]
    for i, (_, point, _) in enumerate(selected_points, start=1):
        answer_lines.append(f"- Point {i}: {point}")

    answer_lines.append("\nSources:")
    sources_list = sorted(sources_set)
    for src in sources_list:
        answer_lines.append(f"- {src}")

    return {
        "answer": "\n".join(answer_lines),
        "sources": sources_list,
        "results": chunks,
        "total_results": len(chunks),
        "engine": "local-extractive",
    }


class RAGQueryEngine:
    """Wrapper that combines vector retrieval with grounded bullet synthesis."""

    def __init__(self, store: ChromaStore | None = None):
        self.store = store or ChromaStore()

    def query(self, question: str, top_k: int = 6) -> dict[str, Any]:
        chunks = self.store.query(question, top_k=top_k)
        return synthesize_bullet_answer(question, chunks)


def retrieve(question: str, top_k: int = 5, store: ChromaStore | None = None) -> list[dict]:
    """Retrieve raw relevant passages."""
    return (store or ChromaStore()).query(question, top_k=top_k)
