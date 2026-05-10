import { useState } from "react";

interface Props {
  text: string;
}

export function Thinking({ text }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="te te-thinking border-l-2 border-accent/30 pl-3">
      <button
        type="button"
        className="te-thinking-toggle flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span aria-hidden="true" className="te-thinking-chevron text-[10px]">
          {expanded ? "▼" : "▶"}
        </span>
        <span className="te-thinking-label">Thinking…</span>
      </button>
      {expanded && (
        <div className="te-thinking-body mt-1">
          <pre className="te-thinking-text text-xs text-fg-muted whitespace-pre-wrap font-mono">
            {text}
          </pre>
        </div>
      )}
    </div>
  );
}
