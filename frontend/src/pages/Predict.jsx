import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ScanSearch,
  Search,
  UploadCloud,
  Cpu,
  Radar,
  ServerCog,
  RefreshCw,
  FileStack,
  ExternalLink,
  Eye,
  Download,
  Maximize2,
  X,
  Music,
  File,
  Trash2,
  Copy,
  Check,
  ClipboardPaste,
} from "lucide-react";
import apiClient, { apiError } from "../api/client";
import {
  Card,
  Button,
  Badge,
  PageHeader,
  EmptyState,
  Alert,
  Input,
  Label,
  Textarea,
  Segmented,
} from "../components/ui";
import { Skeleton } from "../components/ui/Skeleton";
import { verdictOf, statusTone } from "../lib/verdict";
import {
  formatBytes,
  formatRelative,
  formatSeconds,
  fileMeta,
  getDocumentFileUrl,
} from "../lib/format";

export default function Predict() {
  const [documents, setDocuments] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [history, setHistory] = useState([]);
  const [result, setResult] = useState(null);

  const [query, setQuery] = useState("");
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [actionStatus, setActionStatus] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  // Set when the API answers 503 — an unloaded model is a distinct state
  // from a failure, and the UI should say so rather than showing a red error.
  const [engineOffline, setEngineOffline] = useState("");
  // Live registry status from GET /predictions/models.
  const [models, setModels] = useState([]);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [copiedInline, setCopiedInline] = useState(false);

  const handlePastedCreated = async (newDoc) => {
    await loadDocuments();
    setSelectedId(newDoc.id);
    setActionStatus(`Document #${newDoc.id} (${newDoc.original_file_name}) ingested and selected.`);
  };

  const loadDocuments = useCallback(async () => {
    setLoadingDocs(true);
    try {
      const response = await apiClient.get("/documents/", {
        params: { limit: 100 },
      });
      setDocuments(response.data);
      setSelectedId((current) => current ?? response.data[0]?.id ?? null);
    } catch (err) {
      setError(apiError(err, "Unable to load documents."));
    } finally {
      setLoadingDocs(false);
    }
  }, []);

  const handleDeleteDocument = async (docId, e) => {
    if (e) e.stopPropagation();
    if (
      !window.confirm(
        "Are you sure you want to delete this document? Any predictions and reports associated with it will also be deleted."
      )
    ) {
      return;
    }

    setDeletingId(docId);
    setError("");
    setActionStatus("");
    try {
      await apiClient.delete(`/documents/${docId}`);
      setActionStatus(`Document #${docId} removed successfully.`);
      if (selectedId === docId) {
        setSelectedId(null);
        setResult(null);
        setHistory([]);
        setTextContent("");
        setShowPreviewModal(false);
      }
      const response = await apiClient.get("/documents/", {
        params: { limit: 100 },
      });
      setDocuments(response.data);
      if (selectedId === docId) {
        setSelectedId(response.data[0]?.id ?? null);
      }
    } catch (err) {
      setError(apiError(err, "Failed to delete document."));
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Which detectors are actually loaded on the server right now.
  useEffect(() => {
    apiClient
      .get("/predictions/models")
      .then((response) => setModels(response.data.detectors ?? []))
      .catch(() => setModels([]));
  }, []);

  // Prior runs for the selected document.
  useEffect(() => {
    if (!selectedId) {
      setHistory([]);
      return;
    }

    let cancelled = false;
    setLoadingHistory(true);
    setResult(null);
    setEngineOffline("");

    apiClient
      .get(`/predictions/document/${selectedId}`)
      .then((response) => {
        if (!cancelled) setHistory(response.data);
      })
      .catch(() => {
        if (!cancelled) setHistory([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return documents;
    return documents.filter((document) =>
      document.original_file_name.toLowerCase().includes(term)
    );
  }, [documents, query]);

  const selected = documents.find((document) => document.id === selectedId);

  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [textContent, setTextContent] = useState("");
  const [loadingText, setLoadingText] = useState(false);

  const selectedMeta = useMemo(() => {
    return selected ? fileMeta(selected.original_file_name) : null;
  }, [selected]);

  const fileUrl = useMemo(() => {
    return selectedId ? getDocumentFileUrl(selectedId) : "";
  }, [selectedId]);

  useEffect(() => {
    if (!selected || selectedMeta?.type !== "Text") {
      setTextContent("");
      setLoadingText(false);
      return;
    }

    let cancelled = false;
    setLoadingText(true);
    apiClient
      .get(`/documents/${selected.id}/content`)
      .then((res) => {
        if (!cancelled) setTextContent(res.data.content || "");
      })
      .catch(() => {
        if (!cancelled) setTextContent("");
      })
      .finally(() => {
        if (!cancelled) setLoadingText(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected, selectedMeta]);

  const handleAnalyze = async () => {
    if (!selectedId) return;

    setAnalyzing(true);
    setError("");
    setEngineOffline("");
    setResult(null);

    try {
      const response = await apiClient.post(`/predictions/analyze/${selectedId}`);
      setResult(response.data);
      const refreshed = await apiClient.get(
        `/predictions/document/${selectedId}`
      );
      setHistory(refreshed.data);
    } catch (err) {
      if (err.response?.status === 503) {
        setEngineOffline(apiError(err));
      } else {
        setError(apiError(err, "Analysis request failed."));
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const latest = result ?? history[0] ?? null;
  const verdict = verdictOf(latest?.predicted_label);
  const VerdictIcon = verdict.icon;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          eyebrow="Inference"
          title="Run detection on ingested media"
          description="Select a document and dispatch it to the multimodal detection pipeline."
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={loadDocuments}
              >
                Reload
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={ClipboardPaste}
                onClick={() => setShowPasteModal(true)}
              >
                Paste Text
              </Button>
              <Button as={Link} to="/upload" size="sm" icon={UploadCloud}>
                Upload
              </Button>
            </>
          }
        />

        {error && <Alert variant="error">{error}</Alert>}
        {actionStatus && <Alert variant="success">{actionStatus}</Alert>}

        <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
          {/* Document picker */}
          <Card padding="p-0" className="flex max-h-[36rem] flex-col">
            <div className="px-5 pb-3 pt-5">
              <div className="flex items-center justify-between">
                <p className="hud-label text-neon-400">Select target</p>
                <Badge tone="neutral">{filtered.length}</Badge>
              </div>
              <div className="mt-3">
                <Input
                  icon={Search}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by filename…"
                  type="search"
                />
              </div>
            </div>
            <div className="neon-rule" />

            <div className="flex-1 divide-y divide-line overflow-y-auto">
              {loadingDocs ? (
                <div className="space-y-3 p-5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : filtered.length > 0 ? (
                filtered.map((document) => {
                  const meta = fileMeta(document.original_file_name);
                  const Icon = meta.icon;
                  const active = document.id === selectedId;

                  return (
                    <button
                      key={document.id}
                      onClick={() => setSelectedId(document.id)}
                      className={`flex w-full items-center gap-3 px-5 py-3 text-left transition ${
                        active
                          ? "bg-gradient-to-r from-neon-500/15 to-transparent"
                          : "hover:bg-hover/[0.03]"
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${meta.accent}`}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-semibold ${
                            active ? "text-slate-50" : "text-slate-300"
                          }`}
                        >
                          {document.original_file_name}
                        </p>
                        <p className="font-mono text-[0.68rem] text-slate-600">
                          #{document.id} · {formatBytes(document.file_size)} ·{" "}
                          {meta.type}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            window.open(getDocumentFileUrl(document.id), "_blank");
                          }}
                          title={`Open ${document.original_file_name} in new tab`}
                          className="flex items-center gap-1.5 rounded-xl border border-line bg-void-700 px-2.5 py-1 text-[0.7rem] font-semibold text-slate-300 transition hover:border-line-strong hover:bg-void-600 hover:text-neon-400"
                        >
                          <ExternalLink className="h-3 w-3" />
                          <span>Open</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteDocument(document.id, e)}
                          disabled={deletingId === document.id}
                          title={`Delete ${document.original_file_name}`}
                          className="flex h-7 w-7 items-center justify-center rounded-xl border border-line bg-void-700 text-slate-400 transition hover:border-threat/50 hover:bg-threat/10 hover:text-threat disabled:opacity-40"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                        {active && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-neon-500 shadow-[0_0_8px_rgba(0,117,255,0.7)]" />
                        )}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="p-5">
                  <EmptyState
                    icon={FileStack}
                    title={query ? "No matches" : "No documents ingested"}
                    description={
                      query
                        ? "Try a different filename."
                        : "Upload a file before running detection."
                    }
                    action={
                      !query && (
                        <Button as={Link} to="/upload" size="sm" icon={UploadCloud}>
                          Upload a file
                        </Button>
                      )
                    }
                  />
                </div>
              )}
            </div>
          </Card>

          {/* Analysis panel */}
          <div className="space-y-5">
            <Card glow>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="hud-label text-volt-400">Analysis target</p>
                  <p className="mt-2.5 truncate font-display text-lg font-bold text-slate-50">
                    {selected?.original_file_name ?? "No document selected"}
                  </p>
                  {selected && (
                    <p className="mt-1 font-mono text-xs text-slate-500">
                      {fileMeta(selected.original_file_name).type} ·{" "}
                      {formatBytes(selected.file_size)} · uploaded{" "}
                      {formatRelative(selected.uploaded_at)}
                    </p>
                  )}
                </div>

                <Button
                  size="lg"
                  icon={!analyzing ? Radar : undefined}
                  loading={analyzing}
                  disabled={!selectedId}
                  onClick={handleAnalyze}
                >
                  {analyzing ? "Analyzing…" : "Run detection"}
                </Button>
              </div>

              {/* Media Preview & File Opener */}
              {selected && (
                <div className="mt-5 rounded-2xl border border-line bg-void-800/80 p-4 shadow-card transition duration-200 hover:border-line-strong">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-xl border ${selectedMeta?.accent}`}
                      >
                        {selectedMeta && (
                          <selectedMeta.icon className="h-4 w-4" />
                        )}
                      </div>
                      <div>
                        <p className="hud-label text-neon-400">Media Preview</p>
                        <p className="font-mono text-xs text-slate-400">
                          {selectedMeta?.type} · {formatBytes(selected.file_size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={Eye}
                        onClick={() => setShowPreviewModal(true)}
                      >
                        Preview
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        icon={ExternalLink}
                        onClick={() => window.open(fileUrl, "_blank")}
                      >
                        Open File
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon={Download}
                        title="Download original file"
                        onClick={() =>
                          window.open(
                            getDocumentFileUrl(selected.id, true),
                            "_blank"
                          )
                        }
                        className="px-3"
                      />
                      <Button
                        type="button"
                        variant="outlineDanger"
                        size="sm"
                        icon={Trash2}
                        loading={deletingId === selected.id}
                        title="Delete this uploaded file"
                        onClick={(e) => handleDeleteDocument(selected.id, e)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3">
                    {selectedMeta?.type === "Image" && (
                      <div
                        onClick={() => setShowPreviewModal(true)}
                        className="group relative flex max-h-56 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-line bg-void-900 transition hover:border-neon-500/40"
                      >
                        <img
                          src={fileUrl}
                          alt={selected.original_file_name}
                          className="max-h-56 w-auto object-contain transition duration-200 group-hover:scale-[1.02]"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-void-900/60 opacity-0 transition group-hover:opacity-100">
                          <span className="flex items-center gap-1.5 rounded-xl border border-line bg-void-800/95 px-3 py-1.5 text-xs font-semibold text-slate-200 shadow-card">
                            <Maximize2 className="h-3.5 w-3.5 text-neon-400" /> Click to view full image
                          </span>
                        </div>
                      </div>
                    )}

                    {selectedMeta?.type === "Video" && (
                      <div className="overflow-hidden rounded-xl border border-line bg-black">
                        <video
                          controls
                          src={fileUrl}
                          className="max-h-60 w-full object-contain"
                        >
                          Your browser does not support HTML video.
                        </video>
                      </div>
                    )}

                    {selectedMeta?.type === "Audio" && (
                      <div className="rounded-xl border border-line bg-void-900 p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-volt-500/25 bg-volt-500/10 text-volt-400">
                            <Music className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-semibold text-slate-200">
                              {selected.original_file_name}
                            </p>
                            <p className="font-mono text-[0.68rem] text-slate-500">
                              Audio playback ready
                            </p>
                          </div>
                        </div>
                        <audio controls className="mt-3 w-full" src={fileUrl}>
                          Your browser does not support HTML audio.
                        </audio>
                      </div>
                    )}

                    {selectedMeta?.type === "Text" && (
                      <div className="rounded-xl border border-line bg-void-900 p-3.5 font-mono text-xs text-slate-300">
                        {loadingText ? (
                          <div className="space-y-2 py-2">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-4 w-full" />
                            <Skeleton className="h-4 w-2/3" />
                          </div>
                        ) : textContent ? (
                          <div className="space-y-3">
                            <div className="flex items-center justify-between border-b border-line/60 pb-2">
                              <span className="font-mono text-[0.7rem] text-slate-400">
                                {textContent.length.toLocaleString()} chars · {textContent.trim().split(/\s+/).filter(Boolean).length.toLocaleString()} words
                              </span>
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                icon={copiedInline ? Check : Copy}
                                onClick={() => {
                                  navigator.clipboard.writeText(textContent);
                                  setCopiedInline(true);
                                  setTimeout(() => setCopiedInline(false), 2000);
                                }}
                                className="h-7 px-2.5 text-xs"
                              >
                                {copiedInline ? "Copied!" : "Copy Text"}
                              </Button>
                            </div>
                            <p className="line-clamp-5 select-text whitespace-pre-wrap leading-relaxed text-slate-200 selection:bg-neon-500/30">
                              {textContent}
                            </p>
                            <div className="flex items-center justify-between pt-1">
                              <button
                                type="button"
                                onClick={() => setShowPreviewModal(true)}
                                className="text-[0.72rem] text-neon-400 hover:underline"
                              >
                                View full text & copy in modal →
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between py-1">
                            <p className="text-slate-500">
                              {selected.original_file_name}
                            </p>
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              icon={ExternalLink}
                              onClick={() => window.open(fileUrl, "_blank")}
                            >
                              Open Text File
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {selectedMeta?.type === "Unknown" && (
                      <div className="flex items-center justify-between rounded-xl border border-line bg-void-900 p-3.5">
                        <div className="flex items-center gap-2.5">
                          <File className="h-5 w-5 text-slate-500" />
                          <p className="text-xs text-slate-300">
                            {selected.original_file_name}
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          icon={ExternalLink}
                          onClick={() => window.open(fileUrl, "_blank")}
                        >
                          Open File
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {engineOffline && (
                <Alert
                  variant="pending"
                  title="Detector unavailable for this file type"
                  className="mt-5"
                >
                  {engineOffline}
                </Alert>
              )}

              {latest ? (
                <div className="mt-5 rounded-2xl border border-line/10 bg-void-900/50 p-5">
                  <div className="flex items-center justify-between">
                    <p className="hud-label">
                      {result ? "Result" : "Most recent run"}
                    </p>
                    <Badge tone={statusTone(latest.processing_status)} dot>
                      {latest.processing_status}
                    </Badge>
                  </div>

                  <div className="mt-4 flex items-center gap-4">
                    <div
                      className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${verdict.ring}`}
                    >
                      <VerdictIcon className="h-7 w-7" strokeWidth={2} />
                    </div>
                    <div className="min-w-0">
                      <p
                        className={`font-display text-2xl font-bold ${verdict.text} text-glow`}
                      >
                        {latest.predicted_label}
                      </p>
                      <p className="truncate font-mono text-xs text-slate-500">
                        {latest.model_name} ·{" "}
                        {formatSeconds(latest.processing_time)}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                !engineOffline && (
                  <div className="mt-5 rounded-2xl border border-dashed border-line/10 bg-void-900/40 p-8 text-center">
                    <ScanSearch className="mx-auto h-8 w-8 text-slate-700" />
                    <p className="mt-3 text-sm font-semibold text-slate-400">
                      No result for this document
                    </p>
                    <p className="mt-1 text-sm text-slate-600">
                      Run detection to produce a verdict.
                    </p>
                  </div>
                )
              )}
            </Card>

            {/* Detector registry — live status straight from the server */}
            <Card>
              <div className="flex items-center justify-between">
                <div>
                  <p className="hud-label text-neon-400">Detector registry</p>
                  <p className="mt-1.5 text-xs text-slate-400">
                    Models currently loaded in the API process
                  </p>
                </div>
                <Badge tone={models.some((m) => m.ready) ? "success" : "warning"}>
                  {models.filter((m) => m.ready).length}/{models.length} ready
                </Badge>
              </div>

              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                {models.length > 0 ? (
                  models.map((model) => (
                    <div
                      key={model.modality}
                      className="flex items-start gap-3 rounded-xl border border-line/8 bg-void-700/40 px-3.5 py-3 transition-all duration-200 hover:-translate-y-0.5 hover:border-neon-500/30"
                      title={model.error ?? undefined}
                    >
                      {model.ready ? (
                        <Cpu className="mt-0.5 h-4 w-4 shrink-0 text-clear" />
                      ) : (
                        <ServerCog className="mt-0.5 h-4 w-4 shrink-0 text-slate-600" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p
                          className={`truncate text-sm font-semibold ${
                            model.ready ? "text-slate-100" : "text-slate-500"
                          }`}
                        >
                          {model.modality}
                        </p>
                        <p className="truncate font-mono text-[0.64rem] text-slate-600">
                          {model.model_name}
                        </p>
                        {!model.ready && model.error && (
                          <p className="mt-1 line-clamp-2 text-[0.66rem] leading-snug text-caution/80">
                            {model.error}
                          </p>
                        )}
                      </div>
                      <Badge tone={model.ready ? "success" : "neutral"}>
                        {model.ready ? "live" : "offline"}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="col-span-full py-4 text-center text-sm text-slate-500">
                    Registry status unavailable.
                  </p>
                )}
              </div>
            </Card>

            {/* Prior runs for this document */}
            <Card padding="p-0">
              <div className="flex items-center justify-between px-6 pb-3 pt-5">
                <p className="hud-label">Run history for this document</p>
                <Badge tone="neutral">{history.length}</Badge>
              </div>
              <div className="neon-rule" />

              <div className="max-h-64 divide-y divide-line overflow-y-auto">
                {loadingHistory ? (
                  <div className="space-y-3 p-5">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : history.length > 0 ? (
                  history.map((run) => {
                    const runVerdict = verdictOf(run.predicted_label);
                    return (
                      <div
                        key={run.id}
                        className="flex items-center gap-3 px-6 py-3"
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full`}
                          style={{ backgroundColor: runVerdict.chart }}
                        />
                        <span
                          className={`w-28 shrink-0 text-sm font-semibold ${runVerdict.text}`}
                        >
                          {run.predicted_label}
                        </span>
                        <span className="hidden min-w-0 flex-1 truncate font-mono text-xs text-slate-600 sm:block">
                          {run.model_name}
                        </span>
                        <span className="ml-auto shrink-0 font-mono text-[0.68rem] text-slate-600">
                          {formatRelative(run.created_at)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-5">
                    <EmptyState
                      icon={Radar}
                      title="No previous runs"
                      description="Results for this document will be listed here."
                    />
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>

        {showPreviewModal && (
          <FilePreviewModal
            document={selected}
            onClose={() => setShowPreviewModal(false)}
            onDelete={() => handleDeleteDocument(selected?.id)}
          />
        )}

        {showPasteModal && (
          <PasteTextModal
            onClose={() => setShowPasteModal(false)}
            onCreated={handlePastedCreated}
          />
        )}
      </div>
    </div>
  );
}

function FilePreviewModal({ document, onClose, onDelete }) {
  if (!document) return null;
  const meta = fileMeta(document.original_file_name);
  const fileUrl = getDocumentFileUrl(document.id);
  const downloadUrl = getDocumentFileUrl(document.id, true);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const Icon = meta.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-4xl flex-col space-y-4 overflow-hidden rounded-2xl border border-line bg-void-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line pb-4">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${meta.accent}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate font-display text-base font-bold text-slate-100">
                {document.original_file_name}
              </h3>
              <p className="font-mono text-xs text-slate-400">
                {meta.type} · {formatBytes(document.file_size)} · #{document.id}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              icon={ExternalLink}
              onClick={() => window.open(fileUrl, "_blank")}
            >
              Open File
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon={Download}
              onClick={() => window.open(downloadUrl, "_blank")}
            >
              Download
            </Button>
            {onDelete && (
              <Button
                size="sm"
                variant="outlineDanger"
                icon={Trash2}
                onClick={onDelete}
              >
                Delete
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-line bg-void-700 text-slate-400 transition hover:border-line-strong hover:bg-void-600 hover:text-slate-100"
              title="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="flex min-h-[16rem] max-h-[70vh] flex-1 items-center justify-center overflow-auto rounded-xl border border-line bg-void-900/60 p-4">
          {meta.type === "Image" && (
            <img
              src={fileUrl}
              alt={document.original_file_name}
              className="max-h-[65vh] w-auto max-w-full rounded-lg object-contain shadow-card"
            />
          )}
          {meta.type === "Video" && (
            <video
              controls
              autoPlay
              src={fileUrl}
              className="max-h-[65vh] w-full max-w-3xl rounded-lg bg-black object-contain shadow-card"
            >
              Your browser does not support video playback.
            </video>
          )}
          {meta.type === "Audio" && (
            <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-void-700 p-6 text-center">
              <Music className="mx-auto h-12 w-12 text-volt-400" />
              <p className="text-sm font-semibold text-slate-200">
                {document.original_file_name}
              </p>
              <audio controls autoPlay className="w-full" src={fileUrl} />
            </div>
          )}
          {meta.type === "Text" && (
            <TextFileViewer documentId={document.id} fileUrl={fileUrl} />
          )}
          {meta.type === "Unknown" && (
            <div className="space-y-3 p-6 text-center">
              <File className="mx-auto h-10 w-10 text-slate-500" />
              <p className="text-sm text-slate-300">
                Preview not supported for this file type.
              </p>
              <Button
                size="sm"
                variant="primary"
                icon={ExternalLink}
                onClick={() => window.open(fileUrl, "_blank")}
              >
                Open File
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TextFileViewer({ documentId, fileUrl }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get(`/documents/${documentId}/content`)
      .then((res) => {
        if (!cancelled) setContent(res.data.content);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="w-full space-y-2 p-6">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
      </div>
    );
  }

  if (error || !content) {
    return (
      <div className="space-y-3 p-6 text-center">
        <p className="text-xs text-slate-400">Could not extract readable text from document.</p>
        <Button
          size="sm"
          variant="primary"
          icon={ExternalLink}
          onClick={() => window.open(fileUrl, "_blank")}
        >
          Open File Directly
        </Button>
      </div>
    );
  }

  const wordCount = content.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="flex w-full flex-col space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-line bg-void-800/90 px-4 py-2 text-xs">
        <span className="font-mono text-slate-400">
          {content.length.toLocaleString()} characters · {wordCount.toLocaleString()} words
        </span>
        <Button
          size="sm"
          variant={copied ? "primary" : "secondary"}
          icon={copied ? Check : Copy}
          onClick={handleCopy}
          className="h-8 text-xs font-semibold"
        >
          {copied ? "Copied to Clipboard!" : "Copy Entire Text"}
        </Button>
      </div>
      <div className="max-h-[55vh] w-full select-text overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-void-900/90 p-5 font-mono text-xs leading-relaxed text-slate-200 selection:bg-neon-500/30">
        {content}
      </div>
    </div>
  );
}

function PasteTextModal({ onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [category, setCategory] = useState("review");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handlePasteFromClipboard = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (clip) {
        setText(clip);
        if (!title) {
          const firstLine = clip.trim().split("\n")[0].slice(0, 35);
          setTitle(firstLine || "Pasted text");
        }
      }
    } catch {
      // Permission denied
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!text.trim()) {
      setError("Please paste or type text first.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await apiClient.post("/documents/paste", {
        title: title.trim() || undefined,
        text: text.trim(),
        category,
      });
      onCreated(res.data);
      onClose();
    } catch (err) {
      setError(apiError(err, "Failed to ingest pasted text."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col space-y-4 overflow-hidden rounded-2xl border border-line bg-void-800 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-neon-500/25 bg-neon-500/10 text-neon-400">
              <ClipboardPaste className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-base font-bold text-slate-100">
                Paste Text for Instant Detection
              </h3>
              <p className="font-mono text-xs text-slate-400">
                Directly ingest & analyze review or article text without a file
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-line bg-void-700 text-slate-400 hover:text-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 overflow-y-auto pr-1">
          {error && <Alert variant="error">{error}</Alert>}

          <div>
            <Label hint="optional title or label">Document Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Amazon Earbuds Review or Tech News Article"
            />
          </div>

          <div>
            <Label hint="select classification model">What kind of text is this?</Label>
            <Segmented
              options={[
                { value: "review", label: "Product / Service Review (Review Model)" },
                { value: "text", label: "News / Article (Text Model)" },
              ]}
              value={category}
              onChange={setCategory}
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="paste-modal-text">Text Content</Label>
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                className="flex items-center gap-1 text-xs font-semibold text-neon-400 hover:underline"
              >
                <ClipboardPaste className="h-3.5 w-3.5" />
                Paste from Clipboard
              </button>
            </div>
            <Textarea
              id="paste-modal-text"
              rows={8}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste text here..."
              className="font-mono text-xs leading-relaxed"
            />
            <div className="mt-1 flex justify-between font-mono text-[0.7rem] text-slate-500">
              <span>{text.length} chars</span>
              <span>{text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0} words</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 border-t border-line pt-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={loading}
              disabled={!text.trim()}
              icon={!loading ? ClipboardPaste : undefined}
            >
              {loading ? "Ingesting…" : "Ingest & Select for Detection"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
