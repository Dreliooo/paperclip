import {
  AlertTriangle,
  BookOpen,
  Bot,
  Box,
  Clock3,
  Database,
  FileCheck2,
  FilePenLine,
  FileText,
  GitBranch,
  Info,
  ListChecks,
  PackageCheck,
  Search,
  ShieldCheck,
  TerminalSquare,
  Users,
} from "lucide-react";
import type {
  TaskChatMaterializedResourceItem,
  TaskChatProtocolItem,
  TaskChatProviderActivityItem,
  TaskChatWorkspaceChangeItem,
  TaskChatWorkspaceFileItem,
} from "./task-chat-model";
import {
  humanizeToolName,
  isGenericToolName,
  mcpToolIdentity,
  toolActivityPresentation,
  type ToolIcon,
} from "./tool-taxonomy";
import { t } from "@/i18n";

export interface TaskChatActivityPresentation {
  icon: ToolIcon;
  runningLabel: string;
  completedLabel: string;
  failedLabel?: string;
  interruptedLabel?: string;
  detail?: string;
}

export function providerNoticeSeverity(item: TaskChatProviderActivityItem): "info" | "warning" | "error" {
  const severity = item.details.find((entry) => entry.label === "Severity")?.value;
  if (item.status === "failed" || severity === "error") return "error";
  return severity === "info" ? "info" : "warning";
}

function providerDetail(item: TaskChatProviderActivityItem, ...labels: string[]): string | undefined {
  return item.details.find((entry) => labels.includes(entry.label))?.value;
}

function meaningfulToolDetail(value: string | undefined): string | undefined {
  if (!value || isGenericToolName(value) || /^tool(?:\s+|_)call\b/i.test(value)) return undefined;
  return value;
}

