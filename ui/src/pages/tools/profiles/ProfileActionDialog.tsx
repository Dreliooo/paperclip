import { AlertTriangle } from "lucide-react";
import type { ToolProfileWithDetails } from "@paperclipai/shared";
import { useTranslation } from "@/i18n";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type ProfileActionDialogKind = "archive" | "delete" | "restore";

export function ProfileActionDialog({
  kind,
  profile,
  pending,
  onClose,
  onArchive,
  onRestore,
  onDelete,
}: {
  kind: ProfileActionDialogKind | null;
  profile: ToolProfileWithDetails | null;
  pending: boolean;
  onClose: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  if (!kind || !profile) return null;

  const defaultDeleteBlocked = kind === "delete" && profile.summary.isCompanyDefault;
  const copy = {
    archive: {
      title: t("ui3g9.profileActionDialog.archiveTitle"),
      body: t("ui3g9.profileActionDialog.archiveBody", { count: profile.summary.appliesToAgentCount }),
      confirm: t("ui3g9.profileActionDialog.archiveConfirm"),
      action: onArchive,
    },
    restore: {
      title: t("ui3g9.profileActionDialog.restoreTitle"),
      body: t("ui3g9.profileActionDialog.restoreBody"),
      confirm: t("ui3g9.profileActionDialog.restoreConfirm"),
      action: onRestore,
    },
    delete: {
      title: t("ui3g9.profileActionDialog.deleteTitle"),
      body: defaultDeleteBlocked
        ? t("ui3g9.profileActionDialog.deleteBlockedBody")
        : t("ui3g9.profileActionDialog.deleteBody", { count: profile.summary.assignmentCount }),
      confirm: t("ui3g9.profileActionDialog.deleteConfirm"),
      action: onDelete,
    },
  }[kind];

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.body}</DialogDescription>
        </DialogHeader>
        {defaultDeleteBlocked ? (
          <div className="flex gap-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("ui3g9.profileActionDialog.deleteBlockedNotice")}</span>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("ui3g9.profileActionDialog.cancel")}</Button>
          <Button
            variant={kind === "delete" ? "destructive" : "default"}
            disabled={pending || defaultDeleteBlocked}
            onClick={copy.action}
          >
            {copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
