import { Database, Gauge, ReceiptText } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTranslation } from "@/i18n";

const SURFACES = [
  {
    titleKey: "ui2g4.accountingModelCard.surfaces.inference.title",
    descriptionKey: "ui2g4.accountingModelCard.surfaces.inference.description",
    icon: Database,
    pointKeys: [
      "ui2g4.accountingModelCard.surfaces.inference.points.tokens",
      "ui2g4.accountingModelCard.surfaces.inference.points.provider",
      "ui2g4.accountingModelCard.surfaces.inference.points.subscription",
    ],
    tone: "from-sky-500/12 via-sky-500/6 to-transparent",
  },
  {
    titleKey: "ui2g4.accountingModelCard.surfaces.finance.title",
    descriptionKey: "ui2g4.accountingModelCard.surfaces.finance.description",
    icon: ReceiptText,
    pointKeys: [
      "ui2g4.accountingModelCard.surfaces.finance.points.topUps",
      "ui2g4.accountingModelCard.surfaces.finance.points.bedrock",
      "ui2g4.accountingModelCard.surfaces.finance.points.credits",
    ],
    tone: "from-amber-500/14 via-amber-500/6 to-transparent",
  },
  {
    titleKey: "ui2g4.accountingModelCard.surfaces.quotas.title",
    descriptionKey: "ui2g4.accountingModelCard.surfaces.quotas.description",
    icon: Gauge,
    pointKeys: [
      "ui2g4.accountingModelCard.surfaces.quotas.points.windows",
      "ui2g4.accountingModelCard.surfaces.quotas.points.credits",
      "ui2g4.accountingModelCard.surfaces.quotas.points.errors",
    ],
    tone: "from-emerald-500/14 via-emerald-500/6 to-transparent",
  },
] as const;

export function AccountingModelCard() {
  const { t } = useTranslation();
  return (
    <Card className="relative overflow-hidden border-border/70">
      <div className="absolute inset-0 bg-(image:--gradient-extract-3)" />
      <CardHeader className="relative px-5 pt-5 pb-2">
        <CardTitle className="text-sm font-semibold uppercase tracking-(--tracking-caps) text-muted-foreground">
          {t("ui2g4.accountingModelCard.title")}
        </CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-6">
          {t("ui2g4.accountingModelCard.description")}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative grid gap-3 px-5 pb-5 md:grid-cols-3">
        {SURFACES.map((surface) => {
          const Icon = surface.icon;
          return (
            <div
              key={surface.titleKey}
              className={`rounded-2xl border border-border/70 bg-gradient-to-br ${surface.tone} p-4 shadow-sm`}
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-background/80">
                  <Icon className="h-4 w-4 text-foreground" />
                </div>
                <div>
                  <div className="text-sm font-semibold">{t(surface.titleKey)}</div>
                  <div className="text-xs text-muted-foreground">{t(surface.descriptionKey)}</div>
                </div>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                {surface.pointKeys.map((pointKey) => (
                  <div key={pointKey}>{t(pointKey)}</div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