export function providerActivityPresentation(item: TaskChatProviderActivityItem): TaskChatActivityPresentation {
  const detail = item.summary
    ?? providerDetail(item, "Query", "URL", "Target", "Name", "Reference", "Reason", "Summary");
  switch (item.family) {
    case "research": {
      const action = providerDetail(item, "Action")?.toLowerCase();
      if (action === "open_page") {
        return { icon: Search, runningLabel: t("ui3lib.taskChatActivity.openingWebPage"), completedLabel: t("ui3lib.taskChatActivity.openedWebPage"), failedLabel: t("ui3lib.taskChatActivity.openWebPageFailed"), interruptedLabel: t("ui3lib.taskChatActivity.openWebPageStopped"), detail };
      }
      if (action === "find_in_page") {
        return { icon: Search, runningLabel: t("ui3lib.taskChatActivity.searchingPage"), completedLabel: t("ui3lib.taskChatActivity.searchedPage"), failedLabel: t("ui3lib.taskChatActivity.pageSearchFailed"), interruptedLabel: t("ui3lib.taskChatActivity.pageSearchStopped"), detail };
      }
      return { icon: Search, runningLabel: t("ui3lib.taskChatActivity.searchingWeb"), completedLabel: t("ui3lib.taskChatActivity.searchedWeb"), failedLabel: t("ui3lib.taskChatActivity.webSearchFailed"), interruptedLabel: t("ui3lib.taskChatActivity.webSearchStopped"), detail };
    }
    case "tool_execution": {
      const name = providerDetail(item, "Name");
      const target = providerDetail(item, "Target");
      const progress = providerDetail(item, "Progress");
      const tool = toolActivityPresentation({
        name,
        transport: providerDetail(item, "Transport"),
        namespace: providerDetail(item, "Namespace"),
        operation: providerDetail(item, "Operation"),
        target,
        progress,
      });
      const boundedActivity = meaningfulToolDetail(item.summary)
        ?? meaningfulToolDetail(progress)
        ?? meaningfulToolDetail(target);
      const activityIsIdentity = Boolean(
        boundedActivity && name && humanizeToolName(boundedActivity) === humanizeToolName(name),
      );
      const technicalName = name ? mcpToolIdentity(name)?.name ?? name : tool.displayName;
      const source = tool.sourceLabel
        ? `${tool.sourceLabel} · ${technicalName}`
        : name && !isGenericToolName(name) && humanizeToolName(name) !== tool.runningLabel.replace(/^Running /, "")
          ? name
          : undefined;
      return {
        icon: tool.icon,
        runningLabel: tool.runningLabel,
        completedLabel: tool.completedLabel,
        failedLabel: tool.failedLabel,
        interruptedLabel: tool.interruptedLabel,
        detail: [activityIsIdentity ? undefined : boundedActivity, source].filter(Boolean).join(" · ") || undefined,
      };
    }
    case "plan":
      return { icon: ListChecks, runningLabel: t("ui3lib.taskChatActivity.updatingPlan"), completedLabel: t("ui3lib.taskChatActivity.updatedPlan"), failedLabel: t("ui3lib.taskChatActivity.planUpdateFailed"), interruptedLabel: t("ui3lib.taskChatActivity.planUpdateStopped"), detail };
    case "delegation": {
      const action = providerDetail(item, "Action")?.toLowerCase();
      if (action === "message") return { icon: Users, runningLabel: t("ui3lib.taskChatActivity.messagingSubagent"), completedLabel: t("ui3lib.taskChatActivity.messagedSubagent"), failedLabel: t("ui3lib.taskChatActivity.subagentMessageFailed"), interruptedLabel: t("ui3lib.taskChatActivity.subagentMessageStopped"), detail };
      if (action === "resume") return { icon: Users, runningLabel: t("ui3lib.taskChatActivity.resumingSubagent"), completedLabel: t("ui3lib.taskChatActivity.resumedSubagent"), failedLabel: t("ui3lib.taskChatActivity.resumeSubagentFailed"), interruptedLabel: t("ui3lib.taskChatActivity.subagentResumeStopped"), detail };
      if (action === "close") return { icon: Users, runningLabel: t("ui3lib.taskChatActivity.closingSubagent"), completedLabel: t("ui3lib.taskChatActivity.closedSubagent"), failedLabel: t("ui3lib.taskChatActivity.closeSubagentFailed"), interruptedLabel: t("ui3lib.taskChatActivity.subagentCloseStopped"), detail };
      if (action === "wait") return { icon: Users, runningLabel: t("ui3lib.taskChatActivity.waitingSubagents"), completedLabel: t("ui3lib.taskChatActivity.finishedWaitingSubagents"), failedLabel: t("ui3lib.taskChatActivity.subagentWaitFailed"), interruptedLabel: t("ui3lib.taskChatActivity.stoppedWaitingSubagents"), detail };
      return { icon: Users, runningLabel: t("ui3lib.taskChatActivity.startingSubagent"), completedLabel: t("ui3lib.taskChatActivity.startedSubagent"), failedLabel: t("ui3lib.taskChatActivity.subagentStartFailed"), interruptedLabel: t("ui3lib.taskChatActivity.subagentStartStopped"), detail };
    }
    case "model_identity":
      return item.eventType === "model.route.changed"
        ? { icon: Bot, runningLabel: t("ui3lib.taskChatActivity.switchingModels"), completedLabel: t("ui3lib.taskChatActivity.switchedModels"), failedLabel: t("ui3lib.taskChatActivity.modelSwitchFailed"), interruptedLabel: t("ui3lib.taskChatActivity.modelSwitchStopped"), detail }
        : { icon: Bot, runningLabel: t("ui3lib.taskChatActivity.verifyingModel"), completedLabel: t("ui3lib.taskChatActivity.verifiedModel"), failedLabel: t("ui3lib.taskChatActivity.modelVerificationFailed"), interruptedLabel: t("ui3lib.taskChatActivity.modelVerificationStopped"), detail };
    case "context":
      return { icon: Database, runningLabel: t("ui3lib.taskChatActivity.compactingContext"), completedLabel: t("ui3lib.taskChatActivity.compactedContext"), failedLabel: t("ui3lib.taskChatActivity.contextCompactionFailed"), interruptedLabel: t("ui3lib.taskChatActivity.contextCompactionStopped"), detail };
    case "artifact": {
      const viewed = item.eventType === "artifact.viewed";
      return viewed
        ? { icon: Box, runningLabel: t("ui3lib.taskChatActivity.viewingArtifact"), completedLabel: t("ui3lib.taskChatActivity.viewedArtifact"), failedLabel: t("ui3lib.taskChatActivity.viewArtifactFailed"), interruptedLabel: t("ui3lib.taskChatActivity.artifactViewStopped"), detail }
        : { icon: Box, runningLabel: t("ui3lib.taskChatActivity.generatingArtifact"), completedLabel: t("ui3lib.taskChatActivity.generatedArtifact"), failedLabel: t("ui3lib.taskChatActivity.artifactGenerationFailed"), interruptedLabel: t("ui3lib.taskChatActivity.artifactGenerationStopped"), detail };
    }
    case "review": {
      const state = providerDetail(item, "State")?.toLowerCase();
      return state === "exited"
        ? { icon: FileCheck2, runningLabel: t("ui3lib.taskChatActivity.leavingReviewMode"), completedLabel: t("ui3lib.taskChatActivity.leftReviewMode"), failedLabel: t("ui3lib.taskChatActivity.leaveReviewModeFailed"), interruptedLabel: t("ui3lib.taskChatActivity.reviewModeChangeStopped"), detail }
        : { icon: FileCheck2, runningLabel: t("ui3lib.taskChatActivity.enteringReviewMode"), completedLabel: t("ui3lib.taskChatActivity.enteredReviewMode"), failedLabel: t("ui3lib.taskChatActivity.enterReviewModeFailed"), interruptedLabel: t("ui3lib.taskChatActivity.reviewModeChangeStopped"), detail };
    }
    case "hook":
      return { icon: GitBranch, runningLabel: t("ui3lib.taskChatActivity.runningHook"), completedLabel: t("ui3lib.taskChatActivity.ranHook"), failedLabel: t("ui3lib.taskChatActivity.hookFailed"), interruptedLabel: t("ui3lib.taskChatActivity.hookStopped"), detail };
    case "memory":
      return { icon: BookOpen, runningLabel: t("ui3lib.taskChatActivity.checkingMemory"), completedLabel: t("ui3lib.taskChatActivity.referencedMemory"), failedLabel: t("ui3lib.taskChatActivity.memoryLookupFailed"), interruptedLabel: t("ui3lib.taskChatActivity.memoryLookupStopped"), detail };
    case "safety":
      return { icon: ShieldCheck, runningLabel: t("ui3lib.taskChatActivity.reviewingSafety"), completedLabel: t("ui3lib.taskChatActivity.reviewedSafety"), failedLabel: t("ui3lib.taskChatActivity.safetyReviewFailed"), interruptedLabel: t("ui3lib.taskChatActivity.safetyReviewStopped"), detail };
    case "terminal":
      return { icon: TerminalSquare, runningLabel: t("ui3lib.taskChatActivity.sendingTerminalInput"), completedLabel: t("ui3lib.taskChatActivity.sentTerminalInput"), failedLabel: t("ui3lib.taskChatActivity.terminalInputFailed"), interruptedLabel: t("ui3lib.taskChatActivity.terminalInputStopped"), detail };
    case "wait":
      return { icon: Clock3, runningLabel: t("ui3lib.taskChatActivity.waiting"), completedLabel: t("ui3lib.taskChatActivity.finishedWaiting"), failedLabel: t("ui3lib.taskChatActivity.waitFailed"), interruptedLabel: t("ui3lib.taskChatActivity.waitStopped"), detail };
    case "provider_notice":
      return { icon: providerNoticeSeverity(item) === "info" ? Info : AlertTriangle, runningLabel: t("ui3lib.taskChatActivity.providerNotice"), completedLabel: t("ui3lib.taskChatActivity.providerNotice"), failedLabel: t("ui3lib.taskChatActivity.providerError"), interruptedLabel: t("ui3lib.taskChatActivity.providerNotice"), detail };
  }
}

