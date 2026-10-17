import type { ReactNode } from "react";
import { deriveCreationAttribution, type CreationAttributionFields } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Link } from "@/lib/router";

interface CreationAttributionRowsProps {
  record: CreationAttributionFields;
  entity: "project" | "task" | "folder";
  agents: Array<{ id: string; name: string }> | undefined;
  userLabel: (userId: string) => string | null;
  renderRow: (label: string, value: ReactNode, key: string) => ReactNode;
  /** Shown instead of "unknown" when the record was created by Paperclip itself (a routine, a chat channel, a recovery). */
  noCreatorLabel?: string | null;
}

export function CreationAttributionRows({ record, entity, agents, userLabel, renderRow, noCreatorLabel }: CreationAttributionRowsProps) {
  const { t } = useTranslation();
  const { creator, requestedBy, requestUnproven } = deriveCreationAttribution(record);

  const personName = (userId: string) => userLabel(userId) ?? t("attribution.unknownPerson");
  const agentName = (agentId: string) => agents?.find((agent) => agent.id === agentId)?.name ?? t("attribution.unknownAgent");

  let createdValue: ReactNode;
  if (creator?.kind === "user") {
    createdValue = <span className="min-w-0 truncate text-sm">{personName(creator.id)}</span>;
  } else if (creator?.kind === "agent") {
    createdValue = (
      <span className="flex min-w-0 items-center gap-1.5">
        <Link to={`/agents/${creator.id}`} className="min-w-0 truncate text-sm hover:underline">
          {agentName(creator.id)}
        </Link>
        <span className="shrink-0 text-xs text-muted-foreground">{t("attribution.agentSuffix")}</span>
      </span>
    );
  } else {
    createdValue = <span className="text-xs text-muted-foreground">{noCreatorLabel ?? t("attribution.unknownCreator")}</span>;
  }

  let requestedValue: ReactNode = null;
  if (requestedBy) {
    requestedValue = (
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="min-w-0 truncate text-sm">{personName(requestedBy.userId)}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {t(requestedBy.evidence === "manual_wake" ? "attribution.evidence.manualWake" : "attribution.evidence.message")}
        </span>
      </span>
    );
  } else if (requestUnproven) {
    requestedValue = <span className="text-xs text-muted-foreground">{t("attribution.noEvidence")}</span>;
  }

  return (
    <>
      {renderRow(t("attribution.createdBy"), createdValue, `${entity}-created-by`)}
      {creator?.kind === "agent"
        ? renderRow(t("attribution.requestedBy"), requestedValue, `${entity}-requested-by`)
        : null}
    </>
  );
}
