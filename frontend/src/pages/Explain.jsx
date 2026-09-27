import { useCallback, useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Flame,
  BarChart3,
  Boxes,
  RefreshCw,
  FileText,
  Star,
  Bot,
  ScanSearch,
  Lock,
  Sparkles,
  X,
  FileCheck,
  ShieldAlert,
  Copy,
  Check,
  ExternalLink,
  Download,
  Eye,
  Search,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import apiClient, { apiError } from "../api/client";
import {
  Card,
  Button,
  Badge,
  PageHeader,
  EmptyState,
  Alert,
  Select,
  Label,
  Segmented,
} from "../components/ui";
import { Skeleton } from "../components/ui/Skeleton";
import { verdictOf, statusTone } from "../lib/verdict";
import {
  formatDateTime,
  formatSeconds,
  formatBytes,
  fileMeta,
  getDocumentFileUrl,
} from "../lib/format";

/**
 * The three attribution methods the project supports:
 * - Grad-CAM (Image, Video, Audio CNNs)
 * - SHAP (Text, Review tokens, Image superpixels, Video & Audio chunks)
 * - LIME (Text, Review tokens, Image superpixels, Video & Audio chunks)
 */
const METHODS = [
  {
    key: "gradcam",
    name: "Grad-CAM",
    icon: Flame,
    question: "Which spatial/temporal features drove this decision?",
    detail:
      "Gradient-weighted activations from convolutional blocks: 2D spatial heatmap for Image, 3D keyframe overlay for Video, and 1D temporal feature maps for Audio.",
    accent: "border-threat/25 bg-threat/10 text-threat",
    available: true,
    modality: "Image / Video / Audio (CNNs)",
  },
  {
    key: "shap",
    name: "SHAP",
    icon: BarChart3,
    question: "How much did each token/segment contribute?",
    detail:
      "Shapley additive attributions across Text/Review tokens, Image superpixels, Video frame chunks, and Audio segments.",
    accent: "border-volt-500/25 bg-volt-500/10 text-volt-400",
    available: true,
    modality: "All Modalities (Text / Review / Image / Video / Audio)",
  },
  {
    key: "lime",
    name: "LIME",
    icon: Boxes,
    question: "What simple model mimics this decision locally?",
    detail:
      "Perturbs tokens, superpixels, or chunks and fits an interpretable local surrogate linear model.",
    accent: "border-neon-500/25 bg-neon-500/10 text-neon-400",
    available: true,
    modality: "All Modalities (Text / Review / Image / Video / Audio)",
  },
];

export default function Explain() {
  const [predictions, setPredictions] = useState([]);
  const [selectedId, setSelectedId] = useState("");
  const [reviews, setReviews] = useState([]);
  const [bots, setBots] = useState([]);
  const [reports, setReports] = useState([]);
  const [explanations, setExplanations] = useState([]);

  // Document details & extracted source text
  const [documentData, setDocumentData] = useState(null);
  const [sourceText, setSourceText] = useState("");
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [copiedSource, setCopiedSource] = useState(false);
  const [showFullSource, setShowFullSource] = useState(false);

  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [generatingMethod, setGeneratingMethod] = useState("");
  const [generateError, setGenerateError] = useState("");

  const [generatingReport, setGeneratingReport] = useState(false);
  const [generatingReview, setGeneratingReview] = useState(false);
  const [generatingBot, setGeneratingBot] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [actionError, setActionError] = useState("");
  const [activeModalItem, setActiveModalItem] = useState(null);
  const [activeModalType, setActiveModalType] = useState("");

  const loadPredictions = useCallback(async () => {
    setLoading(true);
    try {
      const response = await apiClient.get("/predictions/", {
        params: { limit: 100 },
      });
      setPredictions(response.data);
      setSelectedId((current) => current || String(response.data[0]?.id ?? ""));
    } catch (err) {
      setError(apiError(err, "Unable to load predictions."));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPredictions();
  }, [loadPredictions]);

  // Fetch document details and text content for the selected prediction
  useEffect(() => {
    const cur = predictions.find((p) => String(p.id) === String(selectedId));
    if (!cur?.document_id) {
      setDocumentData(null);
      setSourceText("");
      return;
    }

    let cancelled = false;
    setLoadingDoc(true);

    apiClient
      .get(`/documents/${cur.document_id}`)
      .then((res) => {
        if (!cancelled) setDocumentData(res.data);
      })
      .catch(() => {
        if (!cancelled) setDocumentData(null);
      });

    apiClient
      .get(`/documents/${cur.document_id}/content`)
      .then((res) => {
        if (!cancelled) setSourceText(res.data.content || "");
      })
      .catch(() => {
        if (!cancelled) setSourceText("");
      })
      .finally(() => {
        if (!cancelled) setLoadingDoc(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId, predictions]);

  // Everything the API can currently attach to a prediction.
  useEffect(() => {
    if (!selectedId) return;

    let cancelled = false;
    setDetailLoading(true);

    Promise.all([
      apiClient
        .get(`/review-analysis/prediction/${selectedId}`)
        .catch(() => ({ data: [] })),
      apiClient
        .get(`/bot-analysis/prediction/${selectedId}`)
        .catch(() => ({ data: [] })),
      apiClient
        .get(`/reports/prediction/${selectedId}`)
        .catch(() => ({ data: [] })),
      apiClient
        .get(`/explanations/prediction/${selectedId}`)
        .catch(() => ({ data: [] })),
    ])
      .then(async ([reviewRes, botRes, reportRes, explanationRes]) => {
        if (cancelled) return;
        const revData = reviewRes.data ?? [];
        const botData = botRes.data ?? [];
        const repData = reportRes.data ?? [];
        const expData = explanationRes.data ?? [];

        setReviews(revData);
        setBots(botData);
        setReports(repData);
        setExplanations(expData);

        // Auto-generate missing baseline forensic evidence, reports, and explanations
        const autoTasks = [];
        if (repData.length === 0) {
          autoTasks.push(
            apiClient.post(`/reports/generate/${selectedId}`)
              .then((r) => { if (!cancelled && r.data) setReports((c) => [r.data, ...c]); })
              .catch(() => null)
          );
        }
        if (revData.length === 0) {
          autoTasks.push(
            apiClient.post(`/review-analysis/generate/${selectedId}`)
              .then((r) => { if (!cancelled && r.data) setReviews((c) => [r.data, ...c]); })
              .catch(() => null)
          );
        }
        if (botData.length === 0) {
          autoTasks.push(
            apiClient.post(`/bot-analysis/generate/${selectedId}`)
              .then((r) => { if (!cancelled && r.data) setBots((c) => [r.data, ...c]); })
              .catch(() => null)
          );
        }

        // Auto-generate missing attribution explanations
        const hasGradcam = expData.some((e) => e.method === "gradcam");
        const hasShap = expData.some((e) => e.method === "shap");
        const hasLime = expData.some((e) => e.method === "lime");
        const curPred = predictions.find((p) => String(p.id) === String(selectedId));
        const isText = curPred?.model_name?.includes("text") || curPred?.model_name?.includes("review");

        if (!isText && !hasGradcam) {
          autoTasks.push(
            apiClient.post(`/explanations/generate/${selectedId}`, null, { params: { method: "gradcam" } })
              .then((r) => { if (!cancelled && r.data) setExplanations((c) => [r.data, ...c.filter((x) => x.method !== "gradcam")]); })
              .catch(() => null)
          );
        }
        if (!hasShap) {
          autoTasks.push(
            apiClient.post(`/explanations/generate/${selectedId}`, null, { params: { method: "shap" } })
              .then((r) => { if (!cancelled && r.data) setExplanations((c) => [r.data, ...c.filter((x) => x.method !== "shap")]); })
              .catch(() => null)
          );
        }
        if (!hasLime) {
          autoTasks.push(
            apiClient.post(`/explanations/generate/${selectedId}`, null, { params: { method: "lime" } })
              .then((r) => { if (!cancelled && r.data) setExplanations((c) => [r.data, ...c.filter((x) => x.method !== "lime")]); })
              .catch(() => null)
          );
        }

        if (autoTasks.length > 0) {
          await Promise.all(autoTasks);
        }
      })
      .finally(() => {
        if (!cancelled) setDetailLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const handleGenerateAll = async () => {
    if (!selectedId || generatingAll) return;
    setGeneratingAll(true);
    setActionError("");
    setGenerateError("");

    try {
      // 1. Generate Report, Forensics, Bot analysis
      const [rep, rev, bot] = await Promise.all([
        apiClient.post(`/reports/generate/${selectedId}`).catch(() => null),
        apiClient.post(`/review-analysis/generate/${selectedId}`).catch(() => null),
        apiClient.post(`/bot-analysis/generate/${selectedId}`).catch(() => null),
      ]);

      if (rep?.data) setReports((curr) => [rep.data, ...curr.filter((x) => x.id !== rep.data.id)]);
      if (rev?.data) setReviews((curr) => [rev.data, ...curr.filter((x) => x.id !== rev.data.id)]);
      if (bot?.data) setBots((curr) => [bot.data, ...curr.filter((x) => x.id !== bot.data.id)]);

      // 2. Grad-CAM (for Image, Video, Audio)
      const currentSelected = predictions.find((item) => String(item.id) === String(selectedId));
      const isText = currentSelected?.model_name?.includes("text") || currentSelected?.model_name?.includes("review");
      if (!isText) {
        const gcam = await apiClient.post(`/explanations/generate/${selectedId}`, null, {
          params: { method: "gradcam" },
        }).catch(() => null);
        if (gcam?.data) {
          setExplanations((curr) => [gcam.data, ...curr.filter((x) => x.method !== "gradcam")]);
        }
      }

      // 3. SHAP
      const shap = await apiClient.post(`/explanations/generate/${selectedId}`, null, {
        params: { method: "shap" },
      }).catch(() => null);
      if (shap?.data) {
        setExplanations((curr) => [shap.data, ...curr.filter((x) => x.method !== "shap")]);
      }

      // 4. LIME
      const lime = await apiClient.post(`/explanations/generate/${selectedId}`, null, {
        params: { method: "lime" },
      }).catch(() => null);
      if (lime?.data) {
        setExplanations((curr) => [lime.data, ...curr.filter((x) => x.method !== "lime")]);
      }
    } catch (err) {
      setActionError(apiError(err, "Failed during explanation batch generation."));
    } finally {
      setGeneratingAll(false);
    }
  };

  const handleGenerate = async (methodKey) => {
    if (!selectedId) return;

    const cur = predictions.find((item) => String(item.id) === String(selectedId));
    const isText = Boolean(cur?.model_name?.includes("text") || cur?.model_name?.includes("review"));
    if (isText && methodKey === "gradcam") {
      setGenerateError("Grad-CAM is not applicable for transformer sequence models (DistilBERT). Interpretability is provided by SHAP token attributions and LIME local surrogates.");
      return;
    }

    setGeneratingMethod(methodKey);
    setGenerateError("");

    try {
      const response = await apiClient.post(
        `/explanations/generate/${selectedId}`,
        null,
        { params: { method: methodKey } }
      );
      // Newest first, replacing any earlier run of the same method for
      // this prediction so the card always shows the latest artefact.
      setExplanations((current) => [
        response.data,
        ...current.filter((item) => item.method !== methodKey),
      ]);
    } catch (err) {
      setGenerateError(apiError(err, `Unable to generate ${methodKey}.`));
    } finally {
      setGeneratingMethod("");
    }
  };

  const handleGenerateReport = async () => {
    if (!selectedId) return;
    setGeneratingReport(true);
    setActionError("");
    try {
      const response = await apiClient.post(`/reports/generate/${selectedId}`);
      setReports((current) => [
        response.data,
        ...current.filter((item) => item.id !== response.data.id),
      ]);
    } catch (err) {
      setActionError(apiError(err, "Unable to generate forensic report."));
    } finally {
      setGeneratingReport(false);
    }
  };

  const handleGenerateReview = async () => {
    if (!selectedId) return;
    setGeneratingReview(true);
    setActionError("");
    try {
      const response = await apiClient.post(
        `/review-analysis/generate/${selectedId}`
      );
      setReviews((current) => [
        response.data,
        ...current.filter((item) => item.id !== response.data.id),
      ]);
    } catch (err) {
      setActionError(apiError(err, "Unable to run review forensics."));
    } finally {
      setGeneratingReview(false);
    }
  };

  const handleGenerateBot = async () => {
    if (!selectedId) return;
    setGeneratingBot(true);
    setActionError("");
    try {
      const response = await apiClient.post(
        `/bot-analysis/generate/${selectedId}`
      );
      setBots((current) => [
        response.data,
        ...current.filter((item) => item.id !== response.data.id),
      ]);
    } catch (err) {
      setActionError(apiError(err, "Unable to run bot analysis."));
    } finally {
      setGeneratingBot(false);
    }
  };

  const selected = predictions.find(
    (item) => String(item.id) === String(selectedId)
  );
  const verdict = verdictOf(selected?.predicted_label);
  const VerdictIcon = verdict.icon;

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          eyebrow="Explainability"
          title="Why the model decided what it decided"
          description="Attribution overlays, feature contributions and supporting evidence for a single prediction."
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                icon={Sparkles}
                loading={generatingAll}
                onClick={handleGenerateAll}
              >
                {generatingAll ? "Analyzing Everything…" : "Generate All"}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                onClick={loadPredictions}
              >
                Reload
              </Button>
            </div>
          }
        />

        {error && <Alert variant="error">{error}</Alert>}

        {loading ? (
          <div className="space-y-5">
            <Skeleton className="h-28 w-full" />
            <div className="grid gap-5 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-56 w-full" />
              ))}
            </div>
          </div>
        ) : predictions.length === 0 ? (
          <Card>
            <EmptyState
              icon={ScanSearch}
              title="No predictions to explain"
              description="Explainability operates on a completed prediction. Run detection first."
              action={
                <Button as={Link} to="/predict" size="sm" icon={ScanSearch}>
                  Go to Analyze
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            {/* Subject selector + verdict summary */}
            <Card glow>
              <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
                <div>
                  <Label htmlFor="prediction">Prediction under inspection</Label>
                  <Select
                    id="prediction"
                    value={selectedId}
                    onChange={(event) => setSelectedId(event.target.value)}
                  >
                    {predictions.map((item) => {
                      const mod = item.model_name.includes("video")
                        ? "Video"
                        : item.model_name.includes("audio")
                        ? "Audio"
                        : item.model_name.includes("mobilenet") || item.model_name.includes("image")
                        ? "Image"
                        : item.model_name.includes("review")
                        ? "Review"
                        : "Text";
                      return (
                        <option key={item.id} value={item.id}>
                          #{item.id} · [{mod}] · {item.predicted_label} (Doc #{item.document_id})
                        </option>
                      );
                    })}
                  </Select>

                  {selected && (
                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <Meta
                        label="Document"
                        value={
                          documentData?.original_file_name
                            ? `${documentData.original_file_name} (#${selected.document_id})`
                            : `#${selected.document_id}`
                        }
                      />
                      <Meta label="Model" value={selected.model_name} />
                      <Meta
                        label="Latency"
                        value={formatSeconds(selected.processing_time)}
                      />
                      <Meta
                        label="Recorded"
                        value={formatDateTime(selected.created_at)}
                      />
                    </div>
                  )}
                </div>

                {selected && (
                  <div className="rounded-2xl border border-line/10 bg-void-900/50 p-5">
                    <div className="flex items-center justify-between">
                      <p className="hud-label">Verdict</p>
                      <Badge tone={statusTone(selected.processing_status)} dot>
                        {selected.processing_status}
                      </Badge>
                    </div>
                    <div className="mt-4 flex items-center gap-4">
                      <div
                        className={`flex h-14 w-14 items-center justify-center rounded-2xl border ${verdict.ring}`}
                      >
                        <VerdictIcon className="h-7 w-7" strokeWidth={2} />
                      </div>
                      <p
                        className={`font-display text-2xl font-bold ${verdict.text} text-glow`}
                      >
                        {selected.predicted_label}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </Card>

            {/* Source Document Context & Extracted Content Panel */}
            {selected && (
              <SourceDocumentCard
                document={documentData}
                documentId={selected.document_id}
                sourceText={sourceText}
                loading={loadingDoc}
                onCopy={() => {
                  if (sourceText) {
                    navigator.clipboard.writeText(sourceText);
                    setCopiedSource(true);
                    setTimeout(() => setCopiedSource(false), 2000);
                  }
                }}
                copied={copiedSource}
                isText={Boolean(
                  selected.model_name.includes("text") ||
                  selected.model_name.includes("review")
                )}
                showFull={showFullSource}
                onToggleShowFull={() => setShowFullSource((v) => !v)}
              />
            )}

            {/* The three attribution methods */}
            {generateError && <Alert variant="error">{generateError}</Alert>}

            <div className="grid gap-5 lg:grid-cols-3">
              {METHODS.map((method) => {
                const Icon = method.icon;
                const explanation = explanations.find(
                  (item) => item.method === method.key
                );
                const isGenerating = generatingMethod === method.key;
                const isTextModel = Boolean(
                  selected?.model_name?.includes("text") ||
                  selected?.model_name?.includes("review")
                );
                const isGradcamText = isTextModel && method.key === "gradcam";

                return (
                  <Card key={method.key} className="flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${method.accent}`}
                      >
                        <Icon className="h-5 w-5" strokeWidth={2} />
                      </div>
                      {isGradcamText ? (
                        <Badge tone="warning">N/A for Text / Review</Badge>
                      ) : !method.available ? (
                        <Badge tone="warning">phase 7 — deferred</Badge>
                      ) : explanation ? (
                        <Badge tone="brand">generated</Badge>
                      ) : (
                        <Badge tone="neutral">{method.modality}</Badge>
                      )}
                    </div>

                    <p className="mt-4 font-display text-lg font-bold text-slate-50">
                      {method.name}
                    </p>
                    <p className="mt-1.5 text-sm font-medium text-slate-400">
                      {method.question}
                    </p>
                    <p className="mt-3 text-xs leading-relaxed text-slate-500">
                      {method.detail}
                    </p>

                    {isGradcamText ? (
                      <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-line/10 bg-void-900/40 p-5 text-center">
                        <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-line/15 bg-void-800 text-slate-400">
                          <Flame className="h-4 w-4 opacity-40 text-threat" />
                        </div>
                        <div>
                          <p className="font-mono text-xs font-semibold text-slate-300">
                            Not Applicable for Transformers
                          </p>
                          <p className="mt-1 text-[0.72rem] leading-relaxed text-slate-400">
                            Grad-CAM requires spatial or temporal CNN activation grids (Image, Video, Audio). Transformer sequence models (DistilBERT) are interpreted via token Shapley values (<strong className="text-volt-400 font-medium">SHAP</strong>) and local surrogate linear features (<strong className="text-neon-400 font-medium">LIME</strong>).
                          </p>
                        </div>
                      </div>
                    ) : !method.available ? (
                      // Placeholder canvas — deliberately empty, not fabricated
                      <div className="mt-5 flex flex-1 items-center justify-center rounded-xl border border-dashed border-line/10 bg-void-900/50 py-10">
                        <div className="text-center">
                          <Lock className="mx-auto h-5 w-5 text-slate-700" />
                          <p className="mt-2 font-mono text-[0.68rem] uppercase tracking-wider text-slate-600">
                            no artefact
                          </p>
                        </div>
                      </div>
                    ) : explanation ? (
                      <div className="mt-5 flex-1">
                        <ExplanationArtifact
                          explanation={explanation}
                          predictedLabel={selected?.predicted_label}
                          sourceText={sourceText}
                        />
                      </div>
                    ) : (
                      <div className="mt-5 flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-line/10 bg-void-900/50 py-10">
                        <p className="max-w-[16rem] text-center font-mono text-[0.68rem] uppercase tracking-wider text-slate-600">
                          no artefact yet
                        </p>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          icon={Sparkles}
                          loading={isGenerating}
                          disabled={Boolean(generatingMethod)}
                          onClick={() => handleGenerate(method.key)}
                        >
                          {isGenerating ? "Generating…" : "Generate"}
                        </Button>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>

            {actionError && <Alert variant="error">{actionError}</Alert>}

            {/* Evidence, Reports & Forensic Diagnostics */}
            <div className="grid gap-5 lg:grid-cols-3">
              <EvidenceCard
                title="Linked reports"
                icon={FileText}
                count={reports.length}
                loading={detailLoading}
                emptyText="No report generated for this prediction."
                actionLabel="Generate Report"
                isGenerating={generatingReport}
                onGenerate={handleGenerateReport}
                items={reports.map((report) => ({
                  id: report.id,
                  primary: report.report_title,
                  secondary: report.report_summary,
                  raw: report,
                }))}
                onItemClick={(item) => {
                  setActiveModalItem(item.raw);
                  setActiveModalType("report");
                }}
              />
              <EvidenceCard
                title={
                  selected?.model_name?.includes("review") ||
                  selected?.model_name?.includes("text")
                    ? "Review forensics"
                    : "Media forensics"
                }
                icon={Star}
                count={reviews.length}
                loading={detailLoading}
                emptyText={
                  selected?.model_name?.includes("review") ||
                  selected?.model_name?.includes("text")
                    ? "No review forensics generated for this prediction."
                    : "No media forensics generated for this prediction."
                }
                actionLabel="Run Forensics"
                isGenerating={generatingReview}
                onGenerate={handleGenerateReview}
                items={reviews.map((review) => ({
                  id: review.id,
                  primary: review.summary,
                  secondary: review.recommendation,
                  raw: review,
                }))}
                onItemClick={(item) => {
                  setActiveModalItem(item.raw);
                  setActiveModalType("review");
                }}
              />
              <EvidenceCard
                title="Bot analysis"
                icon={Bot}
                count={bots.length}
                loading={detailLoading}
                emptyText="No bot analysis generated for this prediction."
                actionLabel="Run Bot Check"
                isGenerating={generatingBot}
                onGenerate={handleGenerateBot}
                items={bots.map((bot) => ({
                  id: bot.id,
                  primary: bot.question,
                  secondary: bot.answer,
                  raw: bot,
                }))}
                onItemClick={(item) => {
                  setActiveModalItem(item.raw);
                  setActiveModalType("bot");
                }}
              />
            </div>
          </>
        )}

        {activeModalItem && (
          <DetailModal
            type={activeModalType}
            item={activeModalItem}
            onClose={() => {
              setActiveModalItem(null);
              setActiveModalType("");
            }}
          />
        )}
      </div>
    </div>
  );
}

function Meta({ label, value }) {
  return (
    <div className="rounded-xl border border-line/8 bg-void-900/40 px-3.5 py-2.5">
      <p className="hud-label">{label}</p>
      <p className="mt-1 truncate font-mono text-sm text-slate-200">{value}</p>
    </div>
  );
}

function SourceDocumentCard({
  document,
  documentId,
  sourceText,
  loading,
  onCopy,
  copied,
  isText,
  showFull,
  onToggleShowFull,
}) {
  const fileName = document?.original_file_name || `Document #${documentId}`;
  const meta = fileMeta(fileName);
  const Icon = meta.icon;
  const fileUrl = getDocumentFileUrl(documentId);
  const downloadUrl = getDocumentFileUrl(documentId, true);

  const wordCount = sourceText
    ? sourceText.trim().split(/\s+/).filter(Boolean).length
    : 0;

  return (
    <Card className="border border-line/20 bg-void-900/60 p-5">
      <div className="flex flex-col gap-4">
        {/* Header: Document Identity + Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line/10 pb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${meta.accent}`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-display text-base font-bold text-slate-100 truncate max-w-md sm:max-w-xl">
                  {fileName}
                </h4>
                <Badge tone="neutral" className="text-[0.68rem] shrink-0 font-mono">
                  Doc #{documentId}
                </Badge>
              </div>
              <p className="font-mono text-xs text-slate-400 mt-0.5">
                {document?.document_type?.type_name || meta.type} ·{" "}
                {document?.file_size ? formatBytes(document.file_size) : "Uploaded File"}
                {isText && sourceText && ` · ${sourceText.length.toLocaleString()} characters · ${wordCount.toLocaleString()} words`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {sourceText && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                icon={copied ? Check : Copy}
                onClick={onCopy}
                className="h-8 text-xs font-semibold"
              >
                {copied ? "Copied Source Text!" : "Copy Source Text"}
              </Button>
            )}
            <Button
              type="button"
              variant="primary"
              size="sm"
              icon={ExternalLink}
              onClick={() => window.open(fileUrl, "_blank")}
              className="h-8 text-xs"
            >
              Open File
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={() => window.open(downloadUrl, "_blank")}
              title="Download original file"
              className="h-8 px-2.5 text-xs"
            />
          </div>
        </div>

        {/* Text preview if text content is available */}
        {isText && (
          <div>
            <div className="flex items-center justify-between pb-2">
              <div className="flex items-center gap-2">
                <p className="hud-label text-slate-300">
                  Extracted Document Text for Interpretability
                </p>
                {document?.mime_type && (
                  <span className="font-mono text-[0.65rem] text-slate-500 uppercase">
                    ({document.mime_type})
                  </span>
                )}
              </div>
              {sourceText && sourceText.length > 350 && (
                <button
                  type="button"
                  onClick={onToggleShowFull}
                  className="flex items-center gap-1 font-mono text-[0.72rem] text-neon-400 hover:text-neon-300 transition"
                >
                  {showFull ? (
                    <>
                      Collapse text view <ChevronUp className="h-3 w-3" />
                    </>
                  ) : (
                    <>
                      Expand full document ({sourceText.length.toLocaleString()} chars) <ChevronDown className="h-3 w-3" />
                    </>
                  )}
                </button>
              )}
            </div>

            {loading ? (
              <div className="space-y-2 py-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ) : sourceText ? (
              <div
                className={`overflow-y-auto rounded-xl border border-line/10 bg-void-950/80 p-4 font-mono text-xs text-slate-200 select-text leading-relaxed whitespace-pre-wrap selection:bg-neon-500/30 ${
                  showFull ? "max-h-[30rem]" : "max-h-40"
                }`}
              >
                {sourceText}
              </div>
            ) : (
              <div className="rounded-xl border border-line/10 bg-void-950/40 p-4 text-center">
                <p className="text-xs text-slate-500">
                  No readable text content available for this document.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

function TokenAttributionViewer({ explanation, predictedLabel, sourceText }) {
  const [viewMode, setViewMode] = useState("highlight"); // "highlight" | "features"
  const [searchTerm, setSearchTerm] = useState("");
  const [activeToken, setActiveToken] = useState(null);
  const [copiedTokens, setCopiedTokens] = useState(false);
  const [copiedText, setCopiedText] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);

  const tokens = useMemo(() => {
    try {
      const parsed = JSON.parse(explanation.artifact);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [explanation.artifact]);

  const maxWeight = useMemo(() => {
    return Math.max(1e-6, ...tokens.map((item) => Math.abs(item.weight))) || 1;
  }, [tokens]);

  const targetLabel = predictedLabel || "Predicted Label";
  const isFakeVerdict = targetLabel.toLowerCase().includes("fake") || targetLabel.toLowerCase().includes("deepfake");
  const oppositeLabel = isFakeVerdict ? "Genuine" : "Fake";

  // Sorted feature rankings
  const { positiveFeatures, negativeFeatures } = useMemo(() => {
    const pos = tokens.filter((t) => t.weight >= 0).sort((a, b) => b.weight - a.weight);
    const neg = tokens.filter((t) => t.weight < 0).sort((a, b) => a.weight - b.weight);
    return { positiveFeatures: pos, negativeFeatures: neg };
  }, [tokens]);

  // Filtered tokens for search
  const filteredTokens = useMemo(() => {
    if (!searchTerm.trim()) return tokens;
    const lower = searchTerm.toLowerCase();
    return tokens.map((t) => ({
      ...t,
      matchesSearch: t.token.toLowerCase().includes(lower),
    }));
  }, [tokens, searchTerm]);

  // Copy token weights as structured table
  const handleCopyTokensTable = () => {
    const header = `DeepShield AI - ${explanation.method.toUpperCase()} Token Attributions\nTarget Verdict: ${targetLabel}\nTotal Features: ${tokens.length}\n\nToken\tWeight\tInfluence\n---------------------------------------------\n`;
    const rows = tokens
      .map(
        (t) =>
          `${t.token}\t${t.weight >= 0 ? "+" : ""}${t.weight.toFixed(5)}\t${
            t.weight >= 0 ? `Towards ${targetLabel}` : `Towards ${oppositeLabel}`
          }`
      )
      .join("\n");
    navigator.clipboard.writeText(header + rows);
    setCopiedTokens(true);
    setTimeout(() => setCopiedTokens(false), 2000);
  };

  // Copy plain text: prefer sourceText if available, or reconstruct from tokens
  const handleCopyReconstructedText = () => {
    if (sourceText) {
      navigator.clipboard.writeText(sourceText);
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
      return;
    }
    let reconstructed = "";
    tokens.forEach((t, i) => {
      const tok = t.token;
      if (i === 0 || /^[.,!?;:')]/.test(tok) || tok.startsWith("##") || tok.startsWith("'")) {
        reconstructed += tok.replace(/^##/, "");
      } else {
        reconstructed += " " + tok;
      }
    });
    navigator.clipboard.writeText(reconstructed.trim());
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  if (!tokens || tokens.length === 0) {
    return (
      <div className="rounded-xl border border-line/10 bg-void-900/50 p-4 text-center">
        <p className="text-xs text-slate-500">No token attributions available.</p>
      </div>
    );
  }

  const currentInspected = activeToken || positiveFeatures[0] || tokens[0];

  return (
    <div className="space-y-3">
      {/* Controls: Mode Switcher + Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/10 pb-2.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setViewMode("highlight")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              viewMode === "highlight"
                ? "bg-neon-500/20 text-neon-400 border border-neon-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Highlighted Flow ({tokens.length})
          </button>
          <button
            type="button"
            onClick={() => setViewMode("features")}
            className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
              viewMode === "features"
                ? "bg-neon-500/20 text-neon-400 border border-neon-500/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Ranked Features
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[0.7rem]"
            icon={copiedTokens ? Check : Copy}
            onClick={handleCopyTokensTable}
            title="Copy tokens and attribution weights"
          >
            {copiedTokens ? "Copied Weights!" : "Copy Weights"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[0.7rem]"
            icon={copiedText ? Check : FileText}
            onClick={handleCopyReconstructedText}
            title="Copy source/reconstructed text"
          >
            {copiedText ? "Copied Text!" : "Copy Text"}
          </Button>
        </div>
      </div>

      {/* Search Input for Long Documents */}
      {tokens.length > 20 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Filter tokens or words..."
            className="h-7.5 w-full rounded-lg border border-line/10 bg-void-950/60 pl-8 pr-3 text-xs text-slate-200 placeholder:text-slate-600 focus:border-neon-500/40 focus:outline-none"
          />
        </div>
      )}

      {/* Active Inspected Token Bar */}
      {currentInspected && (
        <div className="flex flex-wrap items-center justify-between rounded-lg border border-line/10 bg-void-950/80 px-3 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-mono text-[0.7rem]">Inspecting:</span>
            <span className="font-mono font-bold text-slate-100 bg-void-800 px-1.5 py-0.5 rounded border border-line/15">
              &quot;{currentInspected.token}&quot;
            </span>
            <span
              className={`font-mono text-xs font-semibold ${
                currentInspected.weight >= 0 ? "text-threat" : "text-volt-400"
              }`}
            >
              {currentInspected.weight >= 0 ? `+${currentInspected.weight.toFixed(5)}` : currentInspected.weight.toFixed(5)}
            </span>
          </div>
          <span
            className={`font-mono text-[0.68rem] px-2 py-0.5 rounded-full ${
              currentInspected.weight >= 0
                ? "bg-threat/10 text-threat border border-threat/20"
                : "bg-volt-500/10 text-volt-400 border border-volt-500/20"
            }`}
          >
            {currentInspected.weight >= 0 ? `pushes toward ${targetLabel}` : `pushes toward ${oppositeLabel}`}
          </span>
        </div>
      )}

      {/* VIEW MODE 1: HIGHLIGHTED FLOW */}
      {viewMode === "highlight" && (
        <div className="max-h-72 overflow-y-auto rounded-xl border border-line/10 bg-void-950/60 p-3.5 font-mono text-xs leading-relaxed select-text">
          <div className="flex flex-wrap gap-1">
            {filteredTokens.map((item, index) => {
              const intensity = Math.min(1, Math.abs(item.weight) / maxWeight);
              const isPositive = item.weight >= 0;
              const isMatched = item.matchesSearch;
              const isCurrent = activeToken === item;

              const bg = isPositive
                ? `rgba(239, 68, 68, ${0.14 + intensity * 0.55})`
                : `rgba(59, 130, 246, ${0.12 + intensity * 0.45})`;

              const border = isPositive
                ? `rgba(239, 68, 68, ${0.25 + intensity * 0.45})`
                : `rgba(59, 130, 246, ${0.25 + intensity * 0.45})`;

              return (
                <span
                  key={index}
                  onMouseEnter={() => setActiveToken(item)}
                  onClick={() => setActiveToken(item)}
                  title={`"${item.token}": ${item.weight >= 0 ? "+" : ""}${item.weight.toFixed(5)} (${isPositive ? `toward ${targetLabel}` : `toward ${oppositeLabel}`})`}
                  style={{
                    backgroundColor: bg,
                    borderColor: isCurrent ? "#22d3ee" : isMatched ? "#facc15" : border,
                  }}
                  className={`inline-block cursor-pointer rounded px-1.5 py-0.5 border text-slate-100 transition-all hover:scale-105 ${
                    isMatched ? "ring-2 ring-yellow-400" : ""
                  } ${isCurrent ? "ring-2 ring-neon-400" : ""}`}
                >
                  {item.token}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW MODE 2: RANKED FEATURES BAR CHART */}
      {viewMode === "features" && (
        <div className="space-y-4 max-h-80 overflow-y-auto pr-1">
          {/* Top Positive Influencers */}
          <div>
            <div className="flex items-center justify-between pb-1.5 border-b border-line/10">
              <span className="hud-label text-threat">
                Signals Pushing Toward {targetLabel} ({positiveFeatures.length})
              </span>
              <span className="font-mono text-[0.65rem] text-slate-500">Weight</span>
            </div>
            <div className="mt-2 space-y-1.5">
              {(showAllFeatures ? positiveFeatures : positiveFeatures.slice(0, 8)).map((f, i) => {
                const pct = Math.min(100, Math.round((Math.abs(f.weight) / maxWeight) * 100));
                return (
                  <div
                    key={i}
                    onMouseEnter={() => setActiveToken(f)}
                    className="group flex items-center gap-2 text-xs font-mono rounded-lg p-1.5 hover:bg-void-900/60 transition cursor-pointer"
                  >
                    <span className="w-5 text-slate-600 text-[0.68rem]">#{i + 1}</span>
                    <span className="w-24 truncate font-semibold text-slate-200 group-hover:text-threat">
                      {f.token}
                    </span>
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded bg-void-900">
                      <div
                        style={{ width: `${Math.max(6, pct)}%` }}
                        className="h-full rounded bg-threat/80 group-hover:bg-threat transition-all"
                      />
                    </div>
                    <span className="w-16 text-right text-slate-300 font-mono text-[0.7rem]">
                      +{f.weight.toFixed(4)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Negative Influencers */}
          {negativeFeatures.length > 0 && (
            <div>
              <div className="flex items-center justify-between pb-1.5 border-b border-line/10">
                <span className="hud-label text-volt-400">
                  Signals Pushing Toward {oppositeLabel} ({negativeFeatures.length})
                </span>
                <span className="font-mono text-[0.65rem] text-slate-500">Weight</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {(showAllFeatures ? negativeFeatures : negativeFeatures.slice(0, 8)).map((f, i) => {
                  const pct = Math.min(100, Math.round((Math.abs(f.weight) / maxWeight) * 100));
                  return (
                    <div
                      key={i}
                      onMouseEnter={() => setActiveToken(f)}
                      className="group flex items-center gap-2 text-xs font-mono rounded-lg p-1.5 hover:bg-void-900/60 transition cursor-pointer"
                    >
                      <span className="w-5 text-slate-600 text-[0.68rem]">#{i + 1}</span>
                      <span className="w-24 truncate font-semibold text-slate-200 group-hover:text-volt-400">
                        {f.token}
                      </span>
                      <div className="relative h-2.5 flex-1 overflow-hidden rounded bg-void-900">
                        <div
                          style={{ width: `${Math.max(6, pct)}%` }}
                          className="h-full rounded bg-volt-500/80 group-hover:bg-volt-400 transition-all"
                        />
                      </div>
                      <span className="w-16 text-right text-slate-300 font-mono text-[0.7rem]">
                        {f.weight.toFixed(4)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tokens.length > 16 && (
            <div className="text-center pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-xs text-slate-400 hover:text-slate-200"
                onClick={() => setShowAllFeatures((v) => !v)}
              >
                {showAllFeatures ? "Show Top Features" : `Show All ${tokens.length} Features`}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Legend Footer */}
      <div className="pt-2 border-t border-line/10 flex flex-wrap items-center justify-between gap-2 font-mono text-[0.68rem] text-slate-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-threat/70 border border-threat" />
          toward {targetLabel} (positive weight)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-volt-500/70 border border-volt-400" />
          toward {oppositeLabel} (counter-evidence)
        </span>
      </div>
    </div>
  );
}

/**
 * Renders one generated explanation artefact.
 */
function ExplanationArtifact({ explanation, predictedLabel, sourceText }) {
  if (explanation.artifact_type === "image") {
    return (
      <img
        src={`data:image/png;base64,${explanation.artifact}`}
        alt={`${explanation.method} overlay`}
        className="w-full rounded-xl border border-line/10 bg-void-900/50"
      />
    );
  }

  if (explanation.artifact_type === "tokens") {
    return (
      <TokenAttributionViewer
        explanation={explanation}
        predictedLabel={predictedLabel}
        sourceText={sourceText}
      />
    );
  }

  if (explanation.artifact_type === "audio_segments") {
    let segments = [];
    try {
      segments = JSON.parse(explanation.artifact);
    } catch {
      return (
        <p className="text-xs text-slate-600">
          Could not parse the audio attribution payload.
        </p>
      );
    }

    const maxWeight =
      Math.max(1e-6, ...segments.map((item) => Math.abs(item.weight))) || 1;

    return (
      <div className="rounded-xl border border-line/10 bg-void-900/50 p-4">
        <p className="mb-3 text-xs font-semibold text-slate-300">
          Temporal Segment Attribution (Audio / Video)
        </p>
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {segments.map((item, index) => {
            const intensity = Math.min(1, Math.abs(item.weight) / maxWeight);
            const isPositive = item.weight >= 0;
            const barWidth = `${Math.max(4, Math.round(intensity * 100))}%`;

            return (
              <div key={index} className="flex items-center gap-3 text-xs font-mono">
                <span className="w-24 shrink-0 text-slate-400">
                  {item.start.toFixed(2)}s - {item.end.toFixed(2)}s
                </span>
                <div className="relative h-3.5 flex-1 overflow-hidden rounded bg-void-800">
                  <div
                    style={{
                      width: barWidth,
                      backgroundColor: isPositive
                        ? "rgba(255, 90, 90, 0.75)"
                        : "rgba(90, 140, 255, 0.75)",
                    }}
                    className="h-full rounded"
                  />
                </div>
                <span className="w-16 shrink-0 text-right text-slate-300" title="Attribution weight">
                  {item.weight > 0 ? `+${item.weight.toFixed(4)}` : item.weight.toFixed(4)}
                </span>
              </div>
            );
          })}
        </div>
        <p className="mt-3 flex items-center gap-3 font-mono text-[0.65rem] uppercase tracking-wider text-slate-600">
          <span className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: "rgba(255, 90, 90, 0.75)" }}
            />
            toward predicted label
          </span>
          <span className="flex items-center gap-1">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ background: "rgba(90, 140, 255, 0.75)" }}
            />
            away from it
          </span>
        </p>
      </div>
    );
  }

  return (
    <p className="text-xs text-slate-600">
      Unknown artefact type &quot;{explanation.artifact_type}&quot;.
    </p>
  );
}

function EvidenceCard({
  title,
  icon: Icon,
  count,
  items,
  loading,
  emptyText,
  actionLabel,
  isGenerating,
  onGenerate,
  onItemClick,
}) {
  return (
    <Card className="flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Icon className="h-4 w-4 text-slate-500" />
            <p className="hud-label">{title}</p>
          </div>
          <Badge tone={count > 0 ? "brand" : "neutral"}>{count}</Badge>
        </div>

        <div className="mt-4 space-y-2.5">
          {loading ? (
            <Skeleton className="h-20 w-full" />
          ) : items.length > 0 ? (
            items.slice(0, 4).map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => onItemClick?.(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onItemClick?.(item);
                }}
                className="group relative cursor-pointer rounded-xl border border-line/8 bg-void-900/40 p-3.5 transition hover:border-line/25 hover:bg-void-900/80"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-slate-200 group-hover:text-neon-400">
                    {item.primary}
                  </p>
                  <span className="text-[0.65rem] font-mono text-slate-500 uppercase shrink-0">
                    View
                  </span>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-slate-500 group-hover:text-slate-400">
                  {item.secondary}
                </p>
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-sm text-slate-600">
              <p>{emptyText}</p>
            </div>
          )}
        </div>
      </div>

      <div className="mt-5 border-t border-line/10 pt-3">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full justify-center text-xs"
          icon={Sparkles}
          loading={isGenerating}
          disabled={isGenerating}
          onClick={onGenerate}
        >
          {isGenerating ? "Analyzing…" : actionLabel}
        </Button>
      </div>
    </Card>
  );
}

function DetailModal({ type, item, onClose }) {
  if (!item) return null;

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const titles = {
    report: "Forensic Assessment Report",
    review: "Forensic Evidence & Diagnostics",
    bot: "Bot Analysis Assessment",
  };

  const icons = {
    report: FileText,
    review: Star,
    bot: Bot,
  };

  const Icon = icons[type] || FileText;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line/20 bg-void-950 p-6 shadow-2xl space-y-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-line/15 bg-void-900 text-neon-400">
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-display text-lg font-bold text-slate-100">
                {titles[type]}
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                Record #{item.id} · Prediction #{item.prediction_id} ·{" "}
                {formatDateTime(item.created_at)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-void-900 hover:text-slate-200 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {type === "report" && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="hud-label">Report Title</p>
              <p className="mt-1 text-base font-semibold text-slate-100">
                {item.report_title}
              </p>
            </div>

            <div>
              <p className="hud-label">Executive Summary</p>
              <div className="mt-2 rounded-xl border border-line/10 bg-void-900/60 p-4 text-slate-300 leading-relaxed whitespace-pre-line font-sans text-sm">
                {item.report_summary}
              </div>
            </div>

            {item.report_path && (
              <div>
                <p className="hud-label">Storage Location</p>
                <p className="mt-1 font-mono text-xs text-slate-400 break-all bg-void-900/40 p-2.5 rounded-lg border border-line/5">
                  {item.report_path}
                </p>
              </div>
            )}
          </div>
        )}

        {type === "review" && (
          <div className="space-y-4 text-sm">
            <div>
              <p className="hud-label">Model Engine</p>
              <Badge tone="neutral" className="mt-1">
                {item.model_name}
              </Badge>
            </div>

            <div>
              <p className="hud-label">Forensic Summary</p>
              <div className="mt-2 rounded-xl border border-line/10 bg-void-900/60 p-4 text-slate-200 font-medium">
                {item.summary}
              </div>
            </div>

            <div>
              <p className="hud-label">Detected Evidence & Signals</p>
              <div className="mt-2 rounded-xl border border-threat/20 bg-threat/5 p-4 text-xs text-slate-300 font-mono whitespace-pre-wrap leading-relaxed">
                {item.evidence}
              </div>
            </div>

            <div>
              <p className="hud-label">Actionable Recommendation</p>
              <div className="mt-2 rounded-xl border border-volt-500/20 bg-volt-500/5 p-4 text-xs text-slate-200 leading-relaxed">
                {item.recommendation}
              </div>
            </div>
          </div>
        )}

        {type === "bot" && (() => {
          const isBot = item.answer?.includes("Classification: Bot");
          const isSuspicious = item.answer?.includes("Classification: Suspicious");
          return (
            <div className="space-y-4 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="hud-label">Detection Engine</p>
                  <Badge tone="neutral" className="mt-1">
                    {item.model_name}
                  </Badge>
                </div>
                <div>
                  <p className="hud-label">Intelligence Verdict</p>
                  <Badge
                    tone={isBot ? "danger" : isSuspicious ? "warning" : "success"}
                    className="mt-1 font-semibold"
                  >
                    {isBot
                      ? "AUTOMATED BOT / SYNTHETIC PIPELINE"
                      : isSuspicious
                      ? "SUSPICIOUS PROGRAMMATIC PROFILE"
                      : "AUTHENTIC HUMAN ORIGIN"}
                  </Badge>
                </div>
              </div>

              <div>
                <p className="hud-label">Investigator Scope / Inquiry</p>
                <div className="mt-1.5 rounded-xl border border-line/10 bg-void-900/60 p-3.5 text-slate-200 font-semibold text-xs">
                  {item.question}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="hud-label">Forensic Bot Intelligence Dossier</p>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(item.answer);
                    }}
                    className="flex items-center gap-1 rounded border border-line/10 bg-void-900 px-2 py-0.5 text-[0.68rem] text-slate-400 hover:text-neon-400 transition"
                  >
                    <Copy className="h-3 w-3" /> Copy Dossier
                  </button>
                </div>
                <div className="mt-2 rounded-xl border border-neon-500/25 bg-void-950 p-4 text-xs text-slate-200 leading-relaxed font-mono whitespace-pre-wrap max-h-[45vh] overflow-y-auto border-l-2 border-l-neon-400">
                  {item.answer}
                </div>
              </div>
            </div>
          );
        })()}

        <div className="flex justify-end pt-3 border-t border-line/10">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}
