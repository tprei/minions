import type { Artifact } from "../domain/types";
import { Branch } from "./Branch";
import { Commit } from "./Commit";
import { Pr } from "./Pr";
import { Patch } from "./Patch";
import { QualityReport } from "./QualityReport";
import { CiReport } from "./CiReport";

interface Props {
  artifacts: Artifact[];
}

export function ArtifactList({ artifacts }: Props): JSX.Element {
  if (artifacts.length === 0) return <></>;

  return (
    <div className="space-y-2 mt-2">
      <div className="text-[10px] text-fg-subtle font-medium uppercase tracking-wide">Artifacts</div>
      {artifacts.map((artifact, i) => (
        <div key={i} className="flex items-start gap-2">
          <span className="text-[10px] text-fg-subtle font-mono shrink-0 mt-0.5">{artifact.kind}</span>
          <div className="flex-1 min-w-0">
            {artifact.kind === "branch" && <Branch artifact={artifact} />}
            {artifact.kind === "commit" && <Commit artifact={artifact} />}
            {artifact.kind === "pr" && <Pr artifact={artifact} />}
            {artifact.kind === "patch" && <Patch artifact={artifact} />}
            {artifact.kind === "quality-report" && <QualityReport artifact={artifact} />}
            {artifact.kind === "ci-report" && <CiReport artifact={artifact} />}
          </div>
        </div>
      ))}
    </div>
  );
}
