import { useRef } from "react";
import {
  Activity as ActivityIcon,
  Circle,
  Clock3,
  History as HistoryIcon,
  KeyRound,
  LayoutGrid,
  Play,
  Send,
  SlidersHorizontal,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useTranslation } from "@/i18n";
import { Link } from "@/lib/router";
import { cn } from "@/lib/utils";
import {
  ROUTINE_SECTION_KEYS,
  type RoutineSectionKey,
} from "./routine-sections/context";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type NavItem = {
  key: RoutineSectionKey;
  labelKey: string;
  icon: LucideIcon;
};

type NavGroup = {
  labelKey: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    labelKey: "ui3g1.RoutineSubSidebar.routine",
    items: [
      { key: "overview", labelKey: "ui3g1.RoutineSubSidebar.overview", icon: Circle },
      { key: "triggers", labelKey: "ui3g1.RoutineSubSidebar.triggers", icon: Clock3 },
      { key: "variables", labelKey: "ui3g1.RoutineSubSidebar.variables", icon: LayoutGrid },
      { key: "secrets", labelKey: "ui3g1.RoutineSubSidebar.secrets", icon: KeyRound },
      { key: "delivery", labelKey: "ui3g1.RoutineSubSidebar.delivery", icon: Send },
    ],
  },
  {
    labelKey: "ui3g1.RoutineSubSidebar.operate",
    items: [
      { key: "runs", labelKey: "ui3g1.RoutineSubSidebar.runs", icon: Play },
      { key: "activity", labelKey: "ui3g1.RoutineSubSidebar.activity", icon: ActivityIcon },
      { key: "history", labelKey: "ui3g1.RoutineSubSidebar.history", icon: HistoryIcon },
    ],
  },
];

const ALL_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items);

export function RoutineSubSidebar({
  activeSection,
  hrefFor,
  isSectionDirty,
  hasLiveRun,
  onNavigate,
}: {
  activeSection: RoutineSectionKey;
  hrefFor: (section: RoutineSectionKey) => string;
  isSectionDirty: (section: RoutineSectionKey) => boolean;
  hasLiveRun: boolean;
  onNavigate: (section: RoutineSectionKey) => void;
}) {
  const { t } = useTranslation();
  const itemRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const focusItem = (index: number) => {
    const clamped = (index + ALL_ITEMS.length) % ALL_ITEMS.length;
    itemRefs.current[clamped]?.focus();
    onNavigate(ALL_ITEMS[clamped].key);
  };

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        focusItem(index + 1);
        break;
      case "ArrowUp":
        event.preventDefault();
        focusItem(index - 1);
        break;
      case "Home":
        event.preventDefault();
        focusItem(0);
        break;
      case "End":
        event.preventDefault();
        focusItem(ALL_ITEMS.length - 1);
        break;
      default:
        break;
    }
  };

  let flatIndex = -1;

  return (
    <nav
      aria-label={t("ui3g1.RoutineSubSidebar.routineSections")}
      className="hidden h-full w-52 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-background px-3 py-4 md:flex"
    >
      {NAV_GROUPS.map((group) => (
        <div key={group.labelKey} className="flex flex-col gap-0.5">
          <p className="mx-2 px-2 pb-1 text-(length:--text-nano) font-medium uppercase tracking-widest font-mono text-muted-foreground/60">
            {t(group.labelKey)}
          </p>
          {group.items.map((item) => {
            flatIndex += 1;
            const index = flatIndex;
            const isActive = item.key === activeSection;
            const Icon = item.icon;
            const dirty = isSectionDirty(item.key);
            const showLiveDot = item.key === "runs" && hasLiveRun;
            return (
              <Link
                key={item.key}
                ref={(node) => {
                  itemRefs.current[index] = node;
                }}
                to={hrefFor(item.key)}
                replace
                role="tab"
                aria-current={isActive ? "page" : undefined}
                tabIndex={isActive ? 0 : -1}
                onKeyDown={(event) => handleKeyDown(event, index)}
                onClick={() => onNavigate(item.key)}
                className={cn(
                  // Match the primary nav rows (SidebarNavItem): same rhythm,
                  // inset pill, type scale, and icon size.
                  "flex items-center gap-2.5 mx-2 rounded-lg px-2 py-1.5 pointer-coarse:py-1 text-(length:--text-compact) font-medium transition-colors motion-safe:duration-150",
                  isActive
                    ? "bg-accent text-foreground"
                    : "text-foreground/80 hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{t(item.labelKey)}</span>
                {showLiveDot ? (
                  <span className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-blue-500 motion-safe:animate-pulse" />
                ) : dirty ? (
                  <span
                    aria-label={t("ui3g1.RoutineSubSidebar.unsavedChanges")}
                    className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 ring-2 ring-background"
                  />
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Mobile section picker — collapses the sub-sidebar into a grouped `<Select>`. */
export function RoutineSectionPicker({
  activeSection,
  onNavigate,
  isSectionDirty,
}: {
  activeSection: RoutineSectionKey;
  onNavigate: (section: RoutineSectionKey) => void;
  isSectionDirty: (section: RoutineSectionKey) => boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-10 border-b border-border bg-background px-4 py-2 md:hidden">
      <Select
        value={activeSection}
        onValueChange={(value) => {
          if (ROUTINE_SECTION_KEYS.includes(value as RoutineSectionKey)) {
            onNavigate(value as RoutineSectionKey);
          }
        }}
      >
        <SelectTrigger className="h-11 w-full" aria-label={t("ui3g1.RoutineSubSidebar.routineSection")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {NAV_GROUPS.map((group) => (
            <SelectGroup key={group.labelKey}>
              <SelectLabel className="uppercase tracking-(--tracking-eyebrow) text-(length:--text-micro)">
                {t(group.labelKey)}
              </SelectLabel>
              {group.items.map((item) => (
                <SelectItem key={item.key} value={item.key} className="h-11">
                  <span className="flex items-center gap-2">
                    <item.icon className="h-3.5 w-3.5" />
                    {t(item.labelKey)}
                    {isSectionDirty(item.key) ? (
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    ) : null}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export { ALL_ITEMS as ROUTINE_NAV_ITEMS };
