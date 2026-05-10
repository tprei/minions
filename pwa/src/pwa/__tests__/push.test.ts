import { describe, it, expect, vi, beforeEach } from "vitest";
import { urlBase64ToUint8Array, getPushSubscription, subscribeToPush } from "../push";

describe("urlBase64ToUint8Array", () => {
  it("converts a base64url string to Uint8Array", () => {
    const input = "dGVzdA";
    const result = urlBase64ToUint8Array(input);
    expect(result).toBeInstanceOf(Uint8Array);
    const decoded = Array.from(result)
      .map((b) => String.fromCharCode(b))
      .join("");
    expect(decoded).toBe("test");
  });

  it("handles padding correctly", () => {
    const input = "dGVzdA==";
    const result = urlBase64ToUint8Array(input);
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("replaces url-safe chars (- to + and _ to /)", () => {
    const input = "dGVz-A==";
    const result = urlBase64ToUint8Array(input);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("getPushSubscription", () => {
  it("returns null when serviceWorker is not available", async () => {
    const origNavigator = { ...navigator };
    Object.defineProperty(global, "navigator", {
      value: { ...origNavigator },
      writable: true,
    });
    const result = await getPushSubscription();
    expect(result).toBeNull();
  });

  it("returns subscription from pushManager", async () => {
    const mockSub = { endpoint: "https://example.com/push/123" };
    const mockReg = {
      pushManager: { getSubscription: vi.fn().mockResolvedValue(mockSub) },
    };
    Object.defineProperty(global, "navigator", {
      value: {
        serviceWorker: { ready: Promise.resolve(mockReg) },
      },
      writable: true,
    });
    const result = await getPushSubscription();
    expect(result).toBe(mockSub);
    Object.defineProperty(global, "navigator", {
      value: { serviceWorker: undefined },
      writable: true,
    });
  });
});

describe("subscribeToPush", () => {
  it("calls pushManager.subscribe with provided key", async () => {
    const mockSub = { endpoint: "https://example.com/push/456" };
    const mockSubscribe = vi.fn().mockResolvedValue(mockSub);
    const mockReg = {
      pushManager: { subscribe: mockSubscribe },
    };
    Object.defineProperty(global, "navigator", {
      value: {
        serviceWorker: { ready: Promise.resolve(mockReg) },
      },
      writable: true,
    });
    const key = new Uint8Array([1, 2, 3, 4]);
    const result = await subscribeToPush(key);
    expect(result).toBe(mockSub);
    expect(mockSubscribe).toHaveBeenCalledWith({
      userVisibleOnly: true,
      applicationServerKey: key.buffer,
    });
    Object.defineProperty(global, "navigator", {
      value: { serviceWorker: undefined },
      writable: true,
    });
  });
});
