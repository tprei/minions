import { spawn } from "node:child_process";
import type {
  ProviderCapabilities,
  ProviderInvocation,
  ProviderPlugin,
  ProviderPrepareSpec,
  ProviderResumeSpec,
} from "../provider-plugin.js";
import { parseFrame } from "../../transcript/stream-json-parser.js";
export { parseFrame };

export class ClaudeCodeProvider implements ProviderPlugin {
  readonly name = "claude-code";

  readonly capabilities: ProviderCapabilities = {
    resume: true,
    mcp: true,
    structuredOutput: false,
    oauthLogin: true,
    streamJson: true,
    sessionRefFormat: "uuid",
  };

  async prepare(spec: ProviderPrepareSpec): Promise<ProviderInvocation> {
    if (spec.prompt.trim() === "") throw new Error("prompt must be non-empty");
    return {
      command: ["claude", "-p", spec.prompt, "--output-format", "stream-json", "--verbose"],
      providerType: "claude-code",
    };
  }

  async resume(spec: ProviderResumeSpec): Promise<ProviderInvocation> {
    if (spec.prompt.trim() === "") throw new Error("prompt must be non-empty");
    return {
      command: ["claude", "-p", spec.prompt, "--resume", spec.sessionRef, "--output-format", "stream-json", "--verbose"],
      providerType: "claude-code",
    };
  }

  parseFrame(line: string) {
    return parseFrame(line);
  }

  loginStatus(): Promise<{ loggedIn: boolean; details?: string }> {
    return new Promise((resolve) => {
      const child = spawn("claude", ["auth", "status"]);
      child.on("close", (code: number | null) => {
        resolve({ loggedIn: code === 0 });
      });
      child.on("error", () => {
        resolve({ loggedIn: false });
      });
    });
  }
}
