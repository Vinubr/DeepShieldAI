import { ShieldAlert, ShieldCheck, ShieldQuestion, Shield } from "lucide-react";

/**
 * Single source of truth for how a predicted label is rendered.
 *
 * Every page displays verdicts, and before this existed each one had its own
 * inline colour map — which is how the same label ended up amber on one
 * screen and grey on another. Import from here instead.
 */
const threatStyle = {
  tone: "threat",
  badge: "danger",
  text: "text-threat",
  ring: "border-threat/30 bg-threat/10 text-threat",
  tile: "bg-gradient-to-br from-threat to-volt-600",
  chart: "#ff5b5b",
  icon: ShieldAlert,
};

const clearStyle = {
  tone: "clear",
  badge: "success",
  text: "text-clear",
  ring: "border-clear/30 bg-clear/10 text-clear",
  tile: "bg-gradient-to-br from-clear to-aqua-500",
  chart: "#01b574",
  icon: ShieldCheck,
};

const cautionStyle = {
  tone: "caution",
  badge: "warning",
  text: "text-caution",
  ring: "border-caution/30 bg-caution/10 text-caution",
  tile: "bg-gradient-to-br from-caution to-threat",
  chart: "#ffb547",
  icon: ShieldQuestion,
};

const MAP = {
  Deepfake: threatStyle,
  Fake: threatStyle,
  CG: threatStyle,
  Bot: threatStyle,
  Genuine: clearStyle,
  Real: clearStyle,
  OR: clearStyle,
  Human: clearStyle,
  Suspicious: cautionStyle,
};

const FALLBACK = {
  tone: "neon",
  badge: "neutral",
  text: "text-slate-300",
  ring: "border-white/10 bg-white/5 text-slate-400",
  tile: "bg-neon-gradient",
  chart: "#0075ff",
  icon: Shield,
};

export function verdictOf(label) {
  return MAP[label] ?? FALLBACK;
}

/** Status pill tones for `processing_status`. */
export function statusTone(status) {
  switch (status) {
    case "Completed":
      return "success";
    case "Processing":
      return "info";
    case "Failed":
      return "danger";
    case "Pending":
    default:
      return "neutral";
  }
}

/** Stable chart colours, in the order categories are encountered. */
export const CHART_PALETTE = [
  "#0075ff",
  "#582cff",
  "#21d4fd",
  "#01b574",
  "#ffb547",
  "#ff5b5b",
];
