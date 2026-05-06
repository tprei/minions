import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
  ProviderCapabilities,
  ProviderEvent,
  ProviderInvocation,
  ProviderPlugin,
  ProviderPrepareSpec,
  ProviderResumeSpec,
} from "../provider-plugin.js";

export class CodexProvider implements ProviderPlugin {
  readonly name = "codex";

  readonly capabilities: ProviderCapabilities = {
    resume: true,
    mcp: true,
    structuredOutput: false,
    oauthLogin: true,
    streamJson: true,
    sessionRefFormat: "opaque",
  };

  private lastThreadId: string | undefined;

  async prepare(spec: ProviderPrepareSpec): Promise<ProviderInvocation> {
    return {
      command: ["codex", "exec", "--json", spec.prompt],
      providerType: "codex",
    };
  }

  async resume(spec: ProviderResumeSpec): Promise<ProviderInvocation> {
    return {
      command: ["codex", "exec", "resume", "--json", spec.sessionRef],
      providerType: "codex",
    };
  }

  parseFrame(line: string): ProviderEvent[] {
    if (line.trim().length === 0) return [];

    let json: Record<string, unknown>;
    try {
      json = JSON.parse(line) as Record<string, unknown>;
    } catch {
      throw new Error(`malformed JSON line: ${line}`);
    }

    const type = json["type"];

    switch (type) {
      case "thread.started": {
        this.lastThreadId = typeof json["thread_id"] === "string" ? json["thread_id"] : undefined;
        return [];
      }

      case "turn.started": {
        return [];
      }

      case "turn.completed": {
        const usage = json["usage"] as Record<string, unknown> | undefined;
        return [
          {
            kind: "usage",
            inputTokens: typeof usage?.["input_tokens"] === "number" ? usage["input_tokens"] : 0,
            outputTokens: typeof usage?.["output_tokens"] === "number" ? usage["output_tokens"] : 0,
            ...(typeof usage?.["reasoning_tokens"] === "number"
              ? { reasoningTokens: usage["reasoning_tokens"] }
              : {}),
          },
          {
            kind: "final",
            sessionRef: this.lastThreadId ?? "",
            exitMetadata: {
              ...(typeof json["turn_id"] === "string" ? { turn_id: json["turn_id"] } : {}),
            },
          },
        ];
      }

      case "turn.failed": {
        const error = json["error"] as Record<string, unknown> | undefined;
        return [
          {
            kind: "error",
            recoverable: false,
            message: typeof error?.["message"] === "string" ? error["message"] : "turn failed",
          },
        ];
      }

      case "item.started": {
        const item = json["item"] as Record<string, unknown> | undefined;
        const itemType = item?.["type"] as string | undefined;
        if (
          item !== undefined &&
          (itemType === "command_execution" ||
            itemType === "mcp_tool_call" ||
            itemType === "web_search" ||
            itemType === "file_change")
        ) {
          return [
            {
              kind: "tool_call",
              id: String(item["id"] ?? ""),
              name: String(itemType),
              input: item["input"] ?? item["command"] ?? null,
            },
          ];
        }
        return [];
      }

      case "item.completed": {
        const item = json["item"] as Record<string, unknown> | undefined;
        const itemType = item?.["type"] as string | undefined;
        if (itemType === "agent_message") {
          const output = item?.["output"];
          const text =
            typeof output === "string"
              ? output
              : Array.isArray(output)
                ? (output as unknown[])
                    .map((o) => {
                      const ob = o as Record<string, unknown>;
                      return ob["type"] === "output_text" ? String(ob["text"] ?? "") : "";
                    })
                    .join("")
                : "";
          return [{ kind: "assistant_text", text }];
        }
        if (itemType === "reasoning") {
          const summaries = item?.["summary"];
          const text = Array.isArray(summaries)
            ? (summaries as unknown[])
                .map((s) => {
                  const sb = s as Record<string, unknown>;
                  return sb["type"] === "summary_text" ? String(sb["text"] ?? "") : "";
                })
                .join("")
            : String(summaries ?? "");
          return [{ kind: "thinking", text }];
        }
        if (
          itemType === "command_execution" ||
          itemType === "mcp_tool_call" ||
          itemType === "web_search" ||
          itemType === "file_change"
        ) {
          const status = item?.["status"] as string | undefined;
          return [
            {
              kind: "tool_result",
              id: String(item?.["id"] ?? ""),
              output: item?.["output"] ?? item?.["result"] ?? null,
              isError: status === "failed",
            },
          ];
        }
        if (itemType === "error") {
          return [
            {
              kind: "error",
              recoverable: true,
              message: typeof item?.["message"] === "string" ? item["message"] : "item error",
            },
          ];
        }
        return [];
      }

      case "item.updated": {
        return [];
      }

      case "error": {
        return [
          {
            kind: "error",
            recoverable: false,
            message: typeof json["message"] === "string" ? json["message"] : "codex error",
          },
        ];
      }

      default: {
        return [
          {
            kind: "error",
            recoverable: false,
            message: `unmapped codex type: ${String(type ?? "undefined")}`,
          },
        ];
      }
    }
  }

  async loginStatus(): Promise<{ loggedIn: boolean; details?: string }> {
    const authPath = join(homedir(), ".codex", "auth.json");
    try {
      const raw = await readFile(authPath, "utf-8");
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const details = typeof parsed["account"] === "string" ? parsed["account"] : undefined;
      return { loggedIn: true, ...(details !== undefined ? { details } : {}) };
    } catch {
      return { loggedIn: false };
    }
  }
}
