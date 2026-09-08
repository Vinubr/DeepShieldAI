import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Search,
  Database,
  Layers,
  Plus,
  RefreshCw,
  Trash2,
  Cpu,
} from "lucide-react";
import apiClient, { apiError } from "../api/client";
import {
  Card,
  Button,
  Badge,
  PageHeader,
  EmptyState,
  Alert,
  StatCard,
  Input,
  Select,
  Label,
} from "../components/ui";
import { Skeleton } from "../components/ui/Skeleton";
import { formatRelative } from "../lib/format";

const EMBEDDING_MODELS = [
  "all-MiniLM-L6-v2",
  "all-mpnet-base-v2",
  "bge-small-en-v1.5",
];

export default function Rag() {
  const [entries, setEntries] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [vectorStore, setVectorStore] = useState({ ready: false, loading: true });

  // Index-entry form
  const [showForm, setShowForm] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState(EMBEDDING_MODELS[0]);
  const [chunkSize, setChunkSize] = useState(500);
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError("");
    try {
      const [entriesRes, documentsRes] = await Promise.all([
        apiClient.get("/knowledge-base/"),
        apiClient.get("/documents/", { params: { limit: 100 } }),
      ]);
      setEntries(entriesRes.data);
      setDocuments(documentsRes.data);
      setDocumentId((current) => current || String(documentsRes.data[0]?.id ?? ""));
      const vectorStoreRes = await apiClient.get("/knowledge-base/status");
      setVectorStore({ ...vectorStoreRes.data, loading: false });
    } catch (err) {
      setError(apiError(err, "Unable to load the knowledge base."));
      setVectorStore({ ready: false, loading: false });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const documentNames = useMemo(() => {
    const map = new Map();
    documents.forEach((d) => map.set(d.id, d.original_file_name));
    return map;
  }, [documents]);

  // Lexical filter only. Real semantic search arrives in phase 9 — labelling
  // a substring match as "semantic retrieval" would be a lie.
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return entries;
    return entries.filter((entry) =>
      [
        entry.vector_id,
        entry.embedding_model,
        entry.index_status,
        documentNames.get(entry.document_id),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    );
  }, [entries, query, documentNames]);

  const totalChunks = useMemo(
    () => entries.reduce((sum, entry) => sum + (entry.chunk_count ?? 0), 0),
    [entries]
  );

  const indexedCount = entries.filter(
    (entry) => entry.index_status === "Indexed"
  ).length;

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!documentId) {
      setError("Select a source document.");
      return;
    }

    setSubmitting(true);
    setError("");
    setStatus("");

    try {
      await apiClient.post(`/knowledge-base/ingest/${documentId}`, null, {
        params: {
          embedding_model: embeddingModel,
          chunk_size: Number(chunkSize),
        },
      });
      setStatus("Document indexed successfully.");
      setShowForm(false);
      await load(true);
    } catch (err) {
      setError(apiError(err, "Unable to register this entry."));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    setError("");
    try {
      await apiClient.delete(`/knowledge-base/${id}`);
      await load(true);
    } catch (err) {
      setError(apiError(err, "Delete failed."));
    } finally {
      setDeleting(null);
    }
  };

  const handleQuery = async (event) => {
    event.preventDefault();
    if (!question.trim()) return;

    setSearching(true);
    setError("");
    try {
      const response = await apiClient.post("/knowledge-base/query", {
        question: question.trim(),
        top_k: 3,
      });
      setResults(response.data);
    } catch (err) {
      setResults([]);
      setError(apiError(err, "Unable to search the knowledge base."));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          eyebrow="Retrieval"
          title="Grounded knowledge base"
          description="Sources are synchronized automatically from the repository knowledge folder."
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                loading={refreshing}
                onClick={() => load(true)}
              >
                Refresh
              </Button>
              <Button
                size="sm"
                icon={Plus}
                onClick={() => setShowForm((prev) => !prev)}
              >
                Manual index
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                loading={refreshing}
                onClick={async () => {
                  setRefreshing(true);
                  setError("");
                  try {
                    const response = await apiClient.post("/knowledge-base/sync");
                    setStatus(
                      `Sources synchronized: ${response.data.indexed_files} indexed, ${response.data.skipped_files} unchanged.`
                    );
                    await load(true);
                  } catch (err) {
                    setError(apiError(err, "Unable to synchronize knowledge sources."));
                  } finally {
                    setRefreshing(false);
                  }
                }}
              >
                Sync sources
              </Button>
            </>
          }
        />

        {error && <Alert variant="error">{error}</Alert>}
        {status && <Alert variant="success">{status}</Alert>}

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Entries"
            value={entries.length}
            hint="Registered sources"
            icon={BookOpen}
            accent="neon"
          />
          <StatCard
            label="Indexed"
            value={indexedCount}
            hint="Ready for retrieval"
            icon={Database}
            accent="clear"
          />
          <StatCard
            label="Total chunks"
            value={totalChunks}
            hint="Across all entries"
            icon={Layers}
            accent="volt"
          />
          <StatCard
            label="Vector store"
            value={vectorStore.loading ? "Checking" : vectorStore.ready ? "Ready" : "Offline"}
            hint={vectorStore.ready ? `${vectorStore.chunks ?? 0} stored chunks` : "ChromaDB unavailable"}
            icon={Cpu}
            accent={vectorStore.ready ? "clear" : "caution"}
          />
        </div>

        {showForm && (
          <Card glow>
            <p className="hud-label text-neon-400">Register knowledge entry</p>
            <form
              onSubmit={handleCreate}
              className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            >
              <div>
                <Label htmlFor="document">Source document</Label>
                <Select
                  id="document"
                  value={documentId}
                  onChange={(event) => setDocumentId(event.target.value)}
                >
                  {documents.length === 0 && <option value="">No documents</option>}
                  {documents.map((document) => (
                    <option key={document.id} value={document.id}>
                      #{document.id} · {document.original_file_name}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="model">Embedding model</Label>
                <Select
                  id="model"
                  value={embeddingModel}
                  onChange={(event) => setEmbeddingModel(event.target.value)}
                >
                  {EMBEDDING_MODELS.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="chunks">Chunk size</Label>
                <Input
                  id="chunks"
                  type="number"
                  min="100"
                  max="5000"
                  value={chunkSize}
                  onChange={(event) => setChunkSize(event.target.value)}
                />
              </div>

              <div className="md:col-span-2 xl:col-span-4">
                <Button
                  type="submit"
                  loading={submitting}
                  disabled={documents.length === 0}
                >
                  Register entry
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Query surface */}
        <Card>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0 flex-1">
              <Label htmlFor="question" hint="semantic search">
                Ask the knowledge base
              </Label>
              <form onSubmit={handleQuery} className="flex gap-2">
                <Input
                  id="question"
                  icon={Search}
                  type="search"
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder="e.g. Why can a real image be classified as deepfake?"
                />
                <Button type="submit" loading={searching} disabled={!question.trim()}>
                  Ask
                </Button>
              </form>
            </div>
            <Badge tone="success">ChromaDB retrieval</Badge>
          </div>

          {results.length > 0 && (
            <div className="mt-5 space-y-3">
              <p className="hud-label text-clear-400">Retrieved sources</p>
              {results.map((result, index) => (
                <div key={`${result.metadata?.document_id}-${index}`} className="rounded-xl border border-line/10 bg-void-900/50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-xs text-neon-400">
                      {result.metadata?.source_filename ?? "Unknown source"}
                    </p>
                    {result.metadata?.page_number > 0 && (
                      <Badge tone="neutral">Page {result.metadata.page_number}</Badge>
                    )}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-slate-300">{result.text}</p>
                </div>
              ))}
            </div>
          )}

          <div className="mt-5 border-t border-line/10 pt-5">
            <Label htmlFor="query" hint="metadata only">
              Filter indexed entries
            </Label>
            <Input
              id="query"
              icon={Search}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter by filename, model, or status…"
            />
          </div>
        </Card>

        {/* Entries */}
        <Card padding="p-0">
          <div className="flex items-center justify-between px-6 pb-3 pt-5">
            <p className="hud-label">Registered entries</p>
            <Badge tone="neutral">{filtered.length}</Badge>
          </div>
          <div className="neon-rule" />

          {loading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="divide-y divide-line">
              {filtered.map((entry) => (
                <div
                  key={entry.id}
                  className="group flex flex-wrap items-center gap-4 px-6 py-4 transition hover:bg-hover/[0.03]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-volt-500/25 bg-volt-500/10 text-volt-400">
                    <BookOpen className="h-[18px] w-[18px]" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-200">
                      {documentNames.get(entry.document_id) ??
                        `Document #${entry.document_id}`}
                    </p>
                    <p className="truncate font-mono text-[0.68rem] text-slate-600">
                      {entry.vector_id}
                    </p>
                  </div>

                  <div className="hidden sm:block">
                    <p className="hud-label">Model</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      {entry.embedding_model}
                    </p>
                  </div>

                  <div className="hidden md:block">
                    <p className="hud-label">Chunks</p>
                    <p className="mt-0.5 font-mono text-xs text-slate-400">
                      {entry.chunk_count}
                    </p>
                  </div>

                  <Badge
                    tone={
                      entry.index_status === "Indexed"
                        ? "success"
                        : entry.index_status === "Failed"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {entry.index_status}
                  </Badge>

                  <span className="hidden shrink-0 font-mono text-[0.68rem] text-slate-600 lg:block">
                    {formatRelative(entry.created_at)}
                  </span>

                  <button
                    onClick={() => handleDelete(entry.id)}
                    disabled={deleting === entry.id}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-600 opacity-0 transition hover:bg-threat/10 hover:text-threat focus:opacity-100 group-hover:opacity-100 disabled:opacity-40"
                    aria-label="Delete entry"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6">
              <EmptyState
                icon={BookOpen}
                title={query ? "No matching entries" : "Knowledge base is empty"}
                description={
                  query
                    ? "Try a different term."
                    : "Register an indexed document to enable grounded citations."
                }
                action={
                  !query && (
                    <Button size="sm" icon={Plus} onClick={() => setShowForm(true)}>
                      Index a document
                    </Button>
                  )
                }
              />
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
