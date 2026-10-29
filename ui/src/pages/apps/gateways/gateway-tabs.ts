import { Activity, LayoutGrid, KeyRound, Wrench, Boxes } from "lucide-react";
import { t } from "@/i18n";

/**
 * Gateway detail tabs (PAP-11200). Terminology is locked by the approved
 * PAP-11178 design of record: Overview · Apps & tools · Tokens · Activity ·
 * Advanced. Raw protocol / JSON / transport details live under Advanced.
 */
export const GATEWAY_TABS = [
  { key: "overview", get label() { return t("ui4.gatewayTabs.overview"); }, icon: LayoutGrid },
  { key: "apps", get label() { return t("ui4.gatewayTabs.appsAndTools"); }, icon: Boxes },
  { key: "tokens", get label() { return t("ui4.gatewayTabs.tokens"); }, icon: KeyRound },
  { key: "activity", get label() { return t("ui4.gatewayTabs.activity"); }, icon: Activity },
  { key: "advanced", get label() { return t("ui4.gatewayTabs.advanced"); }, icon: Wrench },
] as const;

export type GatewayTabKey = (typeof GATEWAY_TABS)[number]["key"];

export function gatewayTabHref(gatewayId: string, tab: GatewayTabKey): string {
  return `/apps/gateways/${gatewayId}/${tab}`;
}

export function isGatewayTabKey(value: string | undefined): value is GatewayTabKey {
  return GATEWAY_TABS.some((tab) => tab.key === value);
}

export function gatewayTabLabel(tabKey: GatewayTabKey): string {
  return GATEWAY_TABS.find((tab) => tab.key === tabKey)?.label ?? t("ui4.gatewayTabs.overview");
}
