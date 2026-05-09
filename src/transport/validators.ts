import type { CommandKind } from "../application/commands.js";

type AllCommandKind = CommandKind | "continue-task" | "retry-task" | "approve-permission";

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

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
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

const COMMAND_CHECKS: { [K in AllCommandKind]: FieldCheck[] } = {
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
  "continue-task": [
    BASE_WORKFLOW_ID,
    { path: "taskId", check: isString, expected: "string" },
    { path: "prompt", check: isNonEmptyString, expected: "non-empty string" },
    { path: "attachments", check: (v) => v === undefined || Array.isArray(v), expected: "array or undefined" },
  ],
  "retry-task": [
    BASE_WORKFLOW_ID,
    { path: "taskId", check: isString, expected: "string" },
    { path: "prompt", check: isNonEmptyString, expected: "non-empty string" },
  ],
  "approve-permission": [
    BASE_WORKFLOW_ID,
    { path: "taskId", check: isString, expected: "string" },
    { path: "requestId", check: isNonEmptyString, expected: "non-empty string" },
    { path: "decision", check: (v) => v === "approve" || v === "deny", expected: '"approve" or "deny"' },
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

const ATTACHMENT_ALLOWED_KEYS = new Set(["kind", "path", "line", "body"]);

function validateAttachments(body: unknown): ValidationResult {
  const raw = (body as Record<string, unknown>)["attachments"];
  if (raw === undefined) return { ok: true };
  const items = raw as unknown[];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prefix = `attachments[${i}]`;
    if (!isObject(item)) {
      return { ok: false, failure: { field: prefix, expected: "object", message: `field "${prefix}" must be object` } };
    }
    const obj = item as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (!ATTACHMENT_ALLOWED_KEYS.has(key)) {
        return { ok: false, failure: { field: `${prefix}.${key}`, expected: "not allowed", message: `field "${prefix}.${key}" is not allowed` } };
      }
    }
    if (obj["kind"] !== "comment") {
      return { ok: false, failure: { field: `${prefix}.kind`, expected: '"comment"', message: `field "${prefix}.kind" must be "comment"` } };
    }
    if (typeof obj["path"] !== "string") {
      return { ok: false, failure: { field: `${prefix}.path`, expected: "string", message: `field "${prefix}.path" must be string` } };
    }
    if (typeof obj["line"] !== "number") {
      return { ok: false, failure: { field: `${prefix}.line`, expected: "number", message: `field "${prefix}.line" must be number` } };
    }
    if (typeof obj["body"] !== "string") {
      return { ok: false, failure: { field: `${prefix}.body`, expected: "string", message: `field "${prefix}.body" must be string` } };
    }
  }
  return { ok: true };
}

export function validateCommand(body: unknown): ValidationResult {
  if (!isObject(body)) {
    return { ok: false, failure: { field: "kind", expected: "string", message: 'field "kind" is required and must be string' } };
  }
  const kind = (body as Record<string, unknown>)["kind"];
  if (typeof kind !== "string" || !(kind in COMMAND_CHECKS)) return { ok: true };
  const base = runChecks(body, COMMAND_CHECKS[kind as AllCommandKind]);
  if (!base.ok) return base;
  if (kind === "continue-task") return validateAttachments(body);
  if (kind === "approve-permission") {
    const b = body as Record<string, unknown>;
    if (b["reason"] !== undefined && typeof b["reason"] !== "string") {
      return {
        ok: false,
        failure: {
          field: "reason",
          expected: "string",
          message: 'field "reason" must be a string',
        },
      };
    }
    if (b["decision"] === "deny" && !isNonEmptyString(b["reason"])) {
      return {
        ok: false,
        failure: {
          field: "reason",
          expected: "non-empty string",
          message: 'field "reason" is required and must be non-empty string when decision is "deny"',
        },
      };
    }
  }
  return { ok: true };
}

function isPushEndpoint(v: unknown): boolean {
  if (typeof v !== "string") return false;
  try {
    const url = new URL(v);
    if (url.protocol === "https:") return true;
    if (url.protocol === "http:") {
      return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1" || url.hostname === "[::1]";
    }
    return false;
  } catch {
    return false;
  }
}

const PUSH_SUBSCRIBE_CHECKS: FieldCheck[] = [
  { path: "workflowId", check: isNonEmptyString, expected: "non-empty string" },
  { path: "subscription", check: isObject, expected: "object" },
  { path: "subscription.endpoint", check: isPushEndpoint, expected: "endpoint must be https:// (or http://localhost for local development)" },
  { path: "subscription.keys", check: isObject, expected: "object" },
  { path: "subscription.keys.p256dh", check: isNonEmptyString, expected: "non-empty string" },
  { path: "subscription.keys.auth", check: isNonEmptyString, expected: "non-empty string" },
];

const PUSH_UNSUBSCRIBE_CHECKS: FieldCheck[] = [
  { path: "endpoint", check: isNonEmptyString, expected: "non-empty string" },
  { path: "workflowId", check: isNonEmptyString, expected: "non-empty string" },
];

export function validatePushSubscribe(body: unknown): ValidationResult {
  return runChecks(body, PUSH_SUBSCRIBE_CHECKS);
}

export function validatePushUnsubscribe(body: unknown): ValidationResult {
  return runChecks(body, PUSH_UNSUBSCRIBE_CHECKS);
}

const ALERT_SUBSCRIBE_CHECKS: FieldCheck[] = [
  { path: "subscription", check: isObject, expected: "object" },
  { path: "subscription.endpoint", check: isNonEmptyString, expected: "non-empty string" },
  { path: "subscription.keys", check: isObject, expected: "object" },
  { path: "subscription.keys.p256dh", check: isNonEmptyString, expected: "non-empty string" },
  { path: "subscription.keys.auth", check: isNonEmptyString, expected: "non-empty string" },
];

const ALERT_UNSUBSCRIBE_CHECKS: FieldCheck[] = [
  { path: "endpoint", check: isNonEmptyString, expected: "non-empty string" },
];

export function validateAlertSubscribe(body: unknown): ValidationResult {
  return runChecks(body, ALERT_SUBSCRIBE_CHECKS);
}

export function validateAlertUnsubscribe(body: unknown): ValidationResult {
  return runChecks(body, ALERT_UNSUBSCRIBE_CHECKS);
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

  const policy = (body as Record<string, unknown>)["policy"];
  if (policy !== undefined) {
    if (!isObject(policy)) {
      return { ok: false, failure: { field: "policy", expected: "object", message: 'field "policy" must be object' } };
    }
    const obj = policy as Record<string, unknown>;
    if (obj["maxConcurrent"] !== undefined && typeof obj["maxConcurrent"] !== "number") {
      return { ok: false, failure: { field: "policy.maxConcurrent", expected: "number or undefined", message: 'field "policy.maxConcurrent" must be number or undefined' } };
    }
    if (obj["autoLand"] !== undefined && typeof obj["autoLand"] !== "boolean") {
      return { ok: false, failure: { field: "policy.autoLand", expected: "boolean or undefined", message: 'field "policy.autoLand" must be boolean or undefined' } };
    }
    if (obj["autoMergeOnGreen"] !== undefined && typeof obj["autoMergeOnGreen"] !== "boolean") {
      return { ok: false, failure: { field: "policy.autoMergeOnGreen", expected: "boolean or undefined", message: 'field "policy.autoMergeOnGreen" must be boolean or undefined' } };
    }
  }

  return { ok: true };
}
