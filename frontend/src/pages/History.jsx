import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Search,
  Download,
  RefreshCw,
  Trash2,
  FileText,
  Activity,
  FileStack,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import apiClient, { apiError } from "../api/client";
import {
  Card,
  Button,
  Badge,
  PageHeader,
  EmptyState,
  Alert,
  Segmented,
  Input,
} from "../components/ui";
import { Skeleton } from "../components/ui/Skeleton";
import { verdictOf, statusTone } from "../lib/verdict";
import {
  formatDateTime,
  formatBytes,
  formatSeconds,
  fileMeta,
  exportCsv,
  getDocumentFileUrl,
} from "../lib/format";

const PAGE_SIZE = 12;

export default function History() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [tab, setTab] = useState("predictions");
  const [query, setQuery] = useState(() => searchParams.get("q") ?? "");
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(1);

  const [predictions, setPredictions] = useState([]);
  const [reports, setReports] = useState([]);
  const [documents, setDocuments] = useState([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError("");
    try {
      const [predictionsRes, reportsRes, documentsRes] = await Promise.all([
        apiClient.get("/predictions/", { params: { limit: 200 } }),
        apiClient.get("/reports/"),
        apiClient.get("/documents/", { params: { limit: 200 } }),
      ]);
      setPredictions(predictionsRes.data);
      setReports(reportsRes.data);
      setDocuments(documentsRes.data);
    } catch (err) {
      setError(apiError(err, "Unable to load history."));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Keep ?q= in the URL so a search is shareable and survives a reload —
  // this is also what the navbar search bar navigates to.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (query) next.set("q", query);
    else next.delete("q");
    setSearchParams(next, { replace: true });
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Document id -> filename, so the predictions table can show a real name
  // instead of a bare foreign key.
  const documentNames = useMemo(() => {
    const map = new Map();
    documents.forEach((document) =>
      map.set(document.id, document.original_file_name)
    );
    return map;
  }, [documents]);

  const rows = useMemo(() => {
    const term = query.trim().toLowerCase();

    const source =
      tab === "predictions" ? predictions : tab === "reports" ? reports : documents;

    const matches = source.filter((item) => {
      if (!term) return true;
      if (tab === "predictions") {
        return [
          item.predicted_label,
          item.model_name,
          item.processing_status,
          documentNames.get(item.document_id),
          `#${item.id}`,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      }
      if (tab === "reports") {
        return [item.report_title, item.report_summary, `#${item.id}`]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));
      }
      return [item.original_file_name, item.mime_type, item.description, `#${item.id}`]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });

    const dateKey = tab === "documents" ? "uploaded_at" : "created_at";

    return [...matches].sort((a, b) => {
      const diff = new Date(b[dateKey]) - new Date(a[dateKey]);
      return sortDesc ? diff : -diff;
    });
  }, [tab, query, predictions, reports, documents, documentNames, sortDesc]);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const handleDelete = async (id) => {
    const itemType =
      tab === "predictions"
        ? "prediction"
        : tab === "reports"
          ? "report"
          : "document";
    if (
      !window.confirm(
        `Are you sure you want to delete this ${itemType}? This action cannot be undone.`
      )
    ) {
      return;
    }
    const endpoint =
      tab === "predictions"
        ? `/predictions/${id}`
        : tab === "reports"
          ? `/reports/${id}`
          : `/documents/${id}`;

    setDeleting(id);
    setError("");
    try {
      await apiClient.delete(endpoint);
      await load(true);
    } catch (err) {
      setError(apiError(err, "Delete failed."));
    } finally {
      setDeleting(null);
    }
  };

  const handleExport = () => {
    const filename = `deepshieldai-${tab}-${new Date()
      .toISOString()
      .slice(0, 10)}.csv`;
    const ok = exportCsv(filename, rows);
    if (!ok) setError("Nothing to export in this view.");
  };

  const tabs = [
    { value: "predictions", label: "Predictions", count: predictions.length },
    { value: "reports", label: "Reports", count: reports.length },
    { value: "documents", label: "Documents", count: documents.length },
  ];

  const emptyCopy = {
    predictions: {
      icon: Activity,
      title: query ? "No matching predictions" : "No predictions recorded",
      description: query
        ? "Try a different search term."
        : "Analysis results will be listed here.",
    },
    reports: {
      icon: FileText,
      title: query ? "No matching reports" : "No reports generated",
      description: query
        ? "Try a different search term."
        : "Generated forensic reports will appear here (phase 11).",
    },
    documents: {
      icon: FileStack,
      title: query ? "No matching documents" : "No documents ingested",
      description: query
        ? "Try a different search term."
        : "Uploaded files will be listed here.",
    },
  }[tab];

  return (
    <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <PageHeader
          eyebrow="Archive"
          title="Analysis history"
          description="Every ingested file, recorded prediction and generated report, searchable and exportable."
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
              <Button size="sm" icon={Download} onClick={handleExport}>
                Export CSV
              </Button>
            </>
          }
        />

        {error && <Alert variant="error">{error}</Alert>}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Segmented
            options={tabs}
            value={tab}
            onChange={(value) => {
              setTab(value);
              setPage(1);
            }}
          />

          <div className="flex items-center gap-2.5">
            <div className="w-full sm:w-72">
              <Input
                icon={Search}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search this view…"
              />
            </div>
            <Button
              variant="secondary"
              size="md"
              icon={ArrowUpDown}
              onClick={() => setSortDesc((prev) => !prev)}
              title={sortDesc ? "Newest first" : "Oldest first"}
            >
              <span className="hidden md:inline">
                {sortDesc ? "Newest" : "Oldest"}
              </span>
            </Button>
          </div>
        </div>

        <Card padding="p-0" className="overflow-hidden">
          {loading ? (
            <div className="space-y-3 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : pageRows.length === 0 ? (
            <div className="p-6">
              <EmptyState {...emptyCopy} />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-line/10 bg-hover/[0.02]">
                      {tab === "predictions" && (
                        <>
                          <Th>ID</Th>
                          <Th>Verdict</Th>
                          <Th>Source file</Th>
                          <Th>Model</Th>
                          <Th>Status</Th>
                          <Th>Latency</Th>
                          <Th>Created</Th>
                          <Th className="text-right">—</Th>
                        </>
                      )}
                      {tab === "reports" && (
                        <>
                          <Th>ID</Th>
                          <Th>Title</Th>
                          <Th>Summary</Th>
                          <Th>Prediction</Th>
                          <Th>Created</Th>
                          <Th className="text-right">—</Th>
                        </>
                      )}
                      {tab === "documents" && (
                        <>
                          <Th>ID</Th>
                          <Th>File</Th>
                          <Th>Type</Th>
                          <Th>Size</Th>
                          <Th>Description</Th>
                          <Th>Uploaded</Th>
                          <Th className="text-right">—</Th>
                        </>
                      )}
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-line">
                    {pageRows.map((row) => {
                      if (tab === "predictions") {
                        const verdict = verdictOf(row.predicted_label);
                        return (
                          <tr key={row.id} className="transition hover:bg-hover/[0.03]">
                            <Td className="font-mono text-slate-500">#{row.id}</Td>
                            <Td>
                              <span
                                className={`inline-flex items-center gap-2 font-semibold ${verdict.text}`}
                              >
                                <span
                                  className="h-2 w-2 rounded-full"
                                  style={{ backgroundColor: verdict.chart }}
                                />
                                {row.predicted_label}
                              </span>
                            </Td>
                            <Td className="max-w-[16rem] truncate text-slate-400">
                              {documentNames.get(row.document_id) ??
                                `document #${row.document_id}`}
                            </Td>
                            <Td className="font-mono text-xs text-slate-500">
                              {row.model_name}
                            </Td>
                            <Td>
                              <Badge tone={statusTone(row.processing_status)}>
                                {row.processing_status}
                              </Badge>
                            </Td>
                            <Td className="font-mono text-xs text-slate-500">
                              {formatSeconds(row.processing_time)}
                            </Td>
                            <Td className="whitespace-nowrap text-xs text-slate-500">
                              {formatDateTime(row.created_at)}
                            </Td>
                            <Td className="text-right">
                              <DeleteButton
                                onClick={() => handleDelete(row.id)}
                                busy={deleting === row.id}
                              />
                            </Td>
                          </tr>
                        );
                      }

                      if (tab === "reports") {
                        return (
                          <tr key={row.id} className="transition hover:bg-hover/[0.03]">
                            <Td className="font-mono text-slate-500">#{row.id}</Td>
                            <Td className="font-semibold text-slate-200">
                              {row.report_title}
                            </Td>
                            <Td className="max-w-sm truncate text-slate-400">
                              {row.report_summary}
                            </Td>
                            <Td className="font-mono text-xs text-slate-500">
                              #{row.prediction_id}
                            </Td>
                            <Td className="whitespace-nowrap text-xs text-slate-500">
                              {formatDateTime(row.created_at)}
                            </Td>
                            <Td className="text-right">
                              <DeleteButton
                                onClick={() => handleDelete(row.id)}
                                busy={deleting === row.id}
                              />
                            </Td>
                          </tr>
                        );
                      }

                      const meta = fileMeta(row.original_file_name);
                      const Icon = meta.icon;
                      return (
                        <tr key={row.id} className="transition hover:bg-hover/[0.03]">
                          <Td className="font-mono text-slate-500">#{row.id}</Td>
                          <Td>
                            <span className="flex items-center gap-2.5">
                              <span
                                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${meta.accent}`}
                              >
                                <Icon className="h-3.5 w-3.5" />
                              </span>
                              <span className="max-w-[14rem] truncate font-semibold text-slate-200">
                                {row.original_file_name}
                              </span>
                            </span>
                          </Td>
                          <Td>
                            <Badge tone="neutral">{meta.type}</Badge>
                          </Td>
                          <Td className="font-mono text-xs text-slate-400">
                            {formatBytes(row.file_size)}
                          </Td>
                          <Td className="max-w-xs truncate text-slate-500">
                            {row.description || "—"}
                          </Td>
                          <Td className="whitespace-nowrap text-xs text-slate-500">
                            {formatDateTime(row.uploaded_at)}
                          </Td>
                          <Td className="text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() =>
                                  window.open(
                                    getDocumentFileUrl(row.id),
                                    "_blank"
                                  )
                                }
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-void-800 hover:text-neon-400"
                                title={`Open ${row.original_file_name}`}
                              >
                                <ExternalLink className="h-4 w-4" />
                              </button>
                              <DeleteButton
                                onClick={() => handleDelete(row.id)}
                                busy={deleting === row.id}
                              />
                            </div>
                          </Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col items-center justify-between gap-3 border-t border-line/10 px-6 py-3.5 sm:flex-row">
                <p className="font-mono text-xs text-slate-600">
                  {(safePage - 1) * PAGE_SIZE + 1}–
                  {Math.min(safePage * PAGE_SIZE, rows.length)} of {rows.length}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={ChevronLeft}
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <span className="px-2 font-mono text-xs text-slate-500">
                    {safePage} / {totalPages}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Th({ children, className = "" }) {
  return (
    <th
      className={`px-5 py-3 font-mono text-[0.65rem] font-medium uppercase tracking-[0.18em] text-slate-500 ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }) {
  return <td className={`px-5 py-3.5 align-middle ${className}`}>{children}</td>;
}

function DeleteButton({ onClick, busy }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-threat/10 hover:text-threat disabled:opacity-40"
      aria-label="Delete record"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
