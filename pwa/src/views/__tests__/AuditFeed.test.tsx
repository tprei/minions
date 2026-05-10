import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent, cleanup } from "@testing-library/react";
import type { AuditEvent } from "../../domain/types";

vi.mock("../../transport/rest", () => ({
  listAuditEvents: vi.fn(),
}));

import { AuditFeed } from "../AuditFeed";
import { listAuditEvents } from "../../transport/rest";
import { useAuditStore } from "../../store/useAuditStore";

function makeEvent(id: string): AuditEvent {
  return {
    id,
    timestamp: new Date().toISOString(),
    actor: "system",
    action: "task.created",
    workflowId: "wf-1",
  };
}

describe("AuditFeed", () => {
  beforeEach(() => {
    useAuditStore.setState({
      events: [],
      cursor: undefined,
      loading: false,
      done: false,
      filters: {},
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders empty state when no events", async () => {
    vi.mocked(listAuditEvents).mockResolvedValue([]);
    const { getByText } = render(<AuditFeed />);
    await act(async () => {});
    expect(getByText("No audit events")).toBeTruthy();
  });

  it("renders events after load", async () => {
    vi.mocked(listAuditEvents).mockResolvedValue([makeEvent("ev-1")]);
    const { getByText } = render(<AuditFeed />);
    await act(async () => {});
    expect(getByText("task.created")).toBeTruthy();
  });

  it("re-fetches when filter button is clicked", async () => {
    vi.mocked(listAuditEvents).mockResolvedValue([makeEvent("ev-1")]);
    const { getByText, getByPlaceholderText } = render(<AuditFeed />);
    await act(async () => {});

    const input = getByPlaceholderText("Filter by action…");
    fireEvent.change(input, { target: { value: "task.created" } });

    const filterBtn = getByText("Filter");
    await act(async () => {
      fireEvent.click(filterBtn);
    });

    expect(vi.mocked(listAuditEvents)).toHaveBeenCalledWith(
      expect.objectContaining({ action: "task.created" }),
    );
  });

  it("shows pull indicator text above threshold", async () => {
    vi.mocked(listAuditEvents).mockResolvedValue([]);
    const { queryByText } = render(<AuditFeed />);
    await act(async () => {});

    useAuditStore.setState({ loading: false });

    expect(queryByText("Release to refresh")).toBeNull();
    expect(queryByText("Pull to refresh")).toBeNull();
  });
});
