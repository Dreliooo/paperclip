import { useQuery } from "@tanstack/react-query";
import { ExternalLink, FileText, Loader2, Wrench } from "lucide-react";
import { companySkillsApi } from "@/api/companySkills";
import { ApiError } from "@/api/client";
import { MarkdownBody } from "@/components/MarkdownBody";
import { Button } from "@/components/ui/button";
import { queryKeys } from "@/lib/queryKeys";
import { useNavigate } from "@/lib/router";
import { parseFrontmatterMarkdown } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";

export function TaskSkillPanel({ companyId, skillId }: { companyId: string; skillId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: queryKeys.companySkills.detail(companyId, skillId),
    queryFn: () => companySkillsApi.detail(companyId, skillId),
    retry: false,
    refetchOnWindowFocus: true,
    refetchOnMount: "always",
  });
  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("ui3g2.taskSkill.loading")}
      </div>
    );
  }
  if (query.isError) {
    const status = query.error instanceof ApiError ? query.error.status : null;
    if (status === 404) {
      return <div className="py-8 text-sm text-muted-foreground" role="status">{t("ui3g2.taskSkill.noLongerAvailable")}</div>;
    }
    if (status === 403) {
      return <div className="py-8 text-sm text-muted-foreground" role="alert">{t("ui3g2.taskSkill.noAccess")}</div>;
    }
    return (
      <div className="space-y-3 py-8 text-sm text-muted-foreground" role="alert">
        <p>{t("ui3g2.taskSkill.loadFailed")}</p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          {query.isFetching ? t("ui3g2.taskSkill.retrying") : t("ui3g2.taskSkill.retry")}
        </Button>
      </div>
    );
  }
  if (!query.data) {
    return <div className="py-8 text-sm text-muted-foreground" role="status">{t("ui3g2.taskSkill.noLongerAvailable")}</div>;
  }
  const skill = query.data;
  const previewMarkdown = parseFrontmatterMarkdown(skill.markdown).body;
  return (
    <article className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Wrench className="size-4 text-muted-foreground" aria-hidden />
            <h2 className="text-lg font-semibold">{skill.name}</h2>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/skills/studio/${encodeURIComponent(skill.id)}`)}
          >
            <ExternalLink className="mr-1.5 size-3.5" aria-hidden />
            {t("ui3g2.taskSkill.openStudio")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {skill.slug} · {skill.currentVersion ? t("ui3g2.taskSkill.revision", { number: skill.currentVersion.revisionNumber }) : t("ui3g2.taskSkill.currentVersion")}
        </p>
      </header>
      {skill.description ? <p className="text-sm text-muted-foreground">{skill.description}</p> : null}
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
          <FileText className="size-3.5" aria-hidden />
          {t("ui3g2.taskSkill.instructions")}
        </h3>
        <MarkdownBody>{previewMarkdown || t("ui3g2.taskSkill.instructionsEmpty")}</MarkdownBody>
      </section>
    </article>
  );
}
