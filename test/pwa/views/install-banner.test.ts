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
  it("returns null element when already dismissed", () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    const { element } = createInstallBanner();
    expect(element).toBeNull();
  });

  it("returns a banner element on first visit", () => {
    const { element } = createInstallBanner();
    expect(element).not.toBeNull();
    expect(element!.className).toContain("install-banner");
  });

  it("fetches VAPID key from /push/vapid-public-key", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ publicKey: "test-key" }),
    } as unknown as Response);

    createInstallBanner();

    await vi.waitFor(() => {
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.stringContaining("/push/vapid-public-key"),
      );
    });
  });

  it("removes banner when VAPID key is absent (no public key)", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ publicKey: null }),
    } as unknown as Response);

    const { element } = createInstallBanner();
    document.body.appendChild(element!);

    await vi.waitFor(() => {
      expect(document.body.contains(element)).toBe(false);
    });
  });

  it("removes banner when VAPID endpoint returns error", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({}),
    } as unknown as Response);

    const { element } = createInstallBanner();
    document.body.appendChild(element!);

    await vi.waitFor(() => {
      expect(document.body.contains(element)).toBe(false);
    });
  });

  it("shows subscribe and dismiss buttons when VAPID available", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ publicKey: "vapid-test" }),
    } as unknown as Response);

    const { element } = createInstallBanner();
    document.body.appendChild(element!);

    await vi.waitFor(() => {
      expect(element!.querySelector(".install-banner-subscribe")).not.toBeNull();
      expect(element!.querySelector(".install-banner-dismiss")).not.toBeNull();
    });
  });

  it("dismiss button sets localStorage and removes banner", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ publicKey: "vapid-test" }),
    } as unknown as Response);

    const { element } = createInstallBanner();
    document.body.appendChild(element!);

    await vi.waitFor(() => {
      expect(element!.querySelector(".install-banner-dismiss")).not.toBeNull();
    });

    const dismissBtn = element!.querySelector(".install-banner-dismiss") as HTMLButtonElement;
    dismissBtn.click();

    expect(localStorage.getItem(DISMISSED_KEY)).toBe("1");
    expect(document.body.contains(element)).toBe(false);
  });

  it("does not show banner on subsequent visit after dismiss", () => {
    localStorage.setItem(DISMISSED_KEY, "1");
    const { element } = createInstallBanner();
    expect(element).toBeNull();
  });
});
