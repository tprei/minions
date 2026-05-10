import { useState } from "react";
import type { Artifact } from "../domain/types";
import { Diff } from "../components/Diff";

interface Props {
  artifact: Artifact;
}

export function Patch({ artifact }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-xs text-fg-muted hover:text-fg transition-colors"
      >
        Patch {expanded ? "▴" : "▾"}
      </button>
      {expanded && (
        <div className="mt-1">
          <Diff text={artifact.ref} className="text-[11px]" />
        </div>
      )}
    </div>
  );
}
