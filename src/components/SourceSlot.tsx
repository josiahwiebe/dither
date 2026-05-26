import { Upload } from "lucide-react";
import type { DragEvent } from "react";

import type { ComparisonSource } from "../lib/types";

interface SourceSlotProps {
  isDragActive: boolean;
  onPick: () => void;
  onSourceDragHover: (event: DragEvent<HTMLElement>) => void;
  onSourceDrop: (event: DragEvent<HTMLElement>) => void;
  side: "left" | "right";
  source: ComparisonSource | null;
}

/** Renders a single side of the comparison source picker. */
export function SourceSlot({ isDragActive, onPick, onSourceDragHover, onSourceDrop, side, source }: SourceSlotProps) {
  const label = side === "left" ? "Original" : "Changed";
  const slotState = source ? "source-slot source-slot--filled" : "source-slot";

  return (
    <section
      className={isDragActive ? `${slotState} source-slot--drop-active` : slotState}
      aria-label={`${label} source`}
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        onSourceDragHover(event);
      }}
      onDragEnter={onSourceDragHover}
      onDrop={onSourceDrop}
    >
      <div className="source-slot__meta">
        <span className="eyebrow">{label}</span>
        <strong>{source?.name ?? "No source selected"}</strong>
        <span title={source?.displayPath}>{source?.displayPath ?? "Choose a local file or folder"}</span>
      </div>
      <div className="source-slot__actions">
        <button type="button" className="icon-text-button" onClick={onPick}>
          <Upload size={16} aria-hidden="true" />
          Open
        </button>
      </div>
    </section>
  );
}
