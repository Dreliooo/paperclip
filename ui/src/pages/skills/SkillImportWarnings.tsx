import { AlertTriangle } from 'lucide-react';
import type { SkillRepositoryPackage, SkillSourceCandidate } from '@paperclipai/shared';
import { t, useTranslation } from "@/i18n";

export function skillImportWarnings(candidates: Pick<SkillSourceCandidate, 'path' | 'error' | 'inspection'>[], repositoryPackage?: SkillRepositoryPackage | null, warnings: string[] = []) {
  return [...new Set([
    ...warnings,
    ...(repositoryPackage?.warnings ?? []),
    ...(repositoryPackage?.error ? [repositoryPackage.error] : []),
    ...candidates.flatMap(candidate => [
      ...(candidate.error ? [t("ui3g8.skillImportWarnings.needsSetup", { path: candidate.path, error: candidate.error })] : []),
      ...(candidate.inspection?.warnings.filter(warning => warning.includes('not included') || warning.includes('couldn’t be included')) ?? []),
      ...(candidate.inspection?.references.map(reference => t("ui3g8.skillImportWarnings.notIncluded", { resolvedPath: reference.resolvedPath, path: candidate.path })) ?? []),
    ]),
  ])];
}

/** Import warnings disclose omissions without creating another decision. */
export function SkillImportWarnings({ warnings }: { warnings: string[] }) {
  const { t } = useTranslation();
  if (!warnings.length) return null;
  return <details className="text-sm" aria-label={t("ui3g8.skillImportWarnings.ariaLabel")}>
    <summary className="cursor-pointer text-muted-foreground"><span className="inline-flex items-center gap-2"><AlertTriangle className="size-4 shrink-0" />{t("ui3g8.skillImportWarnings.count", { count: warnings.length })}</span></summary>
    <ul className="mt-2 space-y-2 text-xs text-muted-foreground">{warnings.map(warning => <li className="break-words" key={warning}>{warning}</li>)}</ul>
  </details>;
}
