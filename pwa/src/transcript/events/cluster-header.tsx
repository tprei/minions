import { ClusterGroup } from "../aggregate";

interface Props {
  group: ClusterGroup;
  expanded: boolean;
  onToggle: () => void;
}

export function ClusterHeader({ group, expanded, onToggle }: Props): JSX.Element {
  const label =
    group.kind === "tool_call" && group.toolName
      ? `${group.length} ${group.toolName} calls`
      : `${group.length} ${group.kind} events`;

  return (
    <button
      type="button"
      className="flex items-center gap-1.5 text-xs text-fg-muted hover:text-fg transition-colors w-full text-left"
      aria-expanded={expanded}
      onClick={onToggle}
    >
      <span aria-hidden="true" className="text-[10px]">{expanded ? "▼" : "▶"}</span>
      <span>{label}</span>
    </button>
  );
}
