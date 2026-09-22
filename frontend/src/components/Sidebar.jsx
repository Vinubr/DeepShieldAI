import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  UploadCloud,
  ScanSearch,
  History as HistoryIcon,
  Puzzle,
  BookOpen,
  ShieldCheck,
  UserRound,
  Bot,
  Star,
  Boxes,
  ScrollText,
  LogOut,
  HelpCircle,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth.jsx";
import { useLayout } from "../hooks/useLayout.jsx";

/** Routes that actually exist and work. */
const LIVE_SECTIONS = [
  {
    title: "Operations",
    items: [
      { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
      { label: "Upload", to: "/upload", icon: UploadCloud },
      { label: "Analyze", to: "/predict", icon: ScanSearch },
      { label: "History", to: "/history", icon: HistoryIcon },
    ],
  },
  {
    title: "Intelligence",
    items: [
      { label: "Explainability", to: "/explain", icon: Puzzle },
      { label: "Review Forensics", to: "/explain?tab=review", icon: Star },
      { label: "Bot Analysis", to: "/explain?tab=bot", icon: Bot },
      { label: "Knowledge Base", to: "/rag", icon: BookOpen },
    ],
  },
  {
    title: "Account",
    items: [{ label: "Profile", to: "/profile", icon: UserRound }],
  },
];

/**
 * Modules that are not built yet — shown deliberately, tagged with the phase
 * that delivers them, rather than as links that go nowhere.
 */
const ROADMAP = [
  { label: "Model Registry", icon: Boxes, phase: "P5" },
  { label: "Audit Logs", icon: ScrollText, phase: "P11", adminOnly: true },
];

function NavItem({ item, collapsed, onNavigate }) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `group/nav relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition-all duration-200 ${
          collapsed ? "justify-center" : ""
        } ${
          isActive
            ? "bg-hover/8 text-slate-50"
            : "text-slate-400 hover:translate-x-0.5 hover:bg-hover/5 hover:text-slate-50"
        }`
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-all duration-200 ${
              isActive
                ? "bg-neon-gradient text-white shadow-tile"
                : "bg-hover/6 text-slate-400 group-hover/nav:bg-hover/12 group-hover/nav:text-slate-50"
            }`}
          >
            <Icon className="h-[17px] w-[17px]" strokeWidth={2} />
          </span>
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

function RoadmapItem({ item, collapsed }) {
  const Icon = item.icon;

  return (
    <div
      title={
        collapsed ? `${item.label} — ships in phase ${item.phase.slice(1)}` : undefined
      }
      className={`flex cursor-default items-center gap-3 rounded-2xl px-3 py-2 text-sm text-slate-500 transition-colors duration-200 hover:text-slate-400 ${
        collapsed ? "justify-center" : ""
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-hover/4">
        <Icon className="h-[17px] w-[17px]" strokeWidth={2} />
      </span>
      {!collapsed && (
        <>
          <span className="truncate">{item.label}</span>
          <span className="ml-auto rounded-md border border-line/10 bg-hover/5 px-1.5 py-0.5 font-mono text-[0.58rem] font-semibold text-slate-500">
            {item.phase}
          </span>
        </>
      )}
    </div>
  );
}

