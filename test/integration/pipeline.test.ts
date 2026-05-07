import { describe, it, expect } from "vitest";
import { makeHarness, assertNoStrandedWorktrees } from "../fixtures/pipeline-harness.js";
import { FakeSCM } from "../fixtures/fake-scm.js";
import { FakeGitHubClient, asGitHubClient } from "../fixtures/fake-github-client.js";
import { slugify } from "../../src/plugins/workspace-backend.js";
import { StubProviderPlugin } from "../../src/plugins/providers/stub.js";
import { SQLiteWorkflowRepository } from "../../src/persistence/sqlite-repo.js";
import type { Workflow } from "../../src/domain/types.js";

const FAST_CADENCE = {
  intervals: [{ afterMs: 0, everyMs: 10 }],
  maxHorizonMs: 10 * 60_000,
  noChecksBailMs: 5_000,
  confirmationDelayMs: 10,
};

const HAS_GIT = process.env["MWF_HAS_GIT"] === "1";

async function waitFor(
  check: () => Promise<boolean>,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise<void>((r) => setTimeout(r, 50));
  }
  throw new Error(`waitFor: timed out after ${timeoutMs}ms`);
}

async function getWorkflow(
  fetchFn: (path: string, init?: RequestInit) => Promise<Response>,
  workflowId: string,
): Promise<Workflow> {
  const res = await fetchFn(`/workflows/${workflowId}`);
  if (res.status !== 200) throw new Error(`GET /workflows/${workflowId} → ${res.status}`);
  return res.json() as Promise<Workflow>;
}

