import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Menu,
  Search,
  Bell,
  Settings,
  ChevronDown,
  LogOut,
  UserRound,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  UploadCloud,
  RefreshCw,
  ClipboardCopy,
  Check,
  Sun,
  Moon,
} from "lucide-react";
import apiClient from "../api/client";
import { useAuth } from "../hooks/useAuth.jsx";
import { useLayout } from "../hooks/useLayout.jsx";
import { useTheme } from "../hooks/useTheme.jsx";
import { formatRelative } from "../lib/format";

const VERDICT_ICON = {
  Deepfake: { icon: ShieldAlert, tone: "text-threat bg-threat/12" },
  Genuine: { icon: ShieldCheck, tone: "text-clear bg-clear/12" },
  Suspicious: { icon: ShieldQuestion, tone: "text-caution bg-caution/12" },
};

const PAGE_TITLES = {
  "/dashboard": "Dashboard",
  "/upload": "Upload",
  "/predict": "Analyze",
  "/history": "History",
  "/explain": "Explainability",
  "/rag": "Knowledge Base",
  "/profile": "Profile",
};

function useClickOutside(ref, onOutside) {
  useEffect(() => {
    const handler = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onOutside();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ref, onOutside]);
}

/** Builds the notification feed from real API data. */
function useActivityFeed() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [predictions, documents] = await Promise.all([
        apiClient.get("/predictions/", { params: { limit: 5 } }),
        apiClient.get("/documents/", { params: { limit: 5 } }),
      ]);

      const merged = [
        ...predictions.data.map((p) => ({
          id: `prediction-${p.id}`,
          kind: "prediction",
          label: p.predicted_label,
          title: p.predicted_label,
          detail: `${p.model_name} · document #${p.document_id}`,
          at: p.created_at,
          to: "/history",
        })),
        ...documents.data.map((d) => ({
          id: `document-${d.id}`,
          kind: "document",
          title: "File uploaded",
          detail: d.original_file_name,
          at: d.uploaded_at,
          to: "/upload",
        })),
      ]
        .sort((a, b) => new Date(b.at) - new Date(a.at))
        .slice(0, 6);

      setItems(merged);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, reload: load };
}

