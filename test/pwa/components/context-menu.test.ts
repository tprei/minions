import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createContextMenu } from "../../../pwa/assets/components/context-menu.js";

beforeEach(() => {
  document.body.innerHTML = '';
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createContextMenu — long-press triggers menu", () => {
  it("shows menu after 500ms long-press", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const onClick = vi.fn();
    createContextMenu({
      target,
      items: [{ label: 'Pin', onClick }],
    });

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 100, clientY: 200 }));
    vi.advanceTimersByTime(500);

    const menu = document.querySelector('.context-menu');
    expect(menu).not.toBeNull();
    expect(menu?.querySelector('.context-menu-item')?.textContent).toBe('Pin');
  });

  it("does not show menu before 500ms", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    createContextMenu({
      target,
      items: [{ label: 'Pin', onClick: vi.fn() }],
    });

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    vi.advanceTimersByTime(499);

    expect(document.querySelector('.context-menu')).toBeNull();
  });

  it("menu does not appear after pointercancel (movement cancelled)", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    createContextMenu({
      target,
      items: [{ label: 'Pin', onClick: vi.fn() }],
    });

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }));
    vi.advanceTimersByTime(300);
    target.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1 }));
    vi.advanceTimersByTime(300);

    expect(document.querySelector('.context-menu')).toBeNull();
  });
});

describe("createContextMenu — item interaction", () => {
  it("clicking an item calls onClick", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onClick = vi.fn();

    createContextMenu({
      target,
      items: [{ label: 'Retry', onClick }],
    });

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
    vi.advanceTimersByTime(500);

    const item = document.querySelector('.context-menu-item') as HTMLElement;
    item?.click();

    expect(onClick).toHaveBeenCalledOnce();
  });

  it("clicking an item closes the menu", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    createContextMenu({
      target,
      items: [{ label: 'Retry', onClick: vi.fn() }],
    });

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
    vi.advanceTimersByTime(500);

    const item = document.querySelector('.context-menu-item') as HTMLElement;
    item?.click();

    expect(document.querySelector('.context-menu')).toBeNull();
  });
});

describe("createContextMenu — close behavior", () => {
  it("outside click closes the menu", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    createContextMenu({
      target,
      items: [{ label: 'Pin', onClick: vi.fn() }],
    });

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
    vi.advanceTimersByTime(600);

    expect(document.querySelector('.context-menu')).not.toBeNull();

    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.querySelector('.context-menu')).toBeNull();
  });

  it("Esc key closes the menu", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    createContextMenu({
      target,
      items: [{ label: 'Pin', onClick: vi.fn() }],
    });

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
    vi.advanceTimersByTime(600);

    expect(document.querySelector('.context-menu')).not.toBeNull();

    vi.useRealTimers();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('.context-menu')).toBeNull();
  });

  it("destroy removes listeners", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);

    const { destroy } = createContextMenu({
      target,
      items: [{ label: 'Pin', onClick: vi.fn() }],
    });

    destroy();

    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, clientX: 0, clientY: 0 }));
    vi.advanceTimersByTime(500);

    expect(document.querySelector('.context-menu')).toBeNull();
  });
});
