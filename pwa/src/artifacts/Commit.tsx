import type { Artifact } from "../domain/types";

interface Props {
  artifact: Artifact;
}

export function Commit({ artifact }: Props): JSX.Element {
  const sha = artifact.ref.slice(0, 8);
  const githubUrl = artifact.ref.startsWith("https://") ? artifact.ref : undefined;

  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs text-fg-muted bg-bg-elev border border-border rounded px-2 py-0.5">
      {githubUrl ? (
        <a
          href={githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent hover:underline"
        >
          {sha}
        </a>
      ) : (
        sha
      )}
    </span>
  );
}
