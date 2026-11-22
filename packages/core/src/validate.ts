import { readFileSync } from "node:fs";
import type { ScanReport } from "./index.js";

/**
 * Validates a parsed JSON value against `schema/scan-report.v1.json`.
 *
 * ADR-004 allows no JSON Schema library at runtime, so this interprets the subset of
 * draft 2020-12 the schema uses. A test fails if the schema ever uses a keyword or type
 * outside SUPPORTED_KEYWORDS / SUPPORTED_TYPES, so the two cannot drift silently.
 *
 * On a node with `pattern`, `description` is written as a noun phrase ("an https URL")
 * because it becomes the error message: "<path> must be <description>".
 */

export interface ValidationError {
  /** Where the problem is, e.g. `report.findings[0].severity`. */
  path: string;
  /** A full sentence that names the path, what was expected and what was found. */
  message: string;
}

export type ReportValidation =
  | { valid: true; report: ScanReport }
  | { valid: false; errors: ValidationError[] };

export const SUPPORTED_KEYWORDS = [
  "$schema",
  "$defs",
  "$ref",
  "title",
  "description",
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "const",
  "minimum",
  "minLength",
  "pattern",
  "format",
] as const;

export const SUPPORTED_TYPES = ["object", "array", "string", "integer", "number"] as const;

/**
 * Formats checked as assertions. JSON Schema treats `format` as an annotation by default;
 * validateReport asserts these because a report must hold real values, not just well-shaped ones.
 * Any other format is ignored, as the spec allows.
 */
export const SUPPORTED_FORMATS = ["date-time"] as const;

type JsonType = (typeof SUPPORTED_TYPES)[number];

interface SchemaNode {
  $ref?: string;
  $defs?: Record<string, SchemaNode>;
  description?: string;
  type?: JsonType;
  properties?: Record<string, SchemaNode>;
  required?: string[];
  additionalProperties?: boolean | SchemaNode;
  items?: SchemaNode;
  enum?: unknown[];
  const?: unknown;
  minimum?: number;
  minLength?: number;
  pattern?: string;
  format?: string;
}

const TYPE_NAMES: Record<JsonType, string> = {
  object: "an object",
  array: "an array",
  string: "a string",
  integer: "an integer",
  number: "a number",
};

const MAX_SHOWN = 60;

let cachedSchema: SchemaNode | undefined;

function reportSchema(): SchemaNode {
  // Resolved relative to this module: works from src/ (tests) and dist/ (published), both one
  // level below the package root where schema/ lives.
  cachedSchema ??= JSON.parse(
    readFileSync(new URL("../schema/scan-report.v1.json", import.meta.url), "utf8"),
  ) as SchemaNode;
  return cachedSchema;
}

/** Checks a parsed report. Collects every problem, in schema order, rather than stopping at the first. */
export function validateReport(value: unknown): ReportValidation {
  const root = reportSchema();
  const errors: ValidationError[] = [];
  check(value, root, root, "report", errors);
  return errors.length === 0
    ? { valid: true, report: value as ScanReport }
    : { valid: false, errors };
}

/** The interpreter on its own, for testing the JSON Schema semantics the report schema relies on. */
export function validateWithSchema(value: unknown, schema: object): ValidationError[] {
  const root = schema as SchemaNode;
  const errors: ValidationError[] = [];
  check(value, root, root, "value", errors);
  return errors;
}

function check(
  value: unknown,
  node: SchemaNode,
  root: SchemaNode,
  path: string,
  errors: ValidationError[],
): void {
  const fail = (expectation: string): void => {
    errors.push({ path, message: `${path} ${expectation}.` });
  };

  if (node.$ref !== undefined) {
    // Draft 2020-12: keywords next to $ref apply too, so check the target, then carry on.
    const { $ref, ...siblings } = node;
    check(value, resolveRef($ref, root), root, path, errors);
    node = siblings;
  }
  if (Object.hasOwn(node, "const") && value !== node.const) {
    fail(`must be ${JSON.stringify(node.const)} (got ${describe(value)})`);
    return;
  }
  if (node.enum !== undefined && !node.enum.includes(value)) {
    fail(
      `must be one of ${listOf(node.enum.map((v) => JSON.stringify(v)))} (got ${describe(value)})`,
    );
    return;
  }
  if (node.type !== undefined && !hasType(value, node.type)) {
    fail(`must be ${TYPE_NAMES[node.type]} (got ${describe(value)})`);
    return;
  }

  if (typeof value === "number" && node.minimum !== undefined && value < node.minimum) {
    fail(`must be at least ${node.minimum} (got ${describe(value)})`);
  }

  if (typeof value === "string") {
    // JSON Schema counts characters (code points), not UTF-16 units.
    if (node.minLength !== undefined && Array.from(value).length < node.minLength) {
      fail(
        node.minLength === 1
          ? "must not be empty"
          : `must have at least ${node.minLength} characters`,
      );
    } else if (node.pattern !== undefined && !compiled(node.pattern).test(value)) {
      fail(
        `must be ${node.description ?? `text matching ${node.pattern}`} (got ${describe(value)})`,
      );
    } else if (node.format === "date-time" && !isRealDateTime(value)) {
      fail(`must be a real calendar date and time (got ${describe(value)})`);
    }
  }

  if (Array.isArray(value) && node.items !== undefined) {
    const items = node.items;
    value.forEach((item, index) => {
      check(item, items, root, `${path}[${index}]`, errors);
    });
  }

  // Object keywords apply to any object value, whether or not the node says type: object.
  if (isPlainObject(value)) checkObject(value, node, root, path, errors);
}

