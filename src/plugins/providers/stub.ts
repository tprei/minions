import type {
  ProviderCapabilities,
  ProviderEvent,
  ProviderInvocation,
  ProviderPlugin,
  ProviderPrepareSpec,
  ProviderResumeSpec,
} from "../provider-plugin.js";

export class StubProviderPlugin implements ProviderPlugin {
  readonly name = "stub";

  readonly capabilities: ProviderCapabilities = {
    resume: true,
    mcp: false,
    structuredOutput: false,
    oauthLogin: false,
    streamJson: true,
    sessionRefFormat: "opaque",
  };

  private counter = 0;
  private readonly frames: ProviderEvent[][];

  constructor({ frames }: { frames: ProviderEvent[][] }) {
    this.frames = frames;
  }

  async prepare(_spec: ProviderPrepareSpec): Promise<ProviderInvocation> {
    return { command: ["echo", "stub"], providerType: "stub" };
  }

  async resume(_spec: ProviderResumeSpec): Promise<ProviderInvocation> {
    return { command: ["echo", "stub"], providerType: "stub" };
  }

  parseFrame(_line: string): ProviderEvent[] {
    return this.frames[this.counter++] ?? [];
  }

  async loginStatus(): Promise<{ loggedIn: boolean }> {
    return { loggedIn: true };
  }
}
