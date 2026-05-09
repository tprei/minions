import { describe, it, expect, beforeEach } from "vitest";
import { createPassport } from "../../../pwa/assets/views/passport.js";

beforeEach(() => {
  document.body.innerHTML = '';
});

function makeWorkflows() {
  return [
    { id: 'wf-alpha', status: 'active', createdAt: '2026-01-01T00:00:00Z' },
    { id: 'wf-beta',  status: 'completed', createdAt: '2026-03-01T00:00:00Z' },
    { id: 'wf-gamma', status: 'failed', createdAt: '2026-02-01T00:00:00Z' },
  ];
}

describe("createPassport", () => {
  it("renders all workflows", () => {
    const { element } = createPassport({ workflows: makeWorkflows() });
    document.body.appendChild(element);

    const rows = document.querySelectorAll('.passport-row');
    expect(rows.length).toBe(3);
  });

  it("each row shows status pill", () => {
    const { element } = createPassport({ workflows: makeWorkflows() });
    document.body.appendChild(element);

    const pills = document.querySelectorAll('.passport-status-pill');
    expect(pills.length).toBe(3);
  });

  it("each row shows creation timestamp", () => {
    const { element } = createPassport({ workflows: makeWorkflows() });
    document.body.appendChild(element);

    const timestamps = document.querySelectorAll('.passport-created');
    expect(timestamps[0]?.textContent).toBeTruthy();
  });

  it("sort by name produces alphabetical order of city aliases", () => {
    const { element } = createPassport({ workflows: makeWorkflows() });
    document.body.appendChild(element);

    const sortBtn = Array.from(document.querySelectorAll('.passport-sort-btn'))
      .find((b) => b.textContent === 'name') as HTMLElement;
    sortBtn?.click();

    const aliases = Array.from(document.querySelectorAll('.passport-alias')).map((el) => el.textContent ?? '');
    const sorted = [...aliases].sort();
    expect(aliases).toEqual(sorted);
  });

  it("sort by created puts newest first", () => {
    const { element } = createPassport({ workflows: makeWorkflows() });
    document.body.appendChild(element);

    const sortBtn = Array.from(document.querySelectorAll('.passport-sort-btn'))
      .find((b) => b.textContent === 'created') as HTMLElement;
    sortBtn?.click();

    const tsBadges = Array.from(document.querySelectorAll('.passport-created')).map((el) => el.textContent ?? '');
    expect(tsBadges[0]).toBe('2026-03-01');
    expect(tsBadges[1]).toBe('2026-02-01');
    expect(tsBadges[2]).toBe('2026-01-01');
  });

  it("sort by status groups correctly", () => {
    const { element } = createPassport({ workflows: makeWorkflows() });
    document.body.appendChild(element);

    const sortBtn = Array.from(document.querySelectorAll('.passport-sort-btn'))
      .find((b) => b.textContent === 'status') as HTMLElement;
    sortBtn?.click();

    const pills = Array.from(document.querySelectorAll('.passport-status-pill')).map((el) => el.textContent ?? '');
    expect(pills[0]).toBe('active');
    expect(pills[1]).toBe('completed');
    expect(pills[2]).toBe('failed');
  });

  it("clicking a row navigates to workflow hash", () => {
    const { element } = createPassport({ workflows: makeWorkflows() });
    document.body.appendChild(element);

    const row = document.querySelector('.passport-row') as HTMLElement;
    row?.click();

    expect(window.location.hash).toContain('#/workflow/');
  });

  it("refresh re-renders without error", () => {
    const { element, refresh } = createPassport({ workflows: makeWorkflows() });
    document.body.appendChild(element);
    expect(() => refresh()).not.toThrow();
    expect(document.querySelectorAll('.passport-row').length).toBe(3);
  });

  it("update replaces workflows", () => {
    const { element, update } = createPassport({ workflows: makeWorkflows() });
    document.body.appendChild(element);

    update([{ id: 'wf-new', status: 'active', createdAt: '2026-04-01T00:00:00Z' }]);
    expect(document.querySelectorAll('.passport-row').length).toBe(1);
  });
});
