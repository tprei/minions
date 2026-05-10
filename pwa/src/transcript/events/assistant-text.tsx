import { Markdown } from "../../components/Markdown";
import { agentTone, agentRingClass } from "../../utils/agentColor";
import { cityAlias } from "../../utils/cityAlias";
import { cx } from "../../util/cx";

interface Props {
  text: string;
  agentProviderType?: string;
  agentSessionId?: string;
}

export function AssistantText({ text, agentProviderType, agentSessionId }: Props): JSX.Element {
  const showBadge = agentProviderType !== undefined && agentSessionId !== undefined;
  const tone = showBadge ? agentTone(agentProviderType) : null;
  const alias = showBadge ? cityAlias(agentSessionId) : null;

  return (
    <div className="te te-assistant-text">
      {showBadge && tone !== null && alias !== null && (
        <div
          className="flex items-center gap-1.5 mb-1 text-[10px] text-fg-subtle"
          data-agent-alias={alias}
        >
          <span
            className={cx("inline-block w-1.5 h-1.5 rounded-full ring-1", agentRingClass(tone))}
            aria-hidden="true"
          />
          <span className="font-mono">{alias}</span>
        </div>
      )}
      <Markdown source={text} />
    </div>
  );
}
