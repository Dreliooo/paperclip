import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IssueDocument } from "@paperclipai/shared";
import { Check, Copy, Download, FileQuestion, Loader2 } from "lucide-react";
import { ApiError } from "@/api/client";
import { issuesApi } from "@/api/issues";
import { DocumentAnnotationsCountChip, IssueDocumentAnnotations } from "@/components/IssueDocumentAnnotations";
import { MarkdownBody } from "@/components/MarkdownBody";
import { queryKeys } from "@/lib/queryKeys";
import { documentDisplayTitle } from "@/lib/issue-artifacts";
import { useLocation } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { useCopyAction } from "@/lib/use-copy-action";
import { documentFileName, downloadMarkdownFile } from "@/lib/document-download";

export function TaskDocumentPanel({
  issueId,
  documentKey,
  initialDocument,
}: {
  issueId: string;
  documentKey: string;
  initialDocument?: IssueDocument;
}) {
  const location = useLocation();
  const { t } = useTranslation();
  const copyAction = useCopyAction();
  const [annotationPanelOpen, setAnnotationPanelOpen] = useState(false);
  const query = useQuery<IssueDocument | null>({
    queryKey: [...queryKeys.issues.documents(issueId), documentKey],
    queryFn: async () => {
      try {
        return await issuesApi.getDocument(issueId, documentKey);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    initialData: initialDocument,
  });

  if (query.isLoading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        {t("documents.loading")}
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="py-8 text-sm text-muted-foreground" role="alert">
        {t("documents.loadFailed")}
      </div>
    );
  }
  const document = query.data;
  if (!document) {
    return (
      <div className="flex items-start gap-3 py-8 text-sm" role="status">
        <FileQuestion className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
        <div className="space-y-1">
          <p className="font-medium">{t("documents.missingTitle")}</p>
          <p className="text-muted-foreground">{t("documents.missingBody")}</p>
        </div>
      </div>
    );
  }

  const title = documentDisplayTitle(document);
  const hasBody = Boolean(document.body.trim());

  return (
    <article className="space-y-4">
      <header className="space-y-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-lg font-semibold">{title}</h2>
          {hasBody ? (
            <div className="flex shrink-0 items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                title={t("documents.copyTitle")}
                aria-live="polite"
                onClick={() => void copyAction.copy(document.body)}
              >
                {copyAction.copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                {copyAction.copied
                  ? t("documents.copied")
                  : copyAction.failed
                    ? t("documents.copyFailed")
                    : t("documents.copy")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                title={t("documents.downloadTitle")}
                aria-label={t("documents.download")}
                onClick={() => downloadMarkdownFile(documentFileName(document.title, document.key), document.body)}
              >
                <Download className="h-3.5 w-3.5" />
              </Button>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
          <span>{t("documents.revision", { number: document.latestRevisionNumber ?? 1 })}</span>
          <span aria-hidden>·</span>
          <span>{t("documents.updated", { date: new Date(document.updatedAt).toLocaleString() })}</span>
          <DocumentAnnotationsCountChip
            issueId={issueId}
            docKey={document.key}
            panelOpen={annotationPanelOpen}
            onToggle={() => setAnnotationPanelOpen((open) => !open)}
          />
        </div>
      </header>
      {hasBody ? (
        <IssueDocumentAnnotations
          issueId={issueId}
          doc={document}
          bodyMarkdown={document.body}
          draftDirty={false}
          draftConflicted={false}
          historicalPreview={false}
          locationHash={location.hash}
          panelOpen={annotationPanelOpen}
          onPanelOpenChange={setAnnotationPanelOpen}
          panelPlacement="popover"
        >
          <MarkdownBody>{document.body}</MarkdownBody>
        </IssueDocumentAnnotations>
      ) : (
        <p className="text-sm text-muted-foreground">{t("documents.empty")}</p>
      )}
    </article>
  );
}