function workspaceChangePresentation(item: TaskChatWorkspaceChangeItem): TaskChatActivityPresentation {
  const count = item.totals.files || item.files.length;
  const detail = count > 0 ? `t("ui3lib.taskChatActivity.fileCount", { count })` : undefined;
  return { icon: FilePenLine, runningLabel: t("ui3lib.taskChatActivity.editingFiles"), completedLabel: t("ui3lib.taskChatActivity.editedFiles"), detail };
}

function workspaceFilePresentation(item: TaskChatWorkspaceFileItem): TaskChatActivityPresentation {
  return {
    icon: FileText,
    runningLabel: t("ui3lib.taskChatActivity.referencingFile"),
    completedLabel: t("ui3lib.taskChatActivity.referencedFile"),
    detail: item.line == null ? item.path : `${item.path}:${item.line}`,
  };
}

function resourcePresentation(item: TaskChatMaterializedResourceItem): TaskChatActivityPresentation {
  return {
    icon: item.resourceKind === "document" ? FileText : PackageCheck,
    runningLabel: t("ui3lib.taskChatActivity.savingResource"),
    completedLabel: item.resourceKind === "document" ? t("ui3lib.taskChatActivity.addedDocument") : t("ui3lib.taskChatActivity.addedDeliverable"),
    detail: item.title,
  };
}

export function protocolActivityPresentation(item: TaskChatProtocolItem): TaskChatActivityPresentation | null {
  switch (item.surface) {
    case "provider_activity": return providerActivityPresentation(item);
    case "workspace_change": return workspaceChangePresentation(item);
    case "workspace_file": return workspaceFilePresentation(item);
    case "resource": return resourcePresentation(item);
    case "runtime_request":
    case "run_result":
    case "run_terminal":
      return null;
  }
}

export function protocolActivityIsRunning(item: TaskChatProtocolItem): boolean {
  if (item.surface === "provider_activity") return item.status === "running";
  if (item.surface === "workspace_change") return !item.complete;
  return false;
}

export function protocolActivityLabel(item: TaskChatProtocolItem, presentation: TaskChatActivityPresentation): string {
  if (item.surface !== "provider_activity") {
    return protocolActivityIsRunning(item) ? presentation.runningLabel : presentation.completedLabel;
  }
  if (item.status === "failed") return presentation.failedLabel ?? t("ui3lib.taskChatActivity.statusFailed", { label: presentation.completedLabel });
  if (item.status === "interrupted") return presentation.interruptedLabel ?? t("ui3lib.taskChatActivity.statusInterrupted", { label: presentation.completedLabel });
  return item.status === "running" ? presentation.runningLabel : presentation.completedLabel;
}
