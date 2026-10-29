import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const CATALOG_SOURCES = ["paperclip", "composio", "arcade", "installed", "all"] as const;
export type CatalogSource = typeof CATALOG_SOURCES[number];
export const CATALOG_SOURCE_NAMES = { paperclip: "Paperclip", composio: "Composio", arcade: "Arcade", executor: "Executor", installed: "Installed", all: "All" };

export function CatalogSourceFilters({ source, onChange }: { source: CatalogSource; onChange: (source: CatalogSource) => void }) {
  const { t } = useTranslation();
  return <nav aria-label={t("ui3g6.CatalogSourceFilters.appFilters")} className="flex flex-wrap gap-1">
    {CATALOG_SOURCES.map(value => <Button key={value} variant="ghost" size="sm" aria-pressed={value === source}
      onClick={() => onChange(value)} className={cn("rounded-full px-4 font-normal", value === source ? "bg-accent text-foreground" : "text-muted-foreground")}>
      {value === "installed" ? t("ui3g6.CatalogSourceFilters.installed") : value === "all" ? t("ui3g6.CatalogSourceFilters.all") : CATALOG_SOURCE_NAMES[value]}
    </Button>)}
  </nav>;
}
