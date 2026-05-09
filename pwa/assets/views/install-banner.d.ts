export interface InstallBannerDeps {
  apiBase?: string;
}

export interface InstallBanner {
  element: HTMLElement;
}

export declare function createInstallBanner(deps?: InstallBannerDeps): Promise<InstallBanner | null>;