function checkObject(
  value: Record<string, unknown>,
  node: SchemaNode,
  root: SchemaNode,
  path: string,
  errors: ValidationError[],
): void {
  const properties = node.properties ?? {};
  for (const key of node.required ?? []) {
    if (!Object.hasOwn(value, key)) {
      errors.push({
        path,
        message: `${path} is missing required property ${JSON.stringify(key)}.`,
      });
    }
  }
  // Schema order, not input order, so the error list is the same however the input is laid out.
  for (const [key, child] of Object.entries(properties)) {
    if (Object.hasOwn(value, key)) check(value[key], child, root, childPath(path, key), errors);
  }
  // Extra keys sorted, so their errors don't depend on how the input happened to be written.
  const extraKeys = Object.keys(value)
    .filter((key) => !Object.hasOwn(properties, key))
    .sort();
  for (const key of extraKeys) {
    if (node.additionalProperties === false) {
      errors.push({ path, message: `${path} has unknown property ${describe(key)}.` });
    } else if (typeof node.additionalProperties === "object") {
      check(value[key], node.additionalProperties, root, childPath(path, key), errors);
    }
  }
}

function resolveRef(ref: string, root: SchemaNode): SchemaNode {
  const name = ref.startsWith("#/$defs/") ? ref.slice("#/$defs/".length) : undefined;
  const target = name === undefined ? undefined : root.$defs?.[name];
  // Only reachable if the schema file itself is broken; tests pin every $ref in it.
  if (target === undefined)
    throw new Error(`scan-report schema: cannot resolve $ref ${ref}. Reinstall @neukee/core.`);
  return target;
}

function hasType(value: unknown, type: JsonType): boolean {
  switch (type) {
    case "object":
      return isPlainObject(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return Number.isInteger(value);
    case "number":
      return typeof value === "number" && Number.isFinite(value);
  }
}

const DATE_TIME =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/;
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** RFC 3339 date-time with a time zone, and a date that exists (no Feb 30, no Feb 29 in 2027). */
function isRealDateTime(value: string): boolean {
  const match = DATE_TIME.exec(value);
  if (match === null) return false;
  // Absent groups (the offset, for "Z") count as 0.
  const part = (group: number): number => Number(match[group] ?? "0");
  const [year, month, day, hour, minute, second] = [1, 2, 3, 4, 5, 6].map(part) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ];
  const offsetHour = part(7);
  const offsetMinute = part(8);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const monthDays = month === 2 && leap ? 29 : (DAYS_IN_MONTH[month - 1] ?? 0);
  return (
    day >= 1 &&
    day <= monthDays &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetMinute <= 59 &&
    (offsetHour < 14 || (offsetHour === 14 && offsetMinute === 0))
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const patterns = new Map<string, RegExp>();

function compiled(pattern: string): RegExp {
  let regex = patterns.get(pattern);
  if (regex === undefined) {
    regex = new RegExp(pattern, "u");
    patterns.set(pattern, regex);
  }
  return regex;
}

function childPath(path: string, key: string): string {
  return /^[A-Za-z_$][\w$]*$/.test(key) && key.length <= MAX_SHOWN
    ? `${path}.${key}`
    : `${path}[${describe(key)}]`;
}

/** A short, safe rendering of a value for an error message. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (typeof value === "object") return "an object";
  if (typeof value === "string") {
    // Cut on code points so an emoji at the cut isn't split into a lone surrogate.
    const chars = Array.from(value);
    return chars.length > MAX_SHOWN
      ? `${JSON.stringify(chars.slice(0, MAX_SHOWN).join("")).slice(0, -1)}…`
      : JSON.stringify(value);
  }
  return String(value);
}

/** ["a", "b", "c"] → `a, b or c` */
function listOf(items: string[]): string {
  return items.length <= 1 ? items.join("") : `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}
