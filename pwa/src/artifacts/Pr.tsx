import { useState } from "react";
import type { Artifact } from "../domain/types";
import { Pill } from "../components/Pill";
import { Spinner } from "../components/Spinner";
import { getPrDetail } from "../transport/rest";

interface PrData {
  number: number;
  title: string;
  html_url: string;
  state: "open" | "closed" | "merged";
}

interface Props {
  artifact: Artifact;
  onOpenPrTab?: () => void;
}

export function Pr({ artifact, onOpenPrTab }: Props): JSX.Element {
  const [prData, setPrData] = useState<PrData | null>(null);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = artifact.ref.replace(
    /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/,
    "https://api.github.com/repos/$1/$2/pulls/$3",
  );

  function load(): void {
    if (loaded || loading) return;
    setLoading(true);
    void getPrDetail(apiUrl)
      .then((data) => {
        setPrData(data as PrData);
        setLoaded(true);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Failed");
        setLoading(false);
      });
  }

  function stateTone(state: string): "ok" | "err" | "neutral" {
    if (state === "open") return "ok";
    if (state === "merged") return "neutral";
    return "err";
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <a
        href={artifact.ref}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-accent hover:underline font-mono"
        onMouseEnter={load}
      >
        PR #{prData?.number ?? "…"}
      </a>

      {!loaded && !loading && (
        <button
          type="button"
          onClick={load}
          className="text-[10px] text-fg-subtle hover:text-fg"
        >
          Load details
        </button>
      )}

      {loading && <Spinner size="sm" />}
      {error && <span className="text-[11px] text-err">{error}</span>}

      {prData && (
        <>
          <span className="text-xs text-fg-muted truncate max-w-[200px]">{prData.title}</span>
          <Pill tone={stateTone(prData.state)} className="text-[10px]">
            {prData.state}
          </Pill>
        </>
      )}

      {onOpenPrTab && (
        <button
          type="button"
          onClick={onOpenPrTab}
          className="text-[10px] text-accent hover:underline"
        >
          Open PR tab →
        </button>
      )}
    </div>
  );
}
