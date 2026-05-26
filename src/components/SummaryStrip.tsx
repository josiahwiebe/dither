import { AlertCircle, CircleEqual, FileWarning, GitCompareArrows, Plus, Trash2 } from "lucide-react";

import type { DiffSummary } from "../lib/types";

interface SummaryStripProps {
  summary: DiffSummary;
}

const summaryItems = [
  { key: "modified", icon: GitCompareArrows, label: "Modified" },
  { key: "leftOnly", icon: Trash2, label: "Left only" },
  { key: "rightOnly", icon: Plus, label: "Right only" },
  { key: "equal", icon: CircleEqual, label: "Equal" },
  { key: "binary", icon: FileWarning, label: "Binary" },
  { key: "error", icon: AlertCircle, label: "Errors" }
] as const;

/** Displays high-signal counts for the current comparison. */
export function SummaryStrip({ summary }: SummaryStripProps) {
  return (
    <div className="summary-strip" aria-label="Comparison summary">
      {summaryItems.map(({ icon: Icon, key, label }) => (
        <div key={key} className="summary-chip">
          <Icon size={15} aria-hidden="true" />
          <span>{label}</span>
          <strong>{summary[key]}</strong>
        </div>
      ))}
    </div>
  );
}
