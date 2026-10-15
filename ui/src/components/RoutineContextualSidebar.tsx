import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/i18n";
import {
  Activity,
  Braces,
  CalendarClock,
  KeyRound,
  LayoutDashboard,
  Play,
  Repeat,
  Send,
  type LucideIcon,
} from "lucide-react";
import { routinesApi } from "@/api/routines";
import { queryKeys } from "@/lib/queryKeys";
import { useParams } from "@/lib/router";
import { ContextualSidebarFrame } from "./ContextualSidebarFrame";
import { SidebarNavItem } from "./SidebarNavItem";

export const ROUTINE_DETAIL_VIEWS = [
  "overview",
  "triggers",
  "variables",
  "delivery",
  "secrets",
  "history",
  "runs",
  "activity",
] as const;

export type RoutineDetailView = (typeof ROUTINE_DETAIL_VIEWS)[number];

export type RoutineContextualNavItem = {
  view: Exclude<RoutineDetailView, "history">;
  labelKey: string;
  icon: LucideIcon;
};

export const ROUTINE_CONTEXTUAL_NAV_ITEMS: readonly RoutineContextualNavItem[] = [
  { view: "overview", labelKey: "ui3g1.RoutineContextualSidebar.overview", icon: LayoutDashboard },
  { view: "triggers", labelKey: "ui3g1.RoutineContextualSidebar.triggers", icon: CalendarClock },
  { view: "variables", labelKey: "ui3g1.RoutineContextualSidebar.variables", icon: Braces },
  { view: "delivery", labelKey: "ui3g1.RoutineContextualSidebar.delivery", icon: Send },
  { view: "secrets", labelKey: "ui3g1.RoutineContextualSidebar.secrets", icon: KeyRound },
];

export function isRoutineDetailView(value: string | null | undefined): value is RoutineDetailView {
  return ROUTINE_DETAIL_VIEWS.includes(value as RoutineDetailView);
}

export function routineDetailHref(routineId: string, view: RoutineDetailView = "overview") {
  return `/routines/${routineId}/${view}`;
}

/** Keep routine configuration and operations in the routine detail shell. */
export function resolveRoutineDetailDestination(input: {
  routineId: string;
  section?: string | null;
  legacyTab?: string | null;
}) {
  const requested = input.legacyTab ?? input.section;
  if (isRoutineDetailView(requested)) return routineDetailHref(input.routineId, requested);
  return routineDetailHref(input.routineId, "overview");
}

export function RoutineContextualSidebar({
  routineId: routineIdProp,
  title,
}: {
  routineId?: string;
  title?: string;
} = {}) {
  const { t } = useTranslation();
  const params = useParams<{ routineId?: string }>();
  const routineId = routineIdProp ?? params.routineId ?? "";
  const { data: routine } = useQuery({
    queryKey: queryKeys.routines.detail(routineId),
    queryFn: () => routinesApi.get(routineId),
    enabled: Boolean(routineId && !title),
  });
  const frameTitle = title ?? routine?.title ?? t("ui3g1.RoutineContextualSidebar.routine");

  return (
    <ContextualSidebarFrame
      surface="routine"
      title={frameTitle}
      icon={Repeat}
      fallbackTo="/routines"
      showHeader={false}
      className="border-r border-border bg-background"
    >
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-2" aria-label={t("ui3g1.RoutineContextualSidebar.routineNavigation")}>
        <div className="flex flex-col gap-0.5">
          {ROUTINE_CONTEXTUAL_NAV_ITEMS.map((item) => (
            <SidebarNavItem
              key={item.view}
              to={routineDetailHref(routineId, item.view)}
              label={t(item.labelKey)}
              icon={item.icon}
              end
            />
          ))}
        </div>

        <p className="px-4 pb-1 pt-5 text-(length:--text-nano) font-mono font-medium uppercase tracking-widest text-muted-foreground/60">
          {t("ui3g1.RoutineContextualSidebar.operate")}
        </p>
        <div className="flex flex-col gap-0.5">
          <SidebarNavItem
            to={routineDetailHref(routineId, "runs")}
            label={t("ui3g1.RoutineContextualSidebar.runs")}
            icon={Play}
          />
          <SidebarNavItem
            to={routineDetailHref(routineId, "activity")}
            label={t("ui3g1.RoutineContextualSidebar.activity")}
            icon={Activity}
          />
        </div>
      </nav>
    </ContextualSidebarFrame>
  );
}
