import type { Artifact } from "../domain/types";

interface Props {
  artifact: Artifact;
}

export function Branch({ artifact }: Props): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 font-mono text-xs text-fg-muted bg-bg-elev border border-border rounded px-2 py-0.5">
      <span className="text-fg-subtle">⎇</span>
      {artifact.ref}
    </span>
  );
}
