import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { StatusFilterBar } from "../../src/components/StatusFilterBar";
import type { DiffSummary } from "../../src/lib/types";

const summary: DiffSummary = {
  binary: 1,
  equal: 3,
  error: 1,
  leftOnly: 2,
  modified: 4,
  rightOnly: 5,
  skipped: 0,
  total: 16,
  typeChanged: 1
};

describe("StatusFilterBar", () => {
  it("renders counts and emits filter changes", async () => {
    const onChange = vi.fn();
    render(<StatusFilterBar active="changed" summary={summary} onChange={onChange} />);

    expect(screen.getByRole("button", { name: /All16/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Changed14/i })).toHaveClass("is-active");

    await userEvent.click(screen.getByRole("button", { name: /Equal3/i }));

    expect(onChange).toHaveBeenCalledWith("equal");
  });
});