export default function Navbar() {
  const { toggleMobile } = useLayout();
  const { logout, user, token } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const [notifOpen, setNotifOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);

  const notifRef = useRef(null);
  const userRef = useRef(null);
  const searchRef = useRef(null);

  useClickOutside(notifRef, () => setNotifOpen(false));
  useClickOutside(userRef, () => setUserOpen(false));

  const { items, loading, reload } = useActivityFeed();

  useEffect(() => {
    const handler = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const pageTitle = PAGE_TITLES[location.pathname] ?? "DeepShieldAI";

  const handleSearch = (event) => {
    event.preventDefault();
    const term = query.trim();
    if (!term) return;
    navigate(`/history?q=${encodeURIComponent(term)}`);
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(token ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const initials = (user?.fullName || user?.email || "U")
    .slice(0, 1)
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 px-4 pt-4 lg:px-8">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line/8 bg-void-800/50 px-4 py-3 backdrop-blur-2xl">
        <button
          onClick={toggleMobile}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-all duration-200 hover:bg-hover/8 hover:text-slate-50 lg:hidden"
          aria-label="Open navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumb + title */}
        <div className="mr-auto min-w-0">
          <p className="truncate text-[0.7rem] text-slate-500">
            <Link
              to="/dashboard"
              className="transition-colors hover:text-slate-300"
            >
              Pages
            </Link>
            <span className="mx-1.5 text-slate-600">/</span>
            <span className="text-slate-400">{pageTitle}</span>
          </p>
          <p className="truncate text-sm font-bold text-slate-50">{pageTitle}</p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="order-last w-full sm:order-none sm:w-auto">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              ref={searchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              type="search"
              placeholder="Type here..."
              className="w-full rounded-xl border border-line/10 bg-void-700/60 py-2.5 pl-10 pr-14 text-sm text-slate-200 transition-all duration-200 placeholder:text-slate-500 hover:border-line/20 focus:border-neon-500/60 focus:outline-none focus:ring-4 focus:ring-neon-500/15 sm:w-56 lg:w-64"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line/10 bg-hover/5 px-1.5 py-0.5 font-mono text-[0.6rem] text-slate-500 sm:block">
              ⌘K
            </kbd>
          </div>
        </form>

        <div className="flex items-center gap-1">
          {/* Notifications */}
          <div className="relative" ref={notifRef}>
            <button
              onClick={() => {
                setNotifOpen((prev) => !prev);
                setUserOpen(false);
              }}
              className="relative flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-all duration-200 hover:bg-hover/8 hover:text-slate-50"
              aria-label="Recent activity"
            >
              <Bell className="h-5 w-5" />
              {items.length > 0 && (
                <span className="absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-neon-500 px-1 font-mono text-[0.56rem] font-bold text-white ring-2 ring-void-800">
                  {items.length}
                </span>
              )}
            </button>

            {notifOpen && (
              <div className="panel absolute right-0 mt-2 w-[21rem] origin-top-right animate-fadeIn p-2">
                <div className="flex items-center justify-between px-3 py-2">
                  <p className="hud-label">Recent activity</p>
                  <button
                    onClick={reload}
                    className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[0.7rem] font-bold text-neon-400 transition hover:bg-hover/8"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
                    />
                    Refresh
                  </button>
                </div>
                <div className="neon-rule mx-2" />

                <div className="mt-1 max-h-80 space-y-0.5 overflow-y-auto">
                  {loading ? (
                    <p className="px-3 py-6 text-center text-sm text-slate-500">
                      Loading activity…
                    </p>
                  ) : items.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-slate-500">
                      No activity yet. Upload a file to get started.
                    </p>
                  ) : (
                    items.map((item) => {
                      const verdict =
                        item.kind === "prediction" ? VERDICT_ICON[item.label] : null;
                      const Icon = verdict?.icon ?? UploadCloud;
                      const tone = verdict?.tone ?? "text-neon-400 bg-neon-500/12";

                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            setNotifOpen(false);
                            navigate(item.to);
                          }}
                          className="flex w-full gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200 hover:translate-x-0.5 hover:bg-hover/6"
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone}`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-slate-200">
                              {item.title}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {item.detail}
                            </span>
                            <span className="mt-0.5 block font-mono text-[0.64rem] text-slate-600">
                              {formatRelative(item.at)}
                            </span>
                          </span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-all duration-200 hover:bg-hover/8 hover:text-slate-50"
            aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
            title={isDark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {/* Settings shortcut */}
          <Link
            to="/profile"
            className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 transition-all duration-200 hover:rotate-45 hover:bg-hover/8 hover:text-slate-50"
            aria-label="Profile settings"
          >
            <Settings className="h-5 w-5" />
          </Link>

          {/* User menu */}
          <div className="relative" ref={userRef}>
            <button
              onClick={() => {
                setUserOpen((prev) => !prev);
                setNotifOpen(false);
              }}
              className="flex items-center gap-2.5 rounded-xl border border-transparent py-1.5 pl-1.5 pr-2.5 transition-all duration-200 hover:border-line/10 hover:bg-hover/6"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-volt-gradient text-xs font-bold text-white">
                {initials}
              </span>
              <span className="hidden text-left md:block">
                <span className="block max-w-[10rem] truncate text-sm font-semibold leading-tight text-slate-50">
                  {user?.fullName || user?.email || "Account"}
                </span>
                <span className="block text-[0.66rem] font-medium leading-tight text-neon-300">
                  {user?.role ?? "…"}
                </span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-slate-500 transition-transform duration-200 ${
                  userOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {userOpen && (
              <div className="panel absolute right-0 mt-2 w-60 origin-top-right animate-fadeIn p-1.5">
                <div className="px-3 py-2.5">
                  <p className="truncate text-sm font-bold text-slate-50">
                    {user?.fullName ?? "Signed in"}
                  </p>
                  <p className="truncate text-xs text-slate-500">{user?.email}</p>
                  <p className="mt-2 inline-flex rounded-md bg-neon-500/12 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wide text-neon-300 ring-1 ring-inset ring-neon-500/25">
                    {user?.role ?? "unknown role"}
                  </p>
                </div>

                <div className="neon-rule my-1" />

                <button
                  onClick={() => {
                    setUserOpen(false);
                    navigate("/profile");
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition-all duration-200 hover:translate-x-0.5 hover:bg-hover/6 hover:text-slate-50"
                >
                  <UserRound className="h-4 w-4" /> Edit profile
                </button>

                <button
                  onClick={copyToken}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-400 transition-all duration-200 hover:translate-x-0.5 hover:bg-hover/6 hover:text-slate-50"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-clear" />
                  ) : (
                    <ClipboardCopy className="h-4 w-4" />
                  )}
                  {copied ? "Token copied" : "Copy access token"}
                </button>

                <div className="neon-rule my-1" />

                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-bold text-threat transition-all duration-200 hover:translate-x-0.5 hover:bg-threat/10"
                >
                  <LogOut className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
