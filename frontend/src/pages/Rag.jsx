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
  Copy,
  Check,
  Sparkles,
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

const SUGGESTED_QUERIES = [
  "Why can a genuine review be flagged as computer-generated?",
  "How does MobileNetV2 detect GAN & diffusion artifacts in images?",
  "How does R3D-18 detect deepfake videos through temporal frame analysis?",
  "How does Wav2Vec2 detect synthetic speech and voice cloning?",
  "What is the difference between Grad-CAM, SHAP, and LIME in digital forensics?",
  "What standard operating procedures (SOP) are required for court-admissible evidence?",
];

export default function Rag() {
  const [entries, setEntries] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [results, setResults] = useState([]);
  const [answer, setAnswer] = useState("");
  const [copied, setCopied] = useState(false);
  const [engineType, setEngineType] = useState("");

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [vectorStore, setVectorStore] = useState({ ready: false, loading: true });

  // Index-entry form
  const [showForm, setShowForm] = useState(false);
  const [uploadMode, setUploadMode] = useState("direct"); // "direct" or "existing"
  const [selectedFile, setSelectedFile] = useState(null);
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
      let currentEntries = entriesRes.data || [];
      // Auto-sync system knowledge sources if empty
      if (currentEntries.length === 0) {
        try {
          await apiClient.post("/knowledge-base/sync");
          const reSync = await apiClient.get("/knowledge-base/");
          currentEntries = reSync.data || [];
        } catch (_) {}
      }
      setEntries(currentEntries);
      setDocuments(documentsRes.data || []);
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

    setSubmitting(true);
    setError("");
    setStatus("");

    try {
      let targetDocId = documentId;
      if (uploadMode === "direct") {
        if (!selectedFile) {
          setError("Please select a document file to upload and index.");
          setSubmitting(false);
          return;
        }
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("description", "Directly indexed knowledge source");
        const uploadRes = await apiClient.post("/documents/upload", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        targetDocId = uploadRes.data.id;
      }

      if (!targetDocId) {
        setError("Select a source document or upload a new file.");
        setSubmitting(false);
        return;
      }

      await apiClient.post(`/knowledge-base/ingest/${targetDocId}`, null, {
        params: {
          embedding_model: embeddingModel,
          chunk_size: Number(chunkSize),
        },
      });
      setStatus("Document indexed successfully.");
      setShowForm(false);
      setSelectedFile(null);
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

  const executeSearch = async (queryText) => {
    const targetQ = (queryText !== undefined ? queryText : question).trim();
    if (!targetQ) return;

    setSearching(true);
    setError("");
    try {
      const response = await apiClient.post("/knowledge-base/query", {
        question: targetQ,
        top_k: 6,
      });
      if (response.data && response.data.answer) {
        setAnswer(response.data.answer);
        setResults(response.data.results || []);
        setEngineType(response.data.engine || "local-extractive");
      } else if (Array.isArray(response.data)) {
        setAnswer("");
        setResults(response.data);
        setEngineType("raw-chunks");
      } else {
        setAnswer("");
        setResults([]);
        setEngineType("");
      }
    } catch (err) {
      setAnswer("");
      setResults([]);
      setError(apiError(err, "Unable to search the knowledge base."));
    } finally {
      setSearching(false);
    }
  };

  const handleQuery = async (event) => {
    event.preventDefault();
    executeSearch();
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
            <div className="flex items-center justify-between">
              <p className="hud-label text-neon-400">Register knowledge entry</p>
              <div className="flex rounded-lg border border-line/10 bg-void-950 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setUploadMode("direct")}
                  className={`rounded-md px-3 py-1 font-medium transition ${
                    uploadMode === "direct"
                      ? "bg-neon-500/20 text-neon-300 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Upload & index new file
                </button>
                <button
                  type="button"
                  onClick={() => setUploadMode("existing")}
                  className={`rounded-md px-3 py-1 font-medium transition ${
                    uploadMode === "existing"
                      ? "bg-neon-500/20 text-neon-300 shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  From uploaded documents
                </button>
              </div>
            </div>

            <form
              onSubmit={handleCreate}
              className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
            >
              {uploadMode === "direct" ? (
                <div>
                  <Label htmlFor="direct-file">Document file (.txt, .pdf, .md, .docx)</Label>
                  <input
                    id="direct-file"
                    type="file"
                    accept=".txt,.pdf,.md,.doc,.docx,.csv,.json"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="mt-1 block w-full rounded-xl border border-line/20 bg-void-900/80 px-3 py-2 text-xs text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-volt-500/20 file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-volt-300 hover:file:bg-volt-500/30"
                  />
                </div>
              ) : (
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
              )}

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

              <div className="flex items-end md:col-span-2 xl:col-span-1">
                <Button
                  type="submit"
                  loading={submitting}
                  disabled={uploadMode === "direct" ? !selectedFile : documents.length === 0}
                  className="w-full"
                >
                  {uploadMode === "direct" ? "Upload & Index" : "Register entry"}
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
                  placeholder="e.g. How does MobileNetV2 detect deepfakes or why do GANs leave frequency artifacts?"
                />
                <Button type="submit" loading={searching} disabled={!question.trim()}>
                  Ask
                </Button>
              </form>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="hud-label text-[0.65rem] text-slate-500 mr-1">Suggested inquiries:</span>
                {SUGGESTED_QUERIES.map((sq, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setQuestion(sq);
                      executeSearch(sq);
                    }}
                    className="rounded-lg border border-line/10 bg-void-900/60 px-2.5 py-1 text-[0.72rem] text-slate-300 hover:border-neon-500/40 hover:bg-neon-500/10 hover:text-neon-300 transition"
                  >
                    {sq}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {vectorStore?.grok_enabled ? (
                <Badge tone="primary" className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                  Grok LLM Active ({vectorStore.llm_model || "grok-2"})
                </Badge>
              ) : (
                <Badge tone="neutral">Local ChromaDB Engine</Badge>
              )}
              <Badge tone="success">ChromaDB semantic retrieval</Badge>
            </div>
          </div>

          {answer && (
            <div className="mt-5 rounded-xl border border-neon-500/30 bg-void-900/90 p-5 shadow-lg shadow-neon-500/5 animate-in fade-in duration-300">
              <div className="flex items-center justify-between mb-3 border-b border-line/10 pb-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="success">Grounded Forensic Synthesis</Badge>
                  {engineType === "grok-llm" ? (
                    <Badge tone="primary" className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30">
                      Powered by xAI Grok
                    </Badge>
                  ) : (
                    <Badge tone="neutral">DeepShield Local Engine</Badge>
                  )}
                  <span className="text-xs text-slate-400">Strictly verified against indexed knowledge sources</span>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={copied ? Check : Copy}
                  onClick={() => {
                    navigator.clipboard?.writeText(answer);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }}
                  className="text-xs"
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <div className="whitespace-pre-line text-sm text-slate-200 leading-relaxed font-sans bg-void-950/70 p-4 rounded-lg border border-line/20 font-mono text-[0.84rem]">
                {answer}
              </div>
            </div>
          )}

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
