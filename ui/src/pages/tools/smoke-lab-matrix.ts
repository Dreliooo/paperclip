import {
  SMOKE_RUN_STEP_PATHS,
  type SmokeRun,
  type SmokeRunStep,
  type SmokeRunStepPath,
  type SmokeRunStepStatus,
} from "@paperclipai/shared";
import { t } from "@/i18n";

/**
 * Pure matrix/health helpers for the Smoke Lab tab (PAP-13347 / S2, plan §D3).
 * Kept free of React so the cell/health logic is unit-testable on its own.
 *
 * The integration matrix is the plan §3 table: rows are the seven paths
 * (P1–P7), columns are the PAP-12373 governed lifecycle. Each recorded step
 * carries a free-form `scenarioStep` string owned by the S4 catalog; we fold it
 * onto a canonical lifecycle stage by keyword so the matrix stays a stable
 * 7×8 grid no matter how S4 words its steps. Raw `scenarioStep` values are
 * always shown verbatim in the run drill-down, so nothing is hidden.
 */

export const SMOKE_PATH_LABELS: Record<SmokeRunStepPath, { title: string; detail: string }> = {
  P1: {
    get title() { return t("ui4.smokeLab.paths.P1.title"); },
    get detail() { return t("ui4.smokeLab.paths.P1.detail"); },
  },
  P2: {
    get title() { return t("ui4.smokeLab.paths.P2.title"); },
    get detail() { return t("ui4.smokeLab.paths.P2.detail"); },
  },
  P3: {
    get title() { return t("ui4.smokeLab.paths.P3.title"); },
    get detail() { return t("ui4.smokeLab.paths.P3.detail"); },
  },
  P4: {
    get title() { return t("ui4.smokeLab.paths.P4.title"); },
    get detail() { return t("ui4.smokeLab.paths.P4.detail"); },
  },
  P5: {
    get title() { return t("ui4.smokeLab.paths.P5.title"); },
    get detail() { return t("ui4.smokeLab.paths.P5.detail"); },
  },
  P6: {
    get title() { return t("ui4.smokeLab.paths.P6.title"); },
    get detail() { return t("ui4.smokeLab.paths.P6.detail"); },
  },
  P7: {
    get title() { return t("ui4.smokeLab.paths.P7.title"); },
    get detail() { return t("ui4.smokeLab.paths.P7.detail"); },
  },
};

export interface LifecycleStage {
  key: string;
  label: string;
  /** Keywords (lowercased) that fold a `scenarioStep` onto this stage. */
  match: string[];
}

/** The PAP-12373 governed lifecycle, in order (plan §3). */
export const LIFECYCLE_STAGES: LifecycleStage[] = [
  { key: "connect", get label() { return t("ui4.smokeLab.stages.connect"); }, match: ["connect", "oauth", "login", "auth"] },
  { key: "discover", get label() { return t("ui4.smokeLab.stages.discover"); }, match: ["discover", "catalog", "list-tools"] },
  { key: "read", get label() { return t("ui4.smokeLab.stages.read"); }, match: ["read", "allowed"] },
  { key: "write", get label() { return t("ui4.smokeLab.stages.write"); }, match: ["write", "approve", "ask-first", "askfirst", "review"] },
  { key: "deny", get label() { return t("ui4.smokeLab.stages.deny"); }, match: ["deny", "denied", "block", "forbidden"] },
  { key: "quarantine", get label() { return t("ui4.smokeLab.stages.quarantine"); }, match: ["quarantine", "schema"] },
  { key: "revoke", get label() { return t("ui4.smokeLab.stages.revoke"); }, match: ["revoke"] },
  { key: "audit", get label() { return t("ui4.smokeLab.stages.audit"); }, match: ["audit", "activity", "evidence"] },
];

/** Fold a free-form scenario step onto a canonical lifecycle stage, or null. */
export function matchLifecycleStage(scenarioStep: string): string | null {
  const s = scenarioStep.toLowerCase();
  for (const stage of LIFECYCLE_STAGES) {
    if (stage.match.some((kw) => s.includes(kw))) return stage.key;
  }
  return null;
}

export type CellStatus = SmokeRunStepStatus | "not-run";

function stepTime(step: SmokeRunStep): number {
  const raw = step.updatedAt ?? step.createdAt;
  const t = new Date(raw as string | Date).getTime();
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Latest status per (path, stage) cell across the given steps. Later steps win
 * so a matrix always reflects the most recent attempt at each cell.
 */
export function buildSmokeMatrix(steps: SmokeRunStep[]): Map<string, { status: CellStatus; step: SmokeRunStep }> {
  const cells = new Map<string, { status: CellStatus; step: SmokeRunStep }>();
  const ordered = [...steps].sort((a, b) => stepTime(a) - stepTime(b));
  for (const step of ordered) {
    const stage = matchLifecycleStage(step.scenarioStep);
    if (!stage) continue;
    cells.set(`${step.path}::${stage}`, { status: step.status, step });
  }
  return cells;
}

export function cellKey(path: SmokeRunStepPath, stageKey: string): string {
  return `${path}::${stageKey}`;
}

export const SMOKE_PATHS = SMOKE_RUN_STEP_PATHS;

export type SmokeHealth = "green" | "amber" | "red" | "unknown";

/** Overall traffic-light for a run: red on any failure, amber if unfinished/empty. */
export function runHealth(run: SmokeRun | undefined, steps: SmokeRunStep[]): SmokeHealth {
  if (!run) return "unknown";
  if (run.status === "failed") return "red";
  if (steps.some((s) => s.status === "fail")) return "red";
  if (run.summary.partial === true) return "amber";
  if (run.status === "cancelled") return "amber";
  if (run.status === "running") return "amber";
  if (steps.length === 0) return "amber";
  return "green";
}

/** Paths with at least one failing step in the given run. */
export function failingPaths(steps: SmokeRunStep[]): SmokeRunStepPath[] {
  const failed = new Set<SmokeRunStepPath>();
  for (const step of steps) {
    if (step.status === "fail") failed.add(step.path);
  }
  return SMOKE_RUN_STEP_PATHS.filter((p) => failed.has(p));
}
