import { Film, Music, FileText, Image as ImageIcon, File } from "lucide-react";

export function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`;
}

export function formatDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatRelative(value) {
  if (!value) return "—";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "—";

  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

export function formatSeconds(value) {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (Number.isNaN(n)) return "—";
  return n < 1 ? `${(n * 1000).toFixed(0)} ms` : `${n.toFixed(2)} s`;
}

const EXT_MAP = [
  { exts: ["mp4", "mkv", "avi", "mov", "wmv"], icon: Film, accent: "text-neon-400 border-neon-500/25 bg-neon-500/10", type: "Video" },
  { exts: ["mp3", "wav", "aac", "flac", "ogg"], icon: Music, accent: "text-volt-400 border-volt-500/25 bg-volt-500/10", type: "Audio" },
  { exts: ["jpg", "jpeg", "png", "gif", "bmp", "webp"], icon: ImageIcon, accent: "text-clear border-clear/25 bg-clear/10", type: "Image" },
  { exts: ["txt", "pdf", "doc", "docx", "csv", "json", "xml"], icon: FileText, accent: "text-caution border-caution/25 bg-caution/10", type: "Text" },
];

export function fileMeta(name = "") {
  const ext = name.split(".").pop()?.toLowerCase();
  const match = EXT_MAP.find((entry) => entry.exts.includes(ext));
  return (
    match ?? {
      icon: File,
      accent: "text-slate-400 border-white/10 bg-white/5",
      type: "Unknown",
    }
  );
}

/**
 * Client-side CSV export.
 *
 * Values are quoted and internal quotes doubled, per RFC 4180 — without this
 * a filename containing a comma silently shifts every later column.
 */
export function exportCsv(filename, rows) {
  if (!rows?.length) return false;

  const headers = Object.keys(rows[0]);
  const escape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return `"${text.replace(/"/g, '""')}"`;
  };

  const csv = [
    headers.join(","),
    ...rows.map((row) => headers.map((key) => escape(row[key])).join(",")),
  ].join("\r\n");

  // Leading BOM so Excel opens UTF-8 correctly instead of mangling accents.
  const blob = new Blob(["﻿" + csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}

/**
 * Returns the authenticated direct file access URL for a document.
 * Can be used in <img>, <video>, <audio>, window.open(), or <a href="...">.
 */
export function getDocumentFileUrl(documentId, download = false) {
  if (!documentId) return "";
  const token = localStorage.getItem("access_token");
  const baseUrl = `/api/documents/${documentId}/file`;
  const params = new URLSearchParams();
  if (token) params.set("token", token);
  if (download) params.set("download", "true");
  const query = params.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

