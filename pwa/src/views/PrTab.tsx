import { useCallback, useEffect, useRef, useState } from "react";
import type { TaskNode, WorkflowEvent } from "../domain/types";
import { getPrDetail, getPrFiles, getPrChecks, mergeTask } from "../transport/rest";
import { Pill } from "../components/Pill";
import { Spinner } from "../components/Spinner";
import { Diff } from "../components/Diff";
import { MergeProgress } from "./MergeProgress";

const CHECKS_POLL_MS = 8000;

interface PrData {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed" | "merged";
  mergeable_state: string;
  base: { ref: string };
  head: { ref: string; sha: string };
  user?: { login: string };
}

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  html_url?: string;
}

interface CheckRunsResponse {
  check_runs: CheckRun[];
  total_count: number;
}

interface PrFile {
  filename: string;
  patch?: string;
}

function prStateTone(state: string): "ok" | "err" | "neutral" {
  if (state === "open") return "ok";
  if (state === "merged") return "neutral";
  return "err";
}

function mergeableTone(ms: string): "ok" | "warn" | "err" | "neutral" {
  if (ms === "clean") return "ok";
  if (ms === "unstable" || ms === "blocked") return "warn";
  if (ms === "dirty") return "err";
  return "neutral";
}

function allChecksConclusive(checks: CheckRun[]): boolean {
  return checks.every((c) => c.status === "completed");
}

function extractRepoBase(prUrl: string): string {
  const m = prUrl.match(/^(https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+)\/pulls\/\d+/);
  return m?.[1] ?? "";
}

interface Props {
  task: TaskNode;
  workflowId: string;
  subscribeProviderEvents: (listener: (evt: WorkflowEvent) => void) => () => void;
}

