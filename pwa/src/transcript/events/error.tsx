import { useState } from "react";

interface Props {
  message: string;
  stack?: string;
  recoverable?: boolean;
}

export function TranscriptError({ message, stack, recoverable }: Props): JSX.Element {
  const [showStack, setShowStack] = useState(false);

  return (
    <div className="te te-error rounded border border-err/40 bg-err/10 px-3 py-2">
      <div className="te-error-message text-xs text-err font-medium">
        {recoverable === false ? "[non-recoverable] " : ""}{message}
      </div>
      {stack && (
        <>
          <button
            type="button"
            className="te-error-stack-toggle text-[11px] text-fg-muted hover:text-fg mt-1"
            aria-expanded={showStack}
            onClick={() => setShowStack((v) => !v)}
          >
            {showStack ? "Hide stack trace" : "Show stack trace"}
          </button>
          {showStack && (
            <pre className="te-error-stack text-[10px] font-mono text-fg-muted mt-1 whitespace-pre-wrap">
              {stack}
            </pre>
          )}
        </>
      )}
    </div>
  );
}
