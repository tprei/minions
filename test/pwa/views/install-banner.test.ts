import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createInstallBanner } from "../../../pwa/assets/views/install-banner.js";

const DISMISSED_KEY = "install-banner:dismissed";

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    json: async () => ({}),
  }));
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("createInstallBanner", () => {
  it("returns null when already dismissed", async () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    const result = await createInstallBanner();
    expect(result).toBeNull();
  });

  it("returns null when VAPID endpoint returns error", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as unknown as Response);

    const result = await createInstallBanner();
    expect(result).toBeNull();
  });

  it("returns null when VAPID key is absent (no public key)", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ publicKey: null }),
    } as unknown as Response);

    const result = await createInstallBanner();
    expect(result).toBeNull();
  });

  it("fetches VAPID key from /push/vapid-public-key", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ publicKey: "test-key" }),
    } as unknown as Response);

    await createInstallBanner();

    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining("/push/vapid-public-key"),
    );
  });

  it("returns a banner element when VAPID available", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ publicKey: "vapid-test" }),
    } as unknown as Response);

    const result = await createInstallBanner();
    expect(result).not.toBeNull();
    expect(result!.element.className).toContain("install-banner");
    expect(result!.element.querySelector(".install-banner-subscribe")).not.toBeNull();
    expect(result!.element.querySelector(".install-banner-dismiss")).not.toBeNull();
  });

  it("dismiss button sets localStorage and removes banner", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ publicKey: "vapid-test" }),
    } as unknown as Response);

    const result = await createInstallBanner();
    expect(result).not.toBeNull();
    document.body.appendChild(result!.element);

    const dismissBtn = result!.element.querySelector(".install-banner-dismiss") as HTMLButtonElement;
    dismissBtn.click();

    expect(localStorage.getItem(DISMISSED_KEY)).toBe("1");
    expect(document.body.contains(result!.element)).toBe(false);
  });

  it("does not return a banner on subsequent visit after dismiss", async () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    const result = await createInstallBanner();
    expect(result).toBeNull();
  });
});
