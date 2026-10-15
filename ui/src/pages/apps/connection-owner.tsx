import type { McpConnection, ToolConnection } from "@paperclipai/shared";
import { humanizeConnectionDisplayName } from "@paperclipai/shared";
import { Identity } from "@/components/Identity";
import type { CompanyUserProfile } from "@/lib/company-members";
import { t, useTranslation } from "@/i18n";

export type ConnectionOwnerProfile = CompanyUserProfile;

export function connectionOwnerProfile(
  connection: Pick<ToolConnection, "createdByUserId">,
  profiles: ReadonlyMap<string, CompanyUserProfile>,
): ConnectionOwnerProfile | null {
  if (!connection.createdByUserId) return null;
  return profiles.get(connection.createdByUserId) ?? {
    label: connection.createdByUserId === "local-board" ? t("ui3g8.connectionOwner.board") : t("ui3g8.connectionOwner.boardMember"),
    image: null,
  };
}

function ownerGivenName(label: string): string {
  const trimmed = label.trim();
  if (!trimmed) return t("ui3g8.connectionOwner.board");
  const first = trimmed.split(/\s+/)[0] ?? trimmed;
  return first.includes("@") ? first.split("@")[0] || t("ui3g8.connectionOwner.board") : first;
}

/** Owner-first app name ("Dotta’s Notion"); Spanish puts the app first ("Notion de Dotta"). */
function ownerAppName(givenName: string, appName: string): string {
  return t(givenName.toLowerCase().endsWith("s") ? "ui3g8.connectionOwner.ownerAppS" : "ui3g8.connectionOwner.ownerApp", { name: givenName, app: appName });
}

/**
 * Keep intentionally customized account names, while making the default app
 * name useful in a multi-user company ("Dotta’s Notion", "Sam’s Gmail").
 */
export function connectionDisplayNameForOwner(
  connection: Pick<ToolConnection, "name">,
  applicationName: string,
  owner: ConnectionOwnerProfile | null,
): string {
  const rawName = connection.name.trim();
  // Provider account identifiers are machine values, not prose. Preserve
  // their casing and punctuation so an email address or tenant hostname stays
  // recognizable in the inline account list.
  const connectionName =
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawName) ||
    /^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(rawName)
      ? rawName
      : humanizeConnectionDisplayName(connection);
  if (!owner) return connectionName;
  if (connectionName.trim().toLocaleLowerCase() !== applicationName.trim().toLocaleLowerCase()) {
    return connectionName;
  }
  return ownerAppName(ownerGivenName(owner.label), applicationName);
}

/** Use the same owner naming as outbound connections, without changing OAuth client identity. */
export function assistantConnectionDisplayName(connection: McpConnection): string {
  const clientName = connection.clientName.trim();
  if (!connection.user) return t("ui3g8.connectionOwner.assistantConnection", { client: clientName });
  const givenName = ownerGivenName(connection.user.name);
  return t(givenName.toLowerCase().endsWith("s") ? "ui3g8.connectionOwner.assistantConnectionOwnedS" : "ui3g8.connectionOwner.assistantConnectionOwned", { name: givenName, client: clientName });
}

export function ConnectionOwnerIdentity({ owner }: { owner: ConnectionOwnerProfile | null }) {
  const { t } = useTranslation();
  if (!owner) return <span className="text-xs text-muted-foreground">{t("ui3g8.connectionOwner.unknown")}</span>;
  return (
    <Identity
      name={owner.label}
      avatarUrl={owner.image}
      size="sm"
      className="text-muted-foreground"
    />
  );
}
