interface Props {
  sessionRef: string;
  exitMetadata?: Record<string, unknown>;
}

export function Final({ sessionRef, exitMetadata }: Props): JSX.Element {
  const hasMeta = exitMetadata !== undefined && Object.keys(exitMetadata).length > 0;

  return (
    <div className="te te-final flex flex-col gap-1 border-t border-border pt-2">
      <div className="te-final-label text-xs font-medium text-fg-muted">Session complete</div>
      {sessionRef && (
        <div className="te-final-ref text-[11px] font-mono text-fg-subtle">{sessionRef}</div>
      )}
      {hasMeta && (
        <pre className="te-final-meta text-[10px] font-mono text-fg-muted whitespace-pre-wrap">
          {JSON.stringify(exitMetadata, null, 2)}
        </pre>
      )}
    </div>
  );
}
