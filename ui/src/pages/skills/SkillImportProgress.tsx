import { AlertCircle, Check, FileText, LoaderCircle } from 'lucide-react';
import type { SkillSourceCandidate, SkillSourceScanProgress } from '@paperclipai/shared';
import { formatBytes } from '@/lib/issue-output';
import { GithubIcon } from '@/components/icons/github-icon';
import { useTranslation } from "@/i18n";

export type FoundSkill = Pick<SkillSourceCandidate, 'path' | 'name' | 'description' | 'fileCount' | 'error'>;
export function SkillImportProgress({ repository, progress, found = [], importing = false, count = 0 }: {
  repository: string;
  progress?: SkillSourceScanProgress | null;
  found?: FoundSkill[];
  importing?: boolean;
  count?: number;
}) {
  const { t } = useTranslation();
  const phase = progress?.phase ?? 'connecting';
  const step = phase === 'connecting' || phase === 'downloading' ? 0 : phase === 'listing' ? 1 : 2;
  const download = phase === 'downloading' ? progress?.download : undefined;
  const total = progress?.totalSkills;
  const checking = !importing && phase === 'checking' && total != null;
  const title = importing ? t("ui3g8.skillImportProgress.importingTitle", { count })
    : checking ? t("ui3g8.skillImportProgress.foundTitle", { count: total })
    : phase === 'downloading' ? download?.stage === 'resolving' ? t("ui3g8.skillImportProgress.preparingRepository") : t("ui3g8.skillImportProgress.downloadingRepository")
    : phase === 'listing' ? t("ui3g8.skillImportProgress.findingSkills") : t("ui3g8.skillImportProgress.openingRepository");
  const detail = importing ? t("ui3g8.skillImportProgress.checkingPackage")
    : checking ? t("ui3g8.skillImportProgress.checkedOf", { checked: progress?.checkedSkills ?? 0, total })
    : phase === 'downloading' ? download ? (download.receivedBytes ? t(download.stage === 'resolving' ? "ui3g8.skillImportProgress.percentPreparedSize" : "ui3g8.skillImportProgress.percentReceivedSize", { percent: download.percent, size: formatBytes(download.receivedBytes) }) : t(download.stage === 'resolving' ? "ui3g8.skillImportProgress.percentPrepared" : "ui3g8.skillImportProgress.percentReceived", { percent: download.percent })) : t("ui3g8.skillImportProgress.receivingRepository")
    : phase === 'listing' ? t("ui3g8.skillImportProgress.searchingFolders") : t("ui3g8.skillImportProgress.connecting");
  const recent = found.slice(-5);
  return <section className="skill-import-enter flex min-w-0 flex-col gap-5" aria-label={importing ? t("ui3g8.skillImportProgress.importProgress") : t("ui3g8.skillImportProgress.scanProgress")}>
    <div className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2.5">
      <GithubIcon className="size-5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-sm font-medium" title={repository}>{repository}</span>
    </div>
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted"><LoaderCircle className="size-5 motion-safe:animate-spin text-muted-foreground" aria-hidden /></span>
        <div className="min-w-0 flex-1" role="status" aria-live="polite" aria-atomic="true">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{detail}</p>
        </div>
      </div>
      {!importing && download ? <progress className="skill-import-progress h-1 w-full" value={download.percent} max={100} aria-label={download.stage === 'resolving' ? t("ui3g8.skillImportProgress.preparingRepository") : t("ui3g8.skillImportProgress.repositoryDownload")} /> : checking && total > 0
        ? <progress className="skill-import-progress h-1 w-full" value={progress?.checkedSkills ?? 0} max={total} aria-label={t("ui3g8.skillImportProgress.skillsChecked")} />
        : <div className="h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={importing ? t("ui3g8.skillImportProgress.savingSnapshots") : t("ui3g8.skillImportProgress.scanningRepository")}><div className="skill-import-sweep h-full rounded-full bg-foreground/30" /></div>}
      {!importing && <ol className="flex items-center justify-between gap-2 text-xs text-muted-foreground" aria-label={t("ui3g8.skillImportProgress.scanStages")}>
        {[t("ui3g8.skillImportProgress.stepDownload"), t("ui3g8.skillImportProgress.stepFind"), t("ui3g8.skillImportProgress.stepCheck")].map((label, index) => <li key={label} className={`flex items-center gap-1.5 ${index === step ? 'text-foreground' : ''}`} aria-current={index === step ? 'step' : undefined}>
          {index < step ? <Check className="size-3" aria-hidden /> : <span className={`size-1.5 rounded-full ${index === step ? 'bg-foreground motion-safe:animate-pulse' : 'bg-muted-foreground/40'}`} />}{label}
        </li>)}
      </ol>}
    </div>
    <div className="overflow-hidden rounded-lg border border-border bg-muted/20">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 text-xs text-muted-foreground">
        <span>{importing ? t("ui3g8.skillImportProgress.selectedSkills") : t("ui3g8.skillImportProgress.recentlyChecked")}</span>
        {recent.length > 0 && <span className="tabular-nums">{importing ? t("ui3g8.skillImportProgress.selectedCount", { count }) : t("ui3g8.skillImportProgress.checkedCount", { count: progress?.checkedSkills ?? found.length })}</span>}
      </div>
      {recent.length > 0 ? <ul className="divide-y divide-border" aria-label={importing ? t("ui3g8.skillImportProgress.skillsBeingImported") : t("ui3g8.skillImportProgress.skillsCheckedSoFar")}>
        {recent.map(skill => <li key={skill.path} className="skill-import-enter flex min-w-0 items-center gap-2.5 px-3 py-2.5">
          {skill.error ? <AlertCircle className="size-4 shrink-0 text-destructive" aria-label={t("ui3g8.skillImportProgress.validationIssue")} />
            : importing ? <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : <Check className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-baseline gap-2"><span className="truncate text-sm font-medium">{skill.name}</span><span className="shrink-0 text-xs text-muted-foreground">{t("ui3g8.skillImportProgress.fileCount", { count: skill.fileCount })}</span></div>
            <p className={`truncate text-xs ${skill.error ? 'text-destructive' : 'text-muted-foreground'}`} title={skill.error ?? skill.path}>{skill.error ?? skill.path}</p>
          </div>
        </li>)}
      </ul> : <div className="flex flex-col gap-3 px-3 py-4" aria-hidden="true">
        {["w-2/3", "w-1/2", "w-3/4"].map(width => <div key={width} className="flex items-center gap-3 motion-safe:animate-pulse"><FileText className="size-4 text-muted-foreground/40" /><span className={`${width} h-2 rounded-full bg-muted`} /></div>)}
      </div>}
      <div className="flex min-w-0 items-center gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
        <LoaderCircle className="size-3 shrink-0 motion-safe:animate-spin" aria-hidden />
        <span className="min-w-0 flex-1 truncate" title={progress?.currentPath ?? undefined}>{importing ? t("ui3g8.skillImportProgress.savingPackages") : progress?.currentPath ?? t("ui3g8.skillImportProgress.waitingContents")}</span>
        {checking && progress?.totalFiles != null && <span className="shrink-0 tabular-nums">{t("ui3g8.skillImportProgress.filesProgress", { checked: progress.checkedFiles, total: progress.totalFiles })}</span>}
      </div>
    </div>
    <p className="text-xs text-muted-foreground">{importing ? t("ui3g8.skillImportProgress.importHint") : t("ui3g8.skillImportProgress.checkHint")}</p>
  </section>;
}
