
// a.ts
import { createEngine, TmuxRuntimeBackend } from "./src/index.js";

const engine = await createEngine({
dbPath: "/tmp/mwf-smoke.db",
runtime: new TmuxRuntimeBackend({
dataDir: "/tmp/mwf-smoke/sessions",
socketName: "minions-smoke",
}),
});

// note: createEngine returns { server, bootReport, close } ΓÇö there's no
// engine.runtime exposed. Build the runtime separately if you want to drive
// it directly:

const runtime = new TmuxRuntimeBackend({
dataDir: "/tmp/mwf-smoke/sessions",
socketName: "minions-smoke",
});
const { sessionId } = await runtime.start({
taskId: "smoke-1",
workflowId: "wf-smoke",
command: ["sh", "-c", "while true; do date; sleep 1; done"],
});
console.log("started:", sessionId);


