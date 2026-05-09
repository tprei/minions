import { describe, it, expect, beforeEach, vi } from "vitest";
import { createActionsDrawer } from "../../../pwa/assets/views/actions-drawer.js";

beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
});

describe("createActionsDrawer", () => {
  it("renders all action rows after open", () => {
    const onClick1 = vi.fn();
    const onClick2 = vi.fn();
    const { open } = createActionsDrawer({
      actions: [
        { label: 'Action One', icon: '⊕', onClick: onClick1 },
        { label: 'Action Two', icon: '⊗', onClick: onClick2 },
      ],
    });

    open();

    const rows = document.querySelectorAll('.actions-drawer-row');
    expect(rows.length).toBe(2);
    expect(rows[0]?.querySelector('.actions-drawer-label')?.textContent).toBe('Action One');
    expect(rows[1]?.querySelector('.actions-drawer-label')?.textContent).toBe('Action Two');
  });

  it("renders action icons after open", () => {
    const { open } = createActionsDrawer({
      actions: [
        { label: 'Jump', icon: '⊕', onClick: vi.fn() },
      ],
    });

    open();

    const icon = document.querySelector('.actions-drawer-icon');
    expect(icon?.textContent).toBe('⊕');
  });

  it("tap calls onClick", () => {
    const onClick = vi.fn();
    const { open } = createActionsDrawer({
      actions: [
        { label: 'Do It', icon: '▶', onClick },
      ],
    });

    open();

    const row = document.querySelector('.actions-drawer-row') as HTMLElement;
    row?.click();

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("tap closes the drawer after onClick", () => {
    const { open } = createActionsDrawer({
      actions: [
        {
          label: 'Test',
          icon: '▶',
          onClick: vi.fn(),
        },
      ],
    });

    open();

    const row = document.querySelector('.actions-drawer-row') as HTMLElement;
    row?.click();

    expect(document.querySelectorAll('.sheet-panel.open').length).toBe(0);
  });

  it("open makes panel visible", () => {
    const { open } = createActionsDrawer({
      actions: [{ label: 'A', icon: '×', onClick: vi.fn() }],
    });

    open();
    const panel = document.querySelector('.sheet-panel');
    expect(panel?.classList.contains('open')).toBe(true);
  });

  it("close removes open class from panel", () => {
    const { open, close } = createActionsDrawer({
      actions: [{ label: 'A', icon: '×', onClick: vi.fn() }],
    });

    open();
    close();
    const panel = document.querySelector('.sheet-panel');
    expect(panel?.classList.contains('open')).toBe(false);
  });

  it("destroy before open does not throw", () => {
    const { destroy } = createActionsDrawer({
      actions: [{ label: 'A', icon: '×', onClick: vi.fn() }],
    });

    expect(() => destroy()).not.toThrow();
    expect(document.querySelector('.sheet-panel')).toBeNull();
  });

  it("destroy after open removes DOM elements", () => {
    const { open, destroy } = createActionsDrawer({
      actions: [{ label: 'A', icon: '×', onClick: vi.fn() }],
    });

    open();
    destroy();
    expect(document.querySelector('.sheet-panel')).toBeNull();
  });
});