async function postCommand(
  fetchFn: (path: string, init?: RequestInit) => Promise<Response>,
  body: Record<string, unknown>,
): Promise<void> {
  const res = await fetchFn("/commands", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (res.status !== 200) {
    const text = await res.text();
    throw new Error(`POST /commands → ${res.status}: ${text}`);
  }
}

describe.skipIf(!HAS_GIT)("integration: pipeline", () => {
  it("Test 1: happy-path single task (HTTP)", async () => {
    const scm = new FakeSCM();
    const harness = await makeHarness({
      withRealQuality: true,
      qualityCommand: "pass",
      scm,
    });

    try {
      const wfId = "wf-happy-1";
      const taskId = "t1";
      const now = new Date().toISOString();

      const createRes = await harness.fetch("/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: wfId,
          kind: "single-task",
          tasks: [{ id: taskId, title: "Happy Task", prompt: "do stuff" }],
          policy: { autoLand: false, autoMergeOnGreen: false },
        }),
      });
      expect(createRes.status).toBe(201);

      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "mark-ready", taskId, now },
      });

      const branch = `minions/${slugify(wfId)}_${slugify(taskId)}`;
      const handle = await harness.workspace.create({
        workflowId: wfId,
        taskId,
        branch,
        mode: "worktree",
      });

      const sessionId = "sess-1";
      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "mark-running", taskId, sessionId, workspaceId: handle.workspaceId, now },
      });

      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "complete-runtime", taskId, expectedSessionId: sessionId, artifacts: [], now },
      });

      // Wait for quality gate to run and transition to finalizing
      await waitFor(async () => {
        const wf = await getWorkflow(harness.fetch, wfId);
        return wf.graph[taskId]?.executionStatus === "finalizing";
      });

      // POST merge via HTTP
      const mergeRes = await harness.fetch(`/workflows/${wfId}/tasks/${taskId}/merge`, {
        method: "POST",
      });
      expect(mergeRes.status).toBe(200);

      const finalWf = await getWorkflow(harness.fetch, wfId);
      expect(finalWf.graph[taskId]?.executionStatus).toBe("merged");

      // FakeSCM PR is merged
      const pr = scm.getPRForBranch(branch);
      expect(pr).toBeDefined();
      expect(pr?.merged).toBe(true);

      // Test 5: workspace lifecycle — cleanup count matches create count
      for (const [id, createCount] of harness.workspace.counts.create) {
        const cleanupCount = harness.workspace.counts.cleanup.get(id) ?? 0;
        expect(cleanupCount).toBe(createCount);
      }

      await assertNoStrandedWorktrees(harness.repoPath);
    } finally {
      await harness.cleanup();
    }
  }, 30_000);

  it("Test 2: autoLand + autoMergeOnGreen (auto-driven)", async () => {
    const scm = new FakeSCM();
    const fakeGhClient = new FakeGitHubClient(scm);
    const harness = await makeHarness({
      withRealQuality: true,
      qualityCommand: "pass",
      scm,
      githubClient: asGitHubClient(fakeGhClient),
      ciBabysitterCadence: FAST_CADENCE,
      providerFactory: () => new StubProviderPlugin({ frames: [] }),
    });

    try {
      const wfId = "wf-automerge-2";
      const taskId = "t1";
      const now = new Date().toISOString();

      const createRes = await harness.fetch("/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: wfId,
          kind: "single-task",
          tasks: [{ id: taskId, title: "AutoMerge Task", prompt: "merge me" }],
          policy: { autoLand: true, autoMergeOnGreen: true },
        }),
      });
      expect(createRes.status).toBe(201);

      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "mark-ready", taskId, now },
      });

      const branch = `minions/${slugify(wfId)}_${slugify(taskId)}`;
      const handle = await harness.workspace.create({
        workflowId: wfId,
        taskId,
        branch,
        mode: "worktree",
      });

      const sessionId = "sess-2";
      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "mark-running", taskId, sessionId, workspaceId: handle.workspaceId, now },
      });

      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "complete-runtime", taskId, expectedSessionId: sessionId, artifacts: [], now },
      });

      // Wait for quality gate → finalizing → pr-open (via CompletionDispatcher autoLand)
      await waitFor(async () => {
        const wf = await getWorkflow(harness.fetch, wfId);
        return wf.graph[taskId]?.executionStatus === "pr-open";
      });

      // Set CI checks to green so CIBabysitter auto-merges
      const pr = scm.getPRForBranch(branch);
      expect(pr).toBeDefined();
      scm.setCheckRuns(pr!.headSha, [{ name: "ci", status: "completed", conclusion: "success" }]);

      // Wait for CIBabysitter to poll and merge
      await waitFor(async () => {
        const wf = await getWorkflow(harness.fetch, wfId);
        return wf.graph[taskId]?.executionStatus === "merged";
      }, 10_000);

      expect(scm.getPRForBranch(branch)?.merged).toBe(true);

      // Test 5: workspace lifecycle
      for (const [id, createCount] of harness.workspace.counts.create) {
        const cleanupCount = harness.workspace.counts.cleanup.get(id) ?? 0;
        expect(cleanupCount).toBe(createCount);
      }
    } finally {
      await harness.cleanup();
    }
  }, 30_000);

  it("Test 3: multi-task DAG with restack", async () => {
    const scm = new FakeSCM();
    const harness = await makeHarness({ scm });

    try {
      const wfId = "wf-dag-3";
      const now = new Date().toISOString();

      const createRes = await harness.fetch("/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: wfId,
          kind: "manual-dag",
          tasks: [
            { id: "backend", title: "Backend", prompt: "Build backend" },
            { id: "frontend", title: "Frontend", prompt: "Build frontend" },
            { id: "tests", title: "Tests", prompt: "Test integration", dependsOn: ["backend", "frontend"] },
          ],
          policy: { autoLand: false, maxConcurrent: 2 },
        }),
      });
      expect(createRes.status).toBe(201);

      // Drive backend → completed
      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "mark-ready", taskId: "backend", now },
      });

      const backendBranch = `minions/${slugify(wfId)}_${slugify("backend")}`;
      const backendHandle = await harness.workspace.create({
        workflowId: wfId,
        taskId: "backend",
        branch: backendBranch,
        mode: "worktree",
      });

      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "mark-running", taskId: "backend", sessionId: "sess-back", workspaceId: backendHandle.workspaceId, now },
      });

      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "complete-runtime", taskId: "backend", expectedSessionId: "sess-back", artifacts: [], now },
      });

      // Drive frontend → running
      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "mark-ready", taskId: "frontend", now },
      });

      const frontendBranch = `minions/${slugify(wfId)}_${slugify("frontend")}`;
      const frontendHandle = await harness.workspace.create({
        workflowId: wfId,
        taskId: "frontend",
        branch: frontendBranch,
        mode: "worktree",
      });

      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "mark-running", taskId: "frontend", sessionId: "sess-front", workspaceId: frontendHandle.workspaceId, now },
      });

      // Verify pre-restack state
      const preLandWf = await getWorkflow(harness.fetch, wfId);
      expect(preLandWf.graph["backend"]?.executionStatus).toBe("completed");
      expect(preLandWf.graph["frontend"]?.executionStatus).toBe("running");

      // Request restack on backend (propagates restack-pending to tests)
      const restackNow = new Date().toISOString();
      const restackRes = await harness.fetch("/commands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "request-restack",
          workflowId: wfId,
          input: {
            operationId: "op-restack-1",
            ancestorId: "backend",
            idempotencyKey: "restack-backend-1",
            now: restackNow,
          },
        }),
      });
      if (restackRes.status !== 200) {
        const t = await restackRes.text();
        throw new Error(`request-restack failed ${restackRes.status}: ${t}`);
      }

      const postRestackWf = await getWorkflow(harness.fetch, wfId);

      // Verify graph-operation-changed event was persisted in the event log
      const eventsRepo = new SQLiteWorkflowRepository(harness.dbPath);
      const allEvents = await eventsRepo.eventsSince(wfId, 0);
      eventsRepo.close();
      const opChangedEvents = allEvents.filter((e) => e.kind === "graph-operation-changed");
      expect(opChangedEvents.length).toBeGreaterThan(0);

      // tests task: restack-pending + pending
      expect(postRestackWf.graph["tests"]?.stackStatus).toBe("restack-pending");
      expect(postRestackWf.graph["tests"]?.executionStatus).toBe("pending");

      // frontend unaffected — still running
      expect(postRestackWf.graph["frontend"]?.executionStatus).toBe("running");

      // backend unchanged at completed
      expect(postRestackWf.graph["backend"]?.executionStatus).toBe("completed");

      // Test 5: no orphan workspace for tests task (it was never started)
      const testsWorkspaceId = `ws-${slugify(wfId)}_${slugify("tests")}`;
      expect(harness.workspace.counts.create.has(testsWorkspaceId)).toBe(false);
    } finally {
      await harness.cleanup();
    }
  }, 30_000);

  it("Test 4: boot recovery mid-pipeline", async () => {
    const harness = await makeHarness({
      withRealQuality: false,
      // No scm on engine A — no CompletionDispatcher, no auto openOnly
    });

    const wfId = "wf-recovery-4";
    const taskId = "t1";
    const now = new Date().toISOString();
    const branch = `minions/${slugify(wfId)}_${slugify(taskId)}`;
    let workspaceId = "";

    try {
      const createRes = await harness.fetch("/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: wfId,
          kind: "single-task",
          tasks: [{ id: taskId, title: "Recovery Task", prompt: "recover me" }],
          policy: { autoLand: true },
        }),
      });
      expect(createRes.status).toBe(201);

      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "mark-ready", taskId, now },
      });

      const handle = await harness.workspace.create({
        workflowId: wfId,
        taskId,
        branch,
        mode: "worktree",
      });
      workspaceId = handle.workspaceId;

      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "mark-running", taskId, sessionId: "sess-4", workspaceId, now },
      });

      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "complete-runtime", taskId, expectedSessionId: "sess-4", artifacts: [], now },
      });

      await postCommand(harness.fetch, {
        kind: "transition-task",
        workflowId: wfId,
        transition: { kind: "start-finalization", taskId, now },
      });

      // Verify task is at finalizing before engine A closes
      const preClosedWf = await getWorkflow(harness.fetch, wfId);
      expect(preClosedWf.graph[taskId]?.executionStatus).toBe("finalizing");
    } finally {
      // Close engine A — task stays in finalizing in DB; baseDir not cleaned up yet
      await harness.engine.close();
    }

    // Engine B: fresh FakeSCM, same DB/repo/workspace dirs — dispatcher picks up the finalizing task
    const scmB = new FakeSCM();
    const harnessB = await makeHarness({
      withRealQuality: false,
      scm: scmB,
      dbPath: harness.dbPath,
      repoPath: harness.repoPath,
      workspaceRoot: harness.workspaceRoot,
    });

    try {
      // CompletionDispatcher fires openOnly on the recovered finalizing task
      await waitFor(async () => {
        const wf = await getWorkflow(harnessB.fetch, wfId);
        return wf.graph[taskId]?.executionStatus === "pr-open";
      }, 10_000);

      const postRecoveryWf = await getWorkflow(harnessB.fetch, wfId);
      expect(postRecoveryWf.graph[taskId]?.executionStatus).toBe("pr-open");

      // Engine B's FakeSCM has the PR for the branch
      const pr = scmB.getPRForBranch(branch);
      expect(pr).toBeDefined();
      expect(pr?.merged).toBe(false);

      // Test 5: engine-B cleaned up the workspace created by engine-A during openOnly
      const cleanupCount = harnessB.workspace.counts.cleanup.get(workspaceId) ?? 0;
      expect(cleanupCount).toBeGreaterThanOrEqual(1);
    } finally {
      await harnessB.engine.close();
      const { rm } = await import("node:fs/promises");
      await rm(harness.baseDir, { recursive: true, force: true });
    }
  }, 30_000);
});
