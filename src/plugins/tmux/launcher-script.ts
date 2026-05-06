export interface LauncherSpec {
  command: string[];
  env?: Record<string, string>;
  cwd?: string;
  socketName: string;
  releaseToken: string;
  tmuxBin?: string;
}

export function quoteShellArg(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}

export function buildLauncherScript(spec: LauncherSpec): string {
  const tmux = spec.tmuxBin ?? "tmux";
  const lines: string[] = ["#!/bin/sh"];

  if (spec.env !== undefined) {
    for (const [key, value] of Object.entries(spec.env)) {
      lines.push(`export ${key}=${quoteShellArg(value)}`);
    }
  }

  if (spec.cwd !== undefined) {
    lines.push(`cd ${quoteShellArg(spec.cwd)}`);
  }

  lines.push(
    `${quoteShellArg(tmux)} -L ${quoteShellArg(spec.socketName)} wait-for ${quoteShellArg(spec.releaseToken)}`,
  );

  const quotedArgv = spec.command.map(quoteShellArg).join(" ");
  lines.push(`exec ${quotedArgv}`);

  return lines.join("\n") + "\n";
}
