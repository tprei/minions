export interface InstallBannerDeps {
  apiBase?: string;
}

export interface InstallBanner {
  element: HTMLElement | null;
}

export declare function createInstallBanner(deps?: InstallBannerDeps): InstallBanner;