function SidebarContent({ collapsed, onLogoClick, onNavigate }) {
  const { logout, user, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const roadmap = ROADMAP.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="flex h-full flex-col border-r border-line/8 bg-void-800/60 backdrop-blur-2xl">
      {/* Brand — doubles as the sidebar toggle */}
      <div
        className={`flex h-[72px] items-center px-5 ${collapsed ? "justify-center px-0" : ""}`}
      >
        <button
          onClick={onLogoClick}
          title={collapsed ? "Expand menu" : "Collapse menu"}
          aria-label={collapsed ? "Expand menu" : "Collapse menu"}
          className="group/logo flex items-center gap-2.5 rounded-2xl p-1 transition-transform duration-200 hover:scale-[1.03] active:scale-95"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neon-gradient shadow-tile">
            <ShieldCheck className="h-5 w-5 text-white" strokeWidth={2.25} />
          </span>
          {!collapsed && (
            <span className="whitespace-nowrap text-[0.95rem] font-extrabold tracking-tight text-slate-50">
              DEEPSHIELD <span className="font-medium text-slate-400">AI</span>
            </span>
          )}
        </button>
      </div>

      <div className="neon-rule mx-4" />

      {/* Nav */}
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-5">
        {LIVE_SECTIONS.map((section) => (
          <div key={section.title}>
            {!collapsed && (
              <p className="mb-2 px-3 hud-label text-[0.62rem]">{section.title}</p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavItem
                  key={item.label}
                  item={item}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}

        <div>
          {!collapsed && (
            <p className="mb-2 px-3 hud-label text-[0.62rem]">Roadmap</p>
          )}
          <div className="space-y-0.5 opacity-70">
            {roadmap.map((item) => (
              <RoadmapItem key={item.label} item={item} collapsed={collapsed} />
            ))}
          </div>
        </div>
      </nav>

      {/* Help card — the reference has one in this exact slot */}
      {!collapsed && (
        <div className="mx-3 mb-3 overflow-hidden rounded-2xl bg-hero-gradient p-4 transition-transform duration-300 hover:scale-[1.02]">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/20 backdrop-blur">
            <HelpCircle className="h-4 w-4 text-white" />
          </span>
          <p className="mt-3 text-sm font-bold text-white">Need help?</p>
          <p className="mt-0.5 text-xs text-white/75">
            Read the project documentation
          </p>
          <a
            href="/docs"
            target="_blank"
            rel="noreferrer"
            className="mt-3 block rounded-xl bg-black/20 py-2 text-center text-[0.7rem] font-bold uppercase tracking-wide text-white transition hover:bg-black/30"
          >
            API reference
          </a>
        </div>
      )}

      {/* User */}
      <div className="border-t border-line/8 p-3">
        <button
          onClick={() => {
            navigate("/profile");
            onNavigate?.();
          }}
          className={`flex w-full items-center gap-3 rounded-2xl px-2 py-2 transition-colors duration-200 hover:bg-hover/6 ${
            collapsed ? "justify-center px-0" : ""
          }`}
          title={collapsed ? "Profile" : undefined}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-volt-gradient text-sm font-bold text-white">
            {(user?.fullName || user?.email || "U").slice(0, 1).toUpperCase()}
          </span>
          {!collapsed && (
            <span className="min-w-0 text-left">
              <span className="block truncate text-sm font-semibold text-slate-50">
                {user?.fullName || user?.email || "Operator"}
              </span>
              <span className="block truncate text-[0.7rem] font-medium text-neon-300">
                {user?.role ?? "…"}
              </span>
            </span>
          )}
        </button>

        <button
          onClick={handleLogout}
          title={collapsed ? "Sign out" : undefined}
          className={`mt-1 flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-sm font-semibold text-slate-500 transition-colors duration-200 hover:bg-threat/10 hover:text-threat ${
            collapsed ? "justify-center px-0" : ""
          }`}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-hover/6">
            <LogOut className="h-[17px] w-[17px]" strokeWidth={2} />
          </span>
          {!collapsed && "Sign out"}
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const { mobileOpen, closeMobile, collapsed, toggleCollapsed } = useLayout();

  return (
    <>
      {/* Desktop */}
      <aside
        className={`hidden shrink-0 transition-[width] duration-300 ease-out lg:block ${
          collapsed ? "w-[88px]" : "w-[264px]"
        }`}
      >
        <div
          className="fixed inset-y-0 z-20 flex h-full transition-[width] duration-300 ease-out"
          style={{ width: collapsed ? "88px" : "264px" }}
        >
          <SidebarContent collapsed={collapsed} onLogoClick={toggleCollapsed} />
        </div>
      </aside>

      {/* Mobile drawer */}
      <div
        className={`fixed inset-0 z-40 lg:hidden ${
          mobileOpen ? "pointer-events-auto" : "pointer-events-none"
        }`}
        aria-hidden={!mobileOpen}
      >
        <div
          onClick={closeMobile}
          className={`absolute inset-0 bg-void-900/80 backdrop-blur-sm transition-opacity duration-300 ${
            mobileOpen ? "opacity-100" : "opacity-0"
          }`}
        />
        <div
          className={`absolute inset-y-0 left-0 w-[82%] max-w-[280px] shadow-2xl transition-transform duration-300 ease-out ${
            mobileOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {/* On mobile the logo closes the drawer rather than collapsing it —
              an icon-only rail makes no sense in an overlay. */}
          <SidebarContent
            collapsed={false}
            onLogoClick={closeMobile}
            onNavigate={closeMobile}
          />
        </div>
      </div>
    </>
  );
}
