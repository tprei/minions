import { describe, it, expect, beforeEach, vi } from "vitest";
import { attachSwipeUp } from "../../../pwa/assets/gestures/swipe-up.js";

function makePointerEvent(type: string, init: Partial<PointerEventInit>) {
  return new PointerEvent(type, { pointerId: 1, bubbles: true, cancelable: true, ...init });
}

beforeEach(() => {
  document.body.innerHTML = '';

  Object.defineProperty(window, 'innerHeight', {
    value: 800,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(window, 'location', {
    value: { search: '' },
    writable: true,
    configurable: true,
  });

  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query.includes('standalone'),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })));
});

describe("attachSwipeUp — standalone gate", () => {
  it("does not fire onTrigger when not standalone and no gestures=force", () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));

    const target = document.createElement('div');
    document.body.appendChild(target);
    const onTrigger = vi.fn();

    attachSwipeUp(target, { threshold: 64, edgeZone: 24, onTrigger });

    const viewportHeight = window.innerHeight;
    target.dispatchEvent(makePointerEvent('pointerdown', { clientX: 100, clientY: viewportHeight - 10 }));
    target.dispatchEvent(makePointerEvent('pointermove', { clientX: 100, clientY: viewportHeight - 10 - 80 }));

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("fires onTrigger when gestures=force query param is set", () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    Object.defineProperty(window, 'location', {
      value: { search: '?gestures=force' },
      writable: true,
      configurable: true,
    });

    const target = document.createElement('div');
    document.body.appendChild(target);
    const onTrigger = vi.fn();

    attachSwipeUp(target, { threshold: 64, edgeZone: 24, onTrigger });

    const viewportHeight = window.innerHeight;
    target.dispatchEvent(makePointerEvent('pointerdown', { clientX: 100, clientY: viewportHeight - 10 }));
    target.dispatchEvent(makePointerEvent('pointermove', { clientX: 100, clientY: viewportHeight - 10 - 80 }));

    expect(onTrigger).toHaveBeenCalledOnce();
  });
});

describe("attachSwipeUp — edge zone and threshold", () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      value: { search: '?gestures=force' },
      writable: true,
      configurable: true,
    });
  });

  it("fires onTrigger on 64px upward drag from edge zone", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onTrigger = vi.fn();

    attachSwipeUp(target, { threshold: 64, edgeZone: 24, onTrigger });

    const viewportHeight = window.innerHeight;
    target.dispatchEvent(makePointerEvent('pointerdown', { clientX: 100, clientY: viewportHeight - 10 }));
    target.dispatchEvent(makePointerEvent('pointermove', { clientX: 100, clientY: viewportHeight - 10 - 65 }));

    expect(onTrigger).toHaveBeenCalledOnce();
  });

  it("does not fire when drag starts outside edge zone", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onTrigger = vi.fn();

    attachSwipeUp(target, { threshold: 64, edgeZone: 24, onTrigger });

    const viewportHeight = window.innerHeight;
    target.dispatchEvent(makePointerEvent('pointerdown', { clientX: 100, clientY: viewportHeight - 50 }));
    target.dispatchEvent(makePointerEvent('pointermove', { clientX: 100, clientY: viewportHeight - 50 - 80 }));

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("does not fire when upward drag is less than threshold", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onTrigger = vi.fn();

    attachSwipeUp(target, { threshold: 64, edgeZone: 24, onTrigger });

    const viewportHeight = window.innerHeight;
    target.dispatchEvent(makePointerEvent('pointerdown', { clientX: 100, clientY: viewportHeight - 10 }));
    target.dispatchEvent(makePointerEvent('pointermove', { clientX: 100, clientY: viewportHeight - 10 - 30 }));

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("does not fire when target is an interactive element", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const btn = document.createElement('button');
    target.appendChild(btn);
    const onTrigger = vi.fn();

    attachSwipeUp(target, { threshold: 64, edgeZone: 24, onTrigger });

    const viewportHeight = window.innerHeight;
    const evt = new PointerEvent('pointerdown', {
      pointerId: 1,
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: viewportHeight - 10,
    });
    Object.defineProperty(evt, 'target', { value: btn, configurable: true });
    target.dispatchEvent(evt);

    target.dispatchEvent(makePointerEvent('pointermove', { clientX: 100, clientY: viewportHeight - 10 - 80 }));

    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("destroy removes listeners and stops triggering", () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onTrigger = vi.fn();

    const { destroy } = attachSwipeUp(target, { threshold: 64, edgeZone: 24, onTrigger });
    destroy();

    const viewportHeight = window.innerHeight;
    target.dispatchEvent(makePointerEvent('pointerdown', { clientX: 100, clientY: viewportHeight - 10 }));
    target.dispatchEvent(makePointerEvent('pointermove', { clientX: 100, clientY: viewportHeight - 10 - 80 }));

    expect(onTrigger).not.toHaveBeenCalled();
  });
});
