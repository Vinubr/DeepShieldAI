import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  UploadCloud,
  X,
  Clock3,
  ScanSearch,
  Trash2,
  HardDrive,
  ShieldCheck,
  ExternalLink,
  ClipboardPaste,
  Copy,
  Check,
  FileText,
} from "lucide-react";
import apiClient, { apiError } from "../api/client";
import {
  Card,
  Button,
  Badge,
  PageHeader,
  EmptyState,
  Alert,
  Label,
  Input,
  Textarea,
  Segmented,
} from "../components/ui";
import { Skeleton } from "../components/ui/Skeleton";
import {
  formatBytes,
  formatRelative,
  fileMeta,
  getDocumentFileUrl,
} from "../lib/format";

const ACCEPTED = [
  { type: "Image", exts: "JPG · PNG · WEBP · BMP" },
  { type: "Video", exts: "MP4 · MKV · AVI · MOV" },
  { type: "Audio", exts: "MP3 · WAV · AAC · FLAC" },
  { type: "Text", exts: "TXT · PDF · DOCX · DOC · CSV · MD · RTF" },
];

export default function Upload() {
  const [ingestMode, setIngestMode] = useState("file"); // "file" | "paste"
  const [file, setFile] = useState(null);
  const [description, setDescription] = useState("");
  const [pastedTitle, setPastedTitle] = useState("");
  const [pastedText, setPastedText] = useState("");
  const [pastedCategory, setPastedCategory] = useState("review");
  const [pasting, setPasting] = useState(false);
  const [lastIngestedId, setLastIngestedId] = useState(null);
  const [documents, setDocuments] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [inputKey, setInputKey] = useState(() => Date.now());
  const [deletingId, setDeletingId] = useState(null);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [contentCategory, setContentCategory] = useState("text");

  const dragCounter = useRef(0);
  const navigate = useNavigate();

  const loadDocuments = useCallback(async () => {
    try {
      const response = await apiClient.get("/documents/", {
        params: { limit: 50 },
      });
      setDocuments(response.data);
    } catch (err) {
      setError(apiError(err, "Unable to load documents."));
    } finally {
      setListLoading(false);
    }
  }, []);

  const loadDocumentTypes = useCallback(async () => {
    try {
      const response = await apiClient.get("/document-types/");
      setDocumentTypes(response.data);
    } catch {
      // Non-fatal — worst case the Text/Review choice below can't resolve
      // an id and upload falls back to the auto-detected type.
    }
  }, []);

  useEffect(() => {
    loadDocuments();
    loadDocumentTypes();
  }, [loadDocuments, loadDocumentTypes]);

  const handleFile = (selected) => {
    if (!selected) return;
    setFile(selected);
    setStatus("");
    setError("");
  };

  // A counter is needed because dragleave fires for every child element the
  // pointer crosses; a naive boolean makes the highlight flicker.
  const onDragEnter = (event) => {
    event.preventDefault();
    dragCounter.current += 1;
    setDragActive(true);
  };

  const onDragLeave = (event) => {
    event.preventDefault();
    dragCounter.current -= 1;
    if (dragCounter.current <= 0) setDragActive(false);
  };

  const onDrop = (event) => {
    event.preventDefault();
    dragCounter.current = 0;
    setDragActive(false);
    handleFile(event.dataTransfer.files?.[0]);
  };

  const resetForm = () => {
    setFile(null);
    setDescription("");
    setContentCategory("text");
    setInputKey(Date.now());
    setProgress(0);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!file) {
      setError("Select a file before uploading.");
      return;
    }

    setError("");
    setStatus("");
    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (description) formData.append("description", description);

      const response = await apiClient.post("/documents/upload", formData, {
        onUploadProgress: (event) => {
          if (!event.total) return;
          setProgress(Math.round((event.loaded * 100) / event.total));
        },
      });

      let ingestedAs = "Text";

      if (selectedMeta?.type === "Text" && contentCategory === "review") {
        const reviewType = documentTypes.find(
          (type) => type.type_name === "Review"
        );

        if (reviewType) {
          await apiClient.patch(`/documents/${response.data.id}`, {
            document_type_id: reviewType.id,
          });
          ingestedAs = "Review";
        }
        // If the Review type isn't found (types failed to load), the
        // document stays typed as Text rather than silently failing the
        // whole upload — the user can still fix it from the document list.
      }

      setStatus(
        `"${response.data.original_file_name}" ingested as document #${response.data.id} (${ingestedAs}).`
      );
      setLastIngestedId(response.data.id);
      resetForm();
      await loadDocuments();
    } catch (err) {
      setError(apiError(err, "Upload failed."));
    } finally {
      setUploading(false);
    }
  };

  const handlePasteSubmit = async (event) => {
    event.preventDefault();
    if (!pastedText.trim()) {
      setError("Please paste or type text before submitting.");
      return;
    }

    setError("");
    setStatus("");
    setPasting(true);

    try {
      const response = await apiClient.post("/documents/paste", {
        title: pastedTitle.trim() || undefined,
        text: pastedText.trim(),
        category: pastedCategory,
        description: description || undefined,
      });

      const ingestedAs = pastedCategory === "review" ? "Review" : "Text";
      setStatus(
        `"${response.data.original_file_name}" ingested as document #${response.data.id} (${ingestedAs}).`
      );
      setLastIngestedId(response.data.id);
      setPastedText("");
      setPastedTitle("");
      setDescription("");
      await loadDocuments();
    } catch (err) {
      setError(apiError(err, "Failed to ingest pasted text."));
    } finally {
      setPasting(false);
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPastedText(text);
        if (!pastedTitle) {
          const firstLine = text.trim().split("\n")[0].slice(0, 35);
          setPastedTitle(firstLine || "Pasted text");
        }
      }
    } catch {
      setError("Clipboard read permission was denied. You can press Ctrl+V directly inside the text box.");
    }
  };

  const handleDelete = async (documentId) => {
    if (
      !window.confirm(
        "Are you sure you want to delete this document? Any predictions and reports associated with it will also be deleted."
      )
    ) {
      return;
    }
    setDeletingId(documentId);
    setError("");
    try {
      await apiClient.delete(`/documents/${documentId}`);
      setStatus(`Document #${documentId} removed successfully.`);
      await loadDocuments();
    } catch (err) {
      setError(apiError(err, "Unable to delete this document."));
    } finally {
      setDeletingId(null);
    }
  };

  const selectedMeta = file ? fileMeta(file.name) : null;
  const SelectedIcon = selectedMeta?.icon;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <PageHeader
          eyebrow="Ingestion"
          title="Submit media for verification"
          description="Files are stored server-side, typed by extension, and queued for multimodal analysis."
          actions={
            <Button
              variant="secondary"
              size="sm"
              icon={ScanSearch}
              onClick={() => navigate("/predict")}
            >
              Go to Analyze
            </Button>
          }
        />

        <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
          <Card>
            {/* Mode Switcher Tabs */}
            <div className="mb-6 flex rounded-2xl border border-line bg-void-900/80 p-1.5 shadow-inner">
              <button
                type="button"
                onClick={() => {
                  setIngestMode("file");
                  setError("");
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition ${
                  ingestMode === "file"
                    ? "border border-neon-500/30 bg-void-700 text-neon-400 shadow-card"
                    : "text-slate-400 hover:bg-void-800/60 hover:text-slate-200"
                }`}
              >
                <UploadCloud className="h-4 w-4" />
                Upload File (PDF, DOCX, TXT, Media)
              </button>
              <button
                type="button"
                onClick={() => {
                  setIngestMode("paste");
                  setError("");
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-semibold transition ${
                  ingestMode === "paste"
                    ? "border border-neon-500/30 bg-void-700 text-neon-400 shadow-card"
                    : "text-slate-400 hover:bg-void-800/60 hover:text-slate-200"
                }`}
              >
                <ClipboardPaste className="h-4 w-4" />
                Paste Text Directly
              </button>
            </div>

            {ingestMode === "file" ? (
              <form onSubmit={handleSubmit} className="space-y-5">
                <label
                  onDragOver={(event) => event.preventDefault()}
                  onDragEnter={onDragEnter}
                  onDragLeave={onDragLeave}
                  onDrop={onDrop}
                  className={`relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-all ${
                    dragActive
                      ? "border-neon-500/70 bg-neon-500/5"
                      : "border-line/12 bg-void-900/40 hover:border-neon-500/40"
                  }`}
                >
                  {/* scanline sweep — only while dragging */}
                  {dragActive && (
                    <span className="pointer-events-none absolute inset-x-0 top-0 h-16 animate-scan bg-gradient-to-b from-neon-500/25 to-transparent" />
                  )}

                  <input
                    key={inputKey}
                    type="file"
                    className="hidden"
                    onChange={(event) => handleFile(event.target.files?.[0])}
                  />

                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-neon-500/25 bg-neon-500/10 text-neon-400">
                    <UploadCloud className="h-7 w-7" strokeWidth={1.75} />
                  </div>
                  <p className="mt-5 text-sm font-semibold text-slate-200">
                    <span className="text-neon-400">Click to upload</span> or drag
                    and drop
                  </p>
                  <p className="mt-1.5 font-mono text-xs text-slate-400">
                    PDF · DOCX · DOC · TXT · CSV · Video · Audio · Image
                  </p>
                </label>

                {file && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-line/10 bg-void-900/50 p-4">
                    <div className="flex min-w-0 items-center gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${selectedMeta?.accent}`}
                      >
                        {SelectedIcon && <SelectedIcon className="h-5 w-5" />}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">
                          {file.name}
                        </p>
                        <p className="font-mono text-xs text-slate-500">
                          {formatBytes(file.size)} · {selectedMeta?.type}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-hover/5 hover:text-threat"
                      aria-label="Remove selected file"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                )}

                {selectedMeta?.type === "Text" && (
                  <div>
                    <Label hint="select classification model">
                      What kind of text is this?
                    </Label>
                    <Segmented
                      options={[
                        { value: "review", label: "Product / Service Review (Review Model)" },
                        { value: "text", label: "News / Article (Text Model)" },
                      ]}
                      value={contentCategory}
                      onChange={setContentCategory}
                    />
                  </div>
                )}

                {uploading && progress > 0 && (
                  <div>
                    <div className="mb-1.5 flex justify-between">
                      <span className="hud-label">Uploading</span>
                      <span className="font-mono text-xs text-neon-400">
                        {progress}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-hover/8">
                      <div
                        className="h-full rounded-full bg-neon-gradient transition-[width]"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}

                <div>
                  <Label htmlFor="description" hint="optional">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Case reference, source, or context for this file…"
                  />
                </div>

                {error && <Alert variant="error">{error}</Alert>}
                {status && (
                  <Alert variant="success">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>{status}</span>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => navigate("/predict")}
                      >
                        Analyze Now →
                      </Button>
                    </div>
                  </Alert>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="submit"
                    size="lg"
                    loading={uploading}
                    icon={!uploading ? UploadCloud : undefined}
                  >
                    {uploading ? "Uploading…" : "Upload file"}
                  </Button>
                  {documents.length > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      icon={ScanSearch}
                      onClick={() => navigate("/predict")}
                    >
                      Analyze uploads
                    </Button>
                  )}
                </div>
              </form>
            ) : (
              <form onSubmit={handlePasteSubmit} className="space-y-5">
                <div>
                  <Label hint="optional title or reference">
                    Document Title / Reference
                  </Label>
                  <Input
                    value={pastedTitle}
                    onChange={(e) => setPastedTitle(e.target.value)}
                    placeholder="e.g. Sony WH-1000XM5 Customer Review or Breaking News Article"
                  />
                </div>

                <div>
                  <Label hint="select classification model">
                    What kind of text is this?
                  </Label>
                  <Segmented
                    options={[
                      { value: "review", label: "Product / Service Review (Review Model)" },
                      { value: "text", label: "News / Article (Text Model)" },
                    ]}
                    value={pastedCategory}
                    onChange={setPastedCategory}
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between">
                    <Label htmlFor="pasted-content">
                      Text Content
                    </Label>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handlePasteFromClipboard}
                        className="flex items-center gap-1.5 text-xs font-semibold text-neon-400 transition hover:text-neon-300 hover:underline"
                      >
                        <ClipboardPaste className="h-3.5 w-3.5" />
                        Paste from Clipboard
                      </button>
                      {pastedText && (
                        <button
                          type="button"
                          onClick={() => setPastedText("")}
                          className="text-xs text-slate-500 transition hover:text-threat"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                  <Textarea
                    id="pasted-content"
                    rows={9}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Paste any text here directly (e.g. copied from a PDF, Word document, web page, or review)..."
                    className="font-mono text-xs leading-relaxed"
                  />
                  <div className="mt-1.5 flex items-center justify-between font-mono text-[0.7rem] text-slate-500">
                    <span>{pastedText.length} characters</span>
                    <span>{pastedText.trim() ? pastedText.trim().split(/\s+/).filter(Boolean).length : 0} words</span>
                  </div>
                </div>

                <div>
                  <Label htmlFor="description" hint="optional">
                    Description
                  </Label>
                  <Textarea
                    id="description"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Case reference, origin source, or context..."
                  />
                </div>

                {error && <Alert variant="error">{error}</Alert>}
                {status && (
                  <Alert variant="success">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>{status}</span>
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => navigate("/predict")}
                      >
                        Analyze Now →
                      </Button>
                    </div>
                  </Alert>
                )}

                <div className="flex flex-wrap gap-3">
                  <Button
                    type="submit"
                    size="lg"
                    loading={pasting}
                    icon={!pasting ? ClipboardPaste : undefined}
                    disabled={!pastedText.trim()}
                  >
                    {pasting ? "Ingesting…" : "Submit Pasted Text"}
                  </Button>
                  {documents.length > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      icon={ScanSearch}
                      onClick={() => navigate("/predict")}
                    >
                      Go to Analysis
                    </Button>
                  )}
                </div>
              </form>
            )}
          </Card>

          <div className="space-y-5">
            <Card>
              <p className="hud-label text-neon-400">Accepted formats</p>
              <div className="mt-4 space-y-2">
                {ACCEPTED.map((item) => {
                  const meta = fileMeta(
                    item.type === "Image"
                      ? "a.png"
                      : item.type === "Video"
                        ? "a.mp4"
                        : item.type === "Audio"
                          ? "a.mp3"
                          : "a.txt"
                  );
                  const Icon = meta.icon;
                  return (
                    <div
                      key={item.type}
                      className="flex items-center gap-3 rounded-xl border border-line/8 bg-void-900/40 p-3"
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${meta.accent}`}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200">
                          {item.type}
                        </p>
                        <p className="truncate font-mono text-[0.68rem] text-slate-600">
                          {item.exts}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-slate-500">
                <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-clear" />
                Files are stored on the API server and typed by extension. An
                unsupported extension is rejected before any bytes are written.
              </p>
            </Card>

            <Card padding="p-0">
              <div className="flex items-center justify-between px-6 pb-3 pt-5">
                <p className="hud-label">Recent uploads</p>
                <Badge tone="neutral">{documents.length}</Badge>
              </div>
              <div className="neon-rule" />

              <div className="max-h-[22rem] divide-y divide-line overflow-y-auto">
                {listLoading ? (
                  <div className="space-y-3 p-5">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : documents.length > 0 ? (
                  documents.map((document) => {
                    const meta = fileMeta(document.original_file_name);
                    const Icon = meta.icon;
                    return (
                      <div
                        key={document.id}
                        className="group flex items-center gap-3 px-5 py-3 transition hover:bg-hover/[0.03]"
                      >
                        <div
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${meta.accent}`}
                        >
                          <Icon className="h-[18px] w-[18px]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-slate-200">
                            {document.original_file_name}
                          </p>
                          <p className="flex items-center gap-1.5 font-mono text-[0.68rem] text-slate-600">
                            <Clock3 className="h-3 w-3" />
                            {formatRelative(document.uploaded_at)}
                            <span className="text-slate-700">·</span>
                            <HardDrive className="h-3 w-3" />
                            {formatBytes(document.file_size)}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 transition">
                          <button
                            type="button"
                            onClick={() =>
                              window.open(
                                getDocumentFileUrl(document.id),
                                "_blank"
                              )
                            }
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-line bg-void-700 text-slate-400 transition hover:border-line-strong hover:bg-void-600 hover:text-neon-400"
                            title={`Open ${document.original_file_name}`}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(document.id)}
                            disabled={deletingId === document.id}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-line bg-void-700 text-slate-400 transition hover:border-threat/50 hover:bg-threat/10 hover:text-threat disabled:opacity-40"
                            aria-label={`Delete ${document.original_file_name}`}
                            title={`Delete ${document.original_file_name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-5">
                    <EmptyState
                      icon={UploadCloud}
                      title="No uploads yet"
                      description="Ingested files appear here."
                    />
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
