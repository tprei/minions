import type { CommandKind } from "../application/commands.js";

export interface ValidationFailure {
  field: string;
  expected: string;
  message: string;
}

export type ValidationResult = { ok: true } | { ok: false; failure: ValidationFailure };

type FieldCheck = {
  path: string;
  check: (v: unknown) => boolean;
  expected: string;
};

function get(obj: unknown, path: string): unknown {
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function isString(v: unknown): boolean {
  return typeof v === "string";
}

function isObject(v: unknown): boolean {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isOptionalObject(v: unknown): boolean {
  return v === undefined || isObject(v);
}

function isArray(v: unknown): boolean {
  return Array.isArray(v);
}

function runChecks(body: unknown, checks: FieldCheck[]): ValidationResult {
  for (const { path, check, expected } of checks) {
    const value = get(body, path);
    if (!check(value)) {
      return {
        ok: false,
        failure: {
          field: path,
          expected,
          message: `field "${path}" is required and must be ${expected}`,
        },
      };
    }
  }
  return { ok: true };
}

const BASE_WORKFLOW_ID: FieldCheck = { path: "workflowId", check: isString, expected: "string" };

const COMMAND_CHECKS: { [K in CommandKind]: FieldCheck[] } = {
  "transition-task": [
    BASE_WORKFLOW_ID,
    { path: "transition", check: isObject, expected: "object" },
    { path: "transition.kind", check: isString, expected: "string" },
    { path: "transition.taskId", check: isString, expected: "string" },
    { path: "transition.now", check: isString, expected: "string" },
  ],
  "request-restack": [
    BASE_WORKFLOW_ID,
    { path: "input", check: isObject, expected: "object" },
    { path: "input.operationId", check: isString, expected: "string" },
    { path: "input.ancestorId", check: isString, expected: "string" },
    { path: "input.idempotencyKey", check: isString, expected: "string" },
    { path: "input.now", check: isString, expected: "string" },
  ],
  "start-restack": [
    BASE_WORKFLOW_ID,
    { path: "operationId", check: isString, expected: "string" },
    { path: "now", check: isString, expected: "string" },
  ],
  "complete-restack": [
    BASE_WORKFLOW_ID,
    { path: "input", check: isObject, expected: "object" },
    { path: "input.operationId", check: isString, expected: "string" },
    { path: "input.artifactsByTaskId", check: isOptionalObject, expected: "object or undefined" },
    { path: "input.now", check: isString, expected: "string" },
  ],
  "mark-restack-conflict": [
    BASE_WORKFLOW_ID,
    { path: "operationId", check: isString, expected: "string" },
    { path: "error", check: isString, expected: "string" },
    { path: "now", check: isString, expected: "string" },
  ],
};

const TASK_SPEC_CHECKS: FieldCheck[] = [
  { path: "id", check: isString, expected: "string" },
  { path: "title", check: isString, expected: "string" },
  { path: "prompt", check: isString, expected: "string" },
];

const WORKFLOW_SPEC_CHECKS: FieldCheck[] = [
  { path: "id", check: isString, expected: "string" },
  { path: "kind", check: isString, expected: "string" },
  { path: "tasks", check: isArray, expected: "array" },
];

export function validateCommand(body: unknown): ValidationResult {
  if (!isObject(body)) {
    return { ok: false, failure: { field: "kind", expected: "string", message: 'field "kind" is required and must be string' } };
  }
  const kind = (body as Record<string, unknown>)["kind"];
  if (typeof kind !== "string" || !(kind in COMMAND_CHECKS)) return { ok: true };
  return runChecks(body, COMMAND_CHECKS[kind as CommandKind]);
}

export function validateWorkflowSpec(body: unknown): ValidationResult {
  const topLevel = runChecks(body, WORKFLOW_SPEC_CHECKS);
  if (!topLevel.ok) return topLevel;

  const tasks = (body as Record<string, unknown>)["tasks"] as unknown[];
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i];
    for (const { path, check, expected } of TASK_SPEC_CHECKS) {
      const value = get(task, path);
      if (!check(value)) {
        const qualifiedPath = `tasks[${i}].${path}`;
        return {
          ok: false,
          failure: {
            field: qualifiedPath,
            expected,
            message: `field "${qualifiedPath}" is required and must be ${expected}`,
          },
        };
      }
    }
  }

  return { ok: true };
}
