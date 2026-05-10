import { cx } from "../../util/cx";
import { Diff } from "../../components/Diff";

const DIFF_PATTERN = /^diff --git /m;
const TRUNCATE_AT = 500;

interface Props {
  id: string;
  output: unknown;
  isError?: boolean;
  groupExpanded?: boolean;
}

function outputToString(output: unknown): string {
  if (typeof output === "string") return output;
  return JSON.stringify(output ?? null, null, 2);
}

export function ToolResult({ id, output, isError, groupExpanded }: Props): JSX.Element {
  const outputStr = outputToString(output);
  const truncated =
    outputStr.length > TRUNCATE_AT
      ? outputStr.slice(0, TRUNCATE_AT) + "\n… (truncated)"
      : outputStr;
  const isDiff = DIFF_PATTERN.test(outputStr);
  const hidden = groupExpanded === false;

  return (
    <div
      className={cx(
        "te te-tool-result text-xs",
        isError && "te-tool-result-error",
      )}
      data-result-id={id}
    >
      <span className={cx("te-tool-result-label font-mono font-medium", isError ? "text-err" : "text-fg-muted")}>
        {isError ? "Error" : "Result"}
      </span>
      {!hidden && (
        isDiff ? (
          <Diff text={outputStr} className="mt-1" />
        ) : (
          <pre className="te-tool-result-output mt-1 text-fg-muted whitespace-pre-wrap font-mono">
            {truncated}
          </pre>
        )
      )}
    </div>
  );
}
