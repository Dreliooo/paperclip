import type { ExecutionProjection } from "@paperclipai/shared";
import { Loader2 } from "lucide-react";
import type { TranscriptEntry } from "../../adapters";
import { cn } from "@/lib/utils";
import { useSecondTick } from "@/hooks/useSecondTick";
import { formatDurationWords } from "@/lib/issue-chat-messages";
import { isCommandTool } from "@/lib/transcriptPresentation";
import { isTerminalRunStatus } from "@/components/task-chat/transcript-adapter";
import { TaskChatAgentIdentity } from "@/components/task-chat/TaskChatBubble";
import { useTranslation } from "@/i18n";
import type { ComponentProps } from "react";

type AvatarAgent = ComponentProps<typeof TaskChatAgentIdentity>["agent"];

/**
 * "ran N commands, called M tools" for the live tail's status pill, counted off
 * the streamed transcript entries. Mirrors IssueChatThread's `toolCountSummary`
 * (which counts a settled message's tool-call parts) so the experimental live
 * tail reads the same as the default view. Streaming runtimes re-emit a
 * tool_call as its status progresses, so calls carrying a `toolUseId` are
 * counted once.
 */
export interface ToolCounts {
  commands: number;
  other: number;
}

export function toolCountsFromEntries(entries: readonly TranscriptEntry[]): ToolCounts {
  const seen = new Set<string>();
  let commands = 0;
  let other = 0;
  for (const entry of entries) {
    if (entry.kind !== "tool_call") continue;
    if (entry.toolUseId) {
      if (seen.has(entry.toolUseId)) continue;
      seen.add(entry.toolUseId);
    }
    if (isCommandTool(entry.name, entry.input)) commands += 1;
    else other += 1;
  }
  return { commands, other };
}

export function toolCountSummaryFromEntries(entries: readonly TranscriptEntry[]): string | null {
  const { commands, other } = toolCountsFromEntries(entries);
  const parts: string[] = [];
  if (commands > 0) parts.push(`ran ${commands} command${commands === 1 ? "" : "s"}`);
  if (other > 0) parts.push(`called ${other} tool${other === 1 ? "" : "s"}`);
  return parts.length > 0 ? parts.join(", ") : null;
}

/**
 * Status pill for the experimental chat-style view's live tail (PAP-461, A1).
 *
 * Byte-for-byte the same affordance the default view shows above a run's chain
 * of thought (IssueChatThread's CoT header): a spinner + shimmering "Working"
 * verb + elapsed words + "· called N tools" while the run streams, settling to
 * a static emerald dot + "Worked" summary once it terminates. The verb shimmers
 * via `.shimmer-text` (reduced-motion aware) exactly as the default view does.
 */
/** Localized "11 minutes" / "1 hour 5 minutes" with Intl unit names. */
export function formatElapsedWords(ms: number | null, locale: string): string | null {
  if (ms === null || !Number.isFinite(ms) || ms <= 0) return null;
  const unit = (value: number, name: "second" | "minute" | "hour") =>
    new Intl.NumberFormat(locale, { style: "unit", unit: name, unitDisplay: "long" }).format(value);
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  if (totalSeconds < 60) return unit(totalSeconds, "second");
  const totalMinutes = Math.round(totalSeconds / 60);
  if (totalMinutes < 60) return unit(totalMinutes, "minute");
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? unit(hours, "hour") : `${unit(hours, "hour")} ${unit(minutes, "minute")}`;
}

export function TaskChatLiveRunPill({
  status,
  startedAtMs,
  finishedAtMs,
  toolSummary,
  toolCounts,
  agentName,
  agentIcon,
  agent,
}: {
  status: string;
  execution?: ExecutionProjection | null;
  /** Run start (startedAt, falling back to createdAt) in ms, or null if unknown. */
  startedAtMs: number | null;
  /** Run finish in ms once terminal; drives the settled elapsed readout. */
  finishedAtMs?: number | null;
  toolSummary: string | null;
  /** Counted tool calls; preferred over `toolSummary` because it can be translated. */
  toolCounts?: ToolCounts | null;
  /** The agent running this turn, so "Working" says who is working. */
  agentName?: string | null;
  agentIcon?: string | null;
  agent?: AvatarAgent;
}) {
  const { t, i18n } = useTranslation();
  const active = !isTerminalRunStatus(status);
  // One shared page-wide ticker drives the live elapsed readout, matching the
  // default view's `useLiveElapsed`.
  useSecondTick(active && startedAtMs != null);

  const elapsedMs =
    startedAtMs == null ? null : (active ? Date.now() : finishedAtMs ?? Date.now()) - startedAtMs;
  const elapsed = elapsedMs != null
    ? formatElapsedWords(elapsedMs, i18n.language) ?? formatDurationWords(elapsedMs)
    : null;
  const failed = ["failed", "timed_out", "cancelled", "interrupted"].includes(status);
  const verb = active ? t("taskChat.run.working") : failed ? t("taskChat.run.stopped") : t("taskChat.run.worked");
  const suffix = elapsed
    ? t(active ? "taskChat.run.forDuration" : "taskChat.run.forDurationDone", { duration: elapsed })
    : null;
  const countParts = toolCounts
    ? [
        toolCounts.commands > 0 ? t("taskChat.run.commands", { count: toolCounts.commands }) : null,
        toolCounts.other > 0 ? t("taskChat.run.tools", { count: toolCounts.other }) : null,
      ].filter(Boolean)
    : [];
  const countLabel = toolCounts ? (countParts.length > 0 ? countParts.join(", ") : null) : toolSummary;

  return (
    <div
      className="flex min-w-0 items-center gap-2 py-2"
      data-testid="task-chat-live-run-pill"
    >
      {agentName ? (
        <span className="inline-flex min-w-0 items-center" title={t("taskChat.run.whoIsWorking", { name: agentName })}>
          <TaskChatAgentIdentity agentName={agentName} agentIcon={agentIcon} agent={agent} />
          <span className="text-xs text-muted-foreground/60" aria-hidden>·</span>
        </span>
      ) : null}
      <span className="inline-flex items-center gap-2 text-sm font-medium text-foreground/80">
        {active ? (
          <span className="flex size-5 shrink-0 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          </span>
        ) : (
          <span className="flex size-5 shrink-0 items-center justify-center">
            <span className={cn("h-1.5 w-1.5 rounded-full", (failed || active) ? "bg-muted-foreground/40" : "bg-emerald-500/70")} />
          </span>
        )}
        {active ? <span className={cn("shimmer-text")}>{verb}</span> : verb}
      </span>
      {suffix ? <span className="text-xs text-muted-foreground/60">{suffix}</span> : null}
      {countLabel ? <span className="text-xs text-muted-foreground/40">· {countLabel}</span> : null}
    </div>
  );
}
