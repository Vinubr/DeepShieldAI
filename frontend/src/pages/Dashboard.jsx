import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import {
  FileStack,
  Activity,
  FileText,
  BookOpen,
  Download,
  RefreshCw,
  Cpu,
  Gauge as GaugeIcon,
  Timer,
  UploadCloud,
  ScanSearch,
  ArrowRight,
  Layers,
  CircleDot,
} from "lucide-react";
import apiClient, { apiError } from "../api/client";
import {
  Card,
  Badge,
  Button,
  PageHeader,
  EmptyState,
  Alert,
  StatCard,
  Gauge,
} from "../components/ui";
import { SkeletonCard, Skeleton } from "../components/ui/Skeleton";
import { useAuth } from "../hooks/useAuth.jsx";
import { verdictOf, statusTone, CHART_PALETTE } from "../lib/verdict";
import { formatRelative, formatSeconds, exportCsv } from "../lib/format";

const EMPTY_STATS = {
  total_predictions: 0,
  total_documents: 0,
  total_reports: 0,
  total_knowledge_entries: 0,
  average_confidence: null,
  average_processing_time: null,
  label_breakdown: [],
  status_breakdown: [],
  model_breakdown: [],
  document_type_breakdown: [],
  daily_counts: [],
};

function ChartTooltip({ active, payload, label, suffix = "" }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-line/12 bg-void-700/95 px-3 py-2 shadow-xl backdrop-blur-md">
      <p className="text-[0.66rem] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      {payload.map((entry) => (
        <p
          key={entry.dataKey ?? entry.name}
          className="text-sm font-bold text-slate-50"
        >
          {entry.value}
          {suffix}
          <span className="ml-1.5 text-xs font-normal text-slate-400">
            {entry.name}
          </span>
        </p>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();

  const [stats, setStats] = useState(EMPTY_STATS);
  const [predictions, setPredictions] = useState([]);
  const [documents, setDocuments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastSynced, setLastSynced] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError("");

    try {
      const [statsRes, predictionsRes, documentsRes] = await Promise.all([
        apiClient.get("/predictions/stats", { params: { days: 14 } }),
        apiClient.get("/predictions/", { params: { limit: 8 } }),
        apiClient.get("/documents/", { params: { limit: 6 } }),
      ]);

      setStats(statsRes.data);
      setPredictions(predictionsRes.data);
      setDocuments(documentsRes.data);
      setLastSynced(new Date());
    } catch (err) {
      setError(apiError(err, "Unable to load dashboard data."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const dailySeries = useMemo(
    () =>
      stats.daily_counts.map((entry) => ({
        day: new Date(entry.day).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
        count: entry.count,
      })),
    [stats.daily_counts]
  );

  const labelSeries = useMemo(
    () =>
      stats.label_breakdown.map((entry) => ({
        name: entry.name,
        value: entry.count,
        fill: verdictOf(entry.name).chart,
      })),
    [stats.label_breakdown]
  );

  const threatShare = useMemo(() => {
    if (!stats.total_predictions) return 0;
    const flagged = stats.label_breakdown
      .filter((entry) => entry.name === "Deepfake" || entry.name === "Suspicious")
      .reduce((sum, entry) => sum + entry.count, 0);
    return (flagged / stats.total_predictions) * 10;
  }, [stats]);

  const activity = useMemo(() => {
    const fromPredictions = predictions.map((p) => ({
      id: `p-${p.id}`,
      icon: verdictOf(p.predicted_label).icon,
      tile: verdictOf(p.predicted_label).tile,
      title: p.predicted_label,
      detail: `${p.model_name} · document #${p.document_id}`,
      at: p.created_at,
    }));

    const fromDocuments = documents.map((d) => ({
      id: `d-${d.id}`,
      icon: UploadCloud,
      tile: "bg-volt-gradient",
      title: "File uploaded",
      detail: d.original_file_name,
      at: d.uploaded_at,
    }));

    return [...fromPredictions, ...fromDocuments]
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 6);
  }, [predictions, documents]);

  const handleExport = () => {
    const ok = exportCsv(
      `deepshieldai-predictions-${new Date().toISOString().slice(0, 10)}.csv`,
      predictions.map((p) => ({
        id: p.id,
        document_id: p.document_id,
        predicted_label: p.predicted_label,
        confidence_score: p.confidence_score,
        model_name: p.model_name,
        processing_status: p.processing_status,
        processing_time_seconds: p.processing_time ?? "",
        created_at: p.created_at,
      }))
    );
    if (!ok) setError("Nothing to export yet — run an analysis first.");
  };

  const summaryCards = [
    {
      label: "Documents",
      value: stats.total_documents,
      hint: "Files ingested",
      icon: FileStack,
      accent: "neon",
    },
    {
      label: "Predictions",
      value: stats.total_predictions,
      hint: "Analyses recorded",
      icon: Activity,
      accent: "volt",
    },
    {
      label: "Reports",
      value: stats.total_reports ?? 0,
      hint: "Forensic dossiers",
      icon: FileStack,
      accent: "clear",
    },
    {
      label: "Avg latency",
      value: formatSeconds(stats.average_processing_time),
      hint: "Per analysis",
      icon: Timer,
      accent: "caution",
    },
  ];

  if (loading) {
    return (
      <div className="px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1400px] space-y-6">
          <Skeleton className="h-12 w-80" />
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px] space-y-5">
        <PageHeader
          eyebrow="System overview"
          title="Detection command center"
          description="Live telemetry across ingestion, inference, explainability and retrieval."
          actions={
            <>
              <span className="hidden text-[0.7rem] text-slate-500 sm:block">
                {lastSynced ? `synced ${formatRelative(lastSynced)}` : ""}
              </span>
              <Button
                variant="secondary"
                size="sm"
                icon={RefreshCw}
                loading={refreshing}
                onClick={() => load(true)}
              >
                Refresh
              </Button>
              <Button size="sm" icon={Download} onClick={handleExport}>
                Export CSV
              </Button>
            </>
          }
        />

        {error && <Alert variant="error">{error}</Alert>}

        {/* KPI row */}
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <StatCard key={card.label} {...card} />
          ))}
        </div>

        {/* Hero · gauge · verdict mix */}
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-[1.35fr_1fr_1fr]">
          {/* Welcome hero */}
          <Card
            padding="p-0"
            className="relative overflow-hidden lg:col-span-2 xl:col-span-1"
          >
            <div className="absolute inset-0 bg-hero-gradient opacity-90" />
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 78% 30%, rgba(255,255,255,0.35), transparent 45%)",
              }}
            />
            <div className="relative flex h-full min-h-[240px] flex-col justify-between p-6">
              <div>
                <p className="text-xs font-semibold text-white/70">
                  Welcome back
                </p>
                <p className="mt-1.5 text-2xl font-bold tracking-tight text-white">
                  {user?.fullName || user?.email || "Operator"}
                </p>
                <p className="mt-3 max-w-xs text-sm leading-relaxed text-white/75">
                  Glad to see you again. Upload media or run detection to keep the
                  archive current.
                </p>
              </div>

              <Link
                to="/upload"
                className="group/cta mt-6 inline-flex w-fit items-center gap-2 text-sm font-bold text-white"
              >
                Ingest new media
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover/cta:translate-x-1" />
              </Link>
            </div>
          </Card>

          {/* Integrity verification gauge */}
          <Card className="flex flex-col">
            <p className="text-sm font-bold text-slate-50">Integrity verification</p>
            <p className="mt-1 text-xs text-slate-400">Authentic vs synthetic share</p>

            <div className="flex flex-1 items-center justify-center pt-4">
              {stats.total_predictions > 0 ? (
                <Gauge
                  value={Math.max(0, Math.min(100, Math.round(100 - threatShare * 10)))}
                  caption="Authentic share"
                  size={190}
                />
              ) : (
                <EmptyState
                  icon={GaugeIcon}
                  title="No runs yet"
                  className="w-full"
                />
              )}
            </div>
          </Card>

          {/* Verdict mix + threat score */}
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-slate-50">Verdict mix</p>
                <p className="mt-1 text-xs text-slate-400">
                  Distribution of outcomes
                </p>
              </div>
              <Badge tone="brand">{stats.total_predictions}</Badge>
            </div>

            {labelSeries.length > 0 ? (
              <div className="mt-4 flex items-center gap-4">
                <div className="relative h-32 w-32 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={labelSeries}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={40}
                        outerRadius={62}
                        paddingAngle={3}
                        stroke="none"
                      >
                        {labelSeries.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip />} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-bold text-slate-50">
                      {threatShare.toFixed(1)}
                    </span>
                    <span className="text-[0.6rem] text-slate-500">risk /10</span>
                  </div>
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  {labelSeries.map((entry) => (
                    <div
                      key={entry.name}
                      className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition-colors duration-200 hover:bg-hover/5"
                    >
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.fill }}
                      />
                      <span className="truncate text-slate-300">{entry.name}</span>
                      <span className="ml-auto font-mono text-xs text-slate-500">
                        {entry.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                icon={CircleDot}
                title="No verdicts recorded"
                className="mt-4"
              />
            )}
          </Card>
        </div>

        {/* Volume + pipeline */}
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-bold text-slate-50">Analysis volume</p>
                <p className="mt-1 text-xs text-slate-400">
                  Predictions per day, last 14 days
                </p>
              </div>
              <Badge tone="info">14d</Badge>
            </div>

            <div className="mt-5 h-64">
              {dailySeries.some((d) => d.count > 0) ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={dailySeries}
                    margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="volumeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0075ff" stopOpacity={0.55} />
                        <stop offset="100%" stopColor="#0075ff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      stroke="rgba(148,163,184,0.1)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10, fill: "#718096" }}
                      axisLine={false}
                      tickLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: "#718096" }}
                      axisLine={false}
                      tickLine={false}
                      width={36}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ stroke: "rgba(0,117,255,0.4)", strokeWidth: 1 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name="runs"
                      stroke="#21d4fd"
                      strokeWidth={3}
                      fill="url(#volumeFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={Activity}
                  title="No activity in this window"
                  description="Analyses will chart here as they are recorded."
                  className="h-full"
                />
              )}
            </div>
          </Card>

          <Card>
            <p className="text-sm font-bold text-slate-50">Ingestion by type</p>
            <p className="mt-1 text-xs text-slate-400">
              Uploaded documents grouped by modality
            </p>

            <div className="mt-5 h-40">
              {stats.document_type_breakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={stats.document_type_breakdown}
                    margin={{ top: 4, right: 8, left: -26, bottom: 0 }}
                  >
                    <CartesianGrid
                      stroke="rgba(148,163,184,0.1)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 10, fill: "#718096" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: "#718096" }}
                      axisLine={false}
                      tickLine={false}
                      width={34}
                    />
                    <Tooltip
                      content={<ChartTooltip />}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Bar dataKey="count" name="files" radius={[8, 8, 8, 8]}>
                      {stats.document_type_breakdown.map((entry, index) => (
                        <Cell
                          key={entry.name}
                          fill={CHART_PALETTE[index % CHART_PALETTE.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  icon={FileStack}
                  title="Nothing ingested yet"
                  className="h-full"
                />
              )}
            </div>

            <div className="neon-rule my-5" />

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-2">
              {[
                { icon: FileText, label: "Reports", value: stats.total_reports },
                {
                  icon: BookOpen,
                  label: "Knowledge",
                  value: stats.total_knowledge_entries,
                },
                { icon: Cpu, label: "Models", value: stats.model_breakdown.length },
                {
                  icon: Layers,
                  label: "Statuses",
                  value: stats.status_breakdown.length,
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div
                    key={item.label}
                    className="rounded-xl border border-line/8 bg-void-700/40 px-3 py-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-neon-500/30"
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-3.5 w-3.5 text-neon-400" />
                      <span className="text-[0.68rem] text-slate-400">
                        {item.label}
                      </span>
                    </div>
                    <p className="mt-1 text-lg font-bold text-slate-50">
                      {item.value}
                    </p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Predictions table + activity stream */}
        <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
          <Card padding="p-0">
            <div className="flex items-center justify-between px-6 pb-4 pt-6">
              <div>
                <p className="text-sm font-bold text-slate-50">Recent predictions</p>
                <p className="mt-1 text-xs text-slate-400">
                  Latest {predictions.length} records
                </p>
              </div>
              <Button
                as={Link}
                to="/history"
                variant="ghost"
                size="sm"
                icon={ArrowRight}
              >
                View all
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-y border-line/8">
                    {["Verdict", "Model", "Status", "When"].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="px-6 py-3 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-slate-500"
                        >
                          {heading}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {predictions.length > 0 ? (
                    predictions.slice(0, 6).map((row) => {
                      const rowVerdict = verdictOf(row.predicted_label);
                      const RowIcon = rowVerdict.icon;
                      return (
                        <tr
                          key={row.id}
                          className="transition-colors duration-200 hover:bg-hover/[0.04]"
                        >
                          <td className="px-6 py-3.5">
                            <span className="flex items-center gap-2.5">
                              <span
                                className={`flex h-7 w-7 items-center justify-center rounded-lg ${rowVerdict.tile}`}
                              >
                                <RowIcon className="h-3.5 w-3.5 text-white" />
                              </span>
                              <span
                                className={`font-semibold ${rowVerdict.text}`}
                              >
                                {row.predicted_label}
                              </span>
                            </span>
                          </td>
                          <td className="px-6 py-3.5 font-mono text-xs text-slate-500">
                            {row.model_name}
                          </td>
                          <td className="px-6 py-3.5">
                            <Badge tone={statusTone(row.processing_status)}>
                              {row.processing_status}
                            </Badge>
                          </td>
                          <td className="whitespace-nowrap px-6 py-3.5 text-xs text-slate-500">
                            {formatRelative(row.created_at)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="p-6">
                        <EmptyState
                          icon={ScanSearch}
                          title="No predictions yet"
                          description="Upload a file and run detection."
                          action={
                            <Button
                              as={Link}
                              to="/upload"
                              size="sm"
                              icon={UploadCloud}
                            >
                              Upload a file
                            </Button>
                          }
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card padding="p-0">
            <div className="px-6 pb-4 pt-6">
              <p className="text-sm font-bold text-slate-50">Activity stream</p>
              <p className="mt-1 text-xs text-slate-400">
                Ingestion and inference events
              </p>
            </div>

            <div className="px-6 pb-6">
              {activity.length > 0 ? (
                <ol className="relative space-y-5 border-l border-line/8 pl-6">
                  {activity.map((item) => {
                    const Icon = item.icon;
                    return (
                      <li key={item.id} className="group/ev relative">
                        <span
                          className={`absolute -left-[34px] flex h-7 w-7 items-center justify-center rounded-lg ${item.tile} transition-transform duration-200 group-hover/ev:scale-110`}
                        >
                          <Icon className="h-3.5 w-3.5 text-white" />
                        </span>
                        <p className="truncate text-sm font-semibold text-slate-200">
                          {item.title}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {item.detail}
                        </p>
                        <p className="mt-0.5 font-mono text-[0.64rem] text-slate-600">
                          {formatRelative(item.at)}
                        </p>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyState
                  icon={Activity}
                  title="No events yet"
                  description="Uploads and analyses will stream here."
                />
              )}
            </div>
          </Card>
        </div>

        <Alert variant="pending" title="Partial model coverage">
          Image detection runs on the trained MobileNetV2 model. Audio, text and
          review detectors are configured but their weight files are missing, and
          video, XAI overlays and semantic retrieval are not built yet — see the
          detector registry on the Analyze page for live status.
        </Alert>
      </div>
    </div>
  );
}
