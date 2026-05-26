import type { DiffSummary, StatusFilter } from "../lib/types";

interface StatusFilterBarProps {
  active: StatusFilter;
  onChange: (filter: StatusFilter) => void;
  summary: DiffSummary;
}

export const statusFilterItems = [
  { filter: "all", label: "All" },
  { filter: "changed", label: "Changed" },
  { filter: "equal", label: "Equal" },
  { filter: "left-only", label: "Left only" },
  { filter: "right-only", label: "Right only" },
  { filter: "issues", label: "Issues" }
] as const satisfies readonly { filter: StatusFilter; label: string }[];

function countForFilter(summary: DiffSummary, filter: StatusFilter) {
  if (filter === "all") return summary.total;
  if (filter === "changed") {
    return summary.modified + summary.leftOnly + summary.rightOnly + summary.typeChanged + summary.binary + summary.error;
  }
  if (filter === "equal") return summary.equal;
  if (filter === "left-only") return summary.leftOnly;
  if (filter === "right-only") return summary.rightOnly;
  return summary.binary + summary.skipped + summary.error + summary.typeChanged;
}

/** Provides segmented status filters for the directory result tree. */
export function StatusFilterBar({ active, onChange, summary }: StatusFilterBarProps) {
  return (
    <div className="segmented-control" aria-label="Diff status filter">
      {statusFilterItems.map((item) => (
        <button
          key={item.filter}
          type="button"
          className={active === item.filter ? "is-active" : undefined}
          onClick={() => onChange(item.filter)}
        >
          <span>{item.label}</span>
          <span className="pill">{countForFilter(summary, item.filter)}</span>
        </button>
      ))}
    </div>
  );
}