export function PrTab({ task, workflowId, subscribeProviderEvents }: Props): JSX.Element {
  const prArtifact = task.artifacts.find((a) => a.kind === "pr");

  const prHtmlUrl = prArtifact?.ref ?? "";
  const prApiUrl = prHtmlUrl.replace(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
    "https://api.github.com/repos/$1/$2/pulls/$3",
  );

  const [pr, setPr] = useState<PrData | null>(null);
  const [prLoading, setPrLoading] = useState(false);
  const [prError, setPrError] = useState<string | null>(null);

  const [checks, setChecks] = useState<CheckRun[]>([]);
  const [checksError, setChecksError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [files, setFiles] = useState<PrFile[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [showFiles, setShowFiles] = useState(false);

  const [merging, setMerging] = useState(false);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const [mergeStarted, setMergeStarted] = useState(false);

  useEffect(() => {
    if (!prApiUrl) return;
    setPrLoading(true);
    void getPrDetail(prApiUrl)
      .then((data) => {
        setPr(data as PrData);
        setPrLoading(false);
      })
      .catch((err: unknown) => {
        setPrError(err instanceof Error ? err.message : "Failed to load PR");
        setPrLoading(false);
      });
  }, [prApiUrl]);

  const fetchChecks = useCallback(
    (headSha: string, repoBase: string, currentPr: PrData | null) => {
      if (!headSha || !repoBase) return;
      void getPrChecks(repoBase, headSha)
        .then((data) => {
          const resp = data as CheckRunsResponse;
          setChecks(resp.check_runs ?? []);
          setChecksError(null);

          if (
            allChecksConclusive(resp.check_runs ?? []) &&
            currentPr &&
            ["clean", "blocked", "unknown"].includes(currentPr.mergeable_state)
          ) {
            if (pollTimerRef.current !== null) {
              clearInterval(pollTimerRef.current);
              pollTimerRef.current = null;
            }
          }
        })
        .catch((err: unknown) => {
          setChecksError(err instanceof Error ? err.message : "Failed to load checks");
        });
    },
    [],
  );

  useEffect(() => {
    if (!pr) return;
    const repoBase = extractRepoBase(prApiUrl);
    const headSha = pr.head.sha;

    fetchChecks(headSha, repoBase, pr);

    if (pollTimerRef.current !== null) clearInterval(pollTimerRef.current);
    pollTimerRef.current = setInterval(() => {
      fetchChecks(headSha, repoBase, pr);
    }, CHECKS_POLL_MS);

    const onFocus = (): void => {
      if (!allChecksConclusive(checks)) {
        fetchChecks(headSha, repoBase, pr);
      }
    };
    window.addEventListener("focus", onFocus);

    return () => {
      if (pollTimerRef.current !== null) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      window.removeEventListener("focus", onFocus);
    };
  }, [pr, prApiUrl, fetchChecks, checks]);

  function loadFiles(): void {
    if (filesLoading || files.length > 0) {
      setShowFiles((v) => !v);
      return;
    }
    setFilesLoading(true);
    setShowFiles(true);
    void getPrFiles(prApiUrl)
      .then((data) => {
        setFiles(data as PrFile[]);
        setFilesLoading(false);
      })
      .catch((err: unknown) => {
        setFilesError(err instanceof Error ? err.message : "Failed to load files");
        setFilesLoading(false);
      });
  }

  async function handleMerge(): Promise<void> {
    setMerging(true);
    setMergeError(null);
    try {
      await mergeTask(workflowId, task.id);
      setMergeStarted(true);
    } catch (err: unknown) {
      setMergeError(err instanceof Error ? err.message : "Merge failed");
    } finally {
      setMerging(false);
    }
  }

  if (!prArtifact) {
    return (
      <div className="p-4 text-sm text-fg-muted">No PR artifact on this task.</div>
    );
  }

  if (prLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Spinner size="md" />
      </div>
    );
  }

  if (prError) {
    return <div className="p-4 text-sm text-err">{prError}</div>;
  }

  if (!pr) return <Spinner size="md" />;

  const canMerge = ["clean", "unstable"].includes(pr.mergeable_state);
  const passedCount = checks.filter((c) => c.conclusion === "success").length;
  const failedCount = checks.filter(
    (c) => c.conclusion === "failure" || c.conclusion === "timed_out",
  ).length;
  const pendingCount = checks.filter((c) => c.status !== "completed").length;

  return (
    <div className="p-4 space-y-4">
      <div className="card p-4">
        <div className="flex items-start gap-2 flex-wrap">
          <a
            href={pr.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium text-fg hover:text-accent transition-colors flex-1 min-w-0"
          >
            {pr.title}
          </a>
          <div className="flex gap-1 shrink-0">
            <Pill tone={prStateTone(pr.state)} className="text-[10px]">
              {pr.state}
            </Pill>
            <Pill tone={mergeableTone(pr.mergeable_state)} className="text-[10px]">
              {pr.mergeable_state}
            </Pill>
          </div>
        </div>
        <div className="text-[11px] text-fg-muted mt-1">
          <span className="font-mono">{pr.base.ref}</span>
          {" ← "}
          <span className="font-mono">{pr.head.ref}</span>
        </div>
      </div>

      <div className="card p-4">
        <div className="text-xs font-medium text-fg-muted mb-2">
          Checks — {checks.length} total · {passedCount} passed · {failedCount} failed · {pendingCount} pending
          {checksError && <span className="text-err ml-2">{checksError}</span>}
        </div>
        <div className="space-y-1">
          {checks.map((check) => (
            <div key={check.id} className="flex items-center gap-2 text-[11px]">
              <span
                className={
                  check.conclusion === "success"
                    ? "text-ok"
                    : check.conclusion === "failure" || check.conclusion === "timed_out"
                      ? "text-err"
                      : "text-fg-muted"
                }
              >
                {check.status !== "completed"
                  ? "⏳"
                  : check.conclusion === "success"
                    ? "✓"
                    : "✗"}
              </span>
              <span className="text-fg-muted truncate flex-1">{check.name}</span>
              <span className="text-fg-subtle shrink-0">
                {check.conclusion ?? check.status}
              </span>
              {check.html_url && (
                <a
                  href={check.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline shrink-0"
                >
                  ↗
                </a>
              )}
            </div>
          ))}
          {checks.length === 0 && !checksError && (
            <div className="text-[11px] text-fg-subtle">No checks yet</div>
          )}
        </div>
      </div>

      <div className="card p-4">
        <button
          type="button"
          onClick={loadFiles}
          className="text-xs text-accent hover:underline"
        >
          {showFiles ? "Hide diff ▴" : "Show diff ▾"}
        </button>
        {showFiles && (
          <div className="mt-2">
            {filesLoading && <Spinner size="sm" />}
            {filesError && <div className="text-xs text-err">{filesError}</div>}
            {files.map((file) => (
              <div key={file.filename} className="mb-3">
                <div className="text-[11px] text-fg-muted font-mono mb-1">{file.filename}</div>
                {file.patch && <Diff text={file.patch} className="text-[11px]" />}
              </div>
            ))}
            {files.length === 0 && !filesLoading && !filesError && (
              <div className="text-[11px] text-fg-subtle">No file changes</div>
            )}
          </div>
        )}
      </div>

      {mergeStarted ? (
        <MergeProgress
          taskId={task.id}
          subscribeProviderEvents={subscribeProviderEvents}
          prUrl={pr.html_url}
        />
      ) : (
        <div>
          <button
            type="button"
            disabled={!canMerge || merging}
            onClick={() => void handleMerge()}
            className="w-full py-2 px-4 rounded text-sm font-medium bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {merging ? "Merging…" : "Land PR"}
          </button>
          {mergeError && <div className="text-xs text-err mt-1">{mergeError}</div>}
          {!canMerge && (
            <div className="text-[11px] text-fg-subtle mt-1 text-center">
              Land requires mergeable_state: clean or unstable (current: {pr.mergeable_state})
            </div>
          )}
        </div>
      )}
    </div>
  );
}
