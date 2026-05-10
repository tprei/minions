import { useState } from "react";
import { StatusDot } from "../../components/StatusDot";
import type { ClusterGroup } from "../aggregate";

interface Props {
  id: string;
  name: string;
  input: unknown;
  group?: ClusterGroup;
}

export function ToolCall({ id, name, input, group }: Props): JSX.Element {
  const [expanded, setExpanded] = useState(false);

  const inputStr = JSON.stringify(input ?? {});
  const preview = inputStr.length > 60 ? inputStr.slice(0, 60) + "…" : inputStr;

  function toggle(): void {
    const next = !expanded;
    setExpanded(next);
    if (group) group.expanded = next;
  }

  return (
    <div className="te te-tool-call" data-tool-call-id={id}>
      <div className="te-tool-call-header flex items-center gap-2 text-xs">
        <StatusDot status="running" size="sm" className="te-tool-status-dot" />
        <span className="te-tool-name font-mono font-medium text-fg">{name}</span>
        <span className="te-tool-input-preview text-fg-muted truncate">{preview}</span>
        <button
          type="button"
          className="te-tool-expand-btn ml-auto text-fg-subtle hover:text-fg transition-colors"
          aria-expanded={expanded}
          onClick={toggle}
        >
          {expanded ? "▼" : "▶"}
        </button>
      </div>
      {expanded && (
        <div className="te-tool-details mt-1 ml-4">
          <pre className="te-tool-input-full text-xs font-mono text-fg-muted whitespace-pre-wrap">
            {JSON.stringify(input ?? {}, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
