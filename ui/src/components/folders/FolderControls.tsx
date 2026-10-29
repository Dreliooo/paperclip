import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Folder as FolderIcon,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { FolderKind, FolderListItem, FolderListResult } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";
import {
  reservedRootLabel,
  treeFromResult,
  type FolderTreeNode,
} from "./skill-folder-tree";

export type FolderSelection = "all" | "unfiled" | string;

export const FOLDER_COLORS = [
  "indigo",
  "violet",
  "emerald",
  "cyan",
  "amber",
  "slate",
];

const FOLDER_COLOR_VALUES: Record<(typeof FOLDER_COLORS)[number], string> = {
  indigo: "var(--folder-color-indigo)",
  violet: "var(--folder-color-violet)",
  emerald: "var(--folder-color-emerald)",
  cyan: "var(--folder-color-cyan)",
  amber: "var(--folder-color-amber)",
  slate: "var(--folder-color-slate)",
};

/** Deepest folder level the server accepts (see server/src/services/folders.ts). */
export const MAX_FOLDER_DEPTH = 4;

const DEPTH_INDENT = ["", "pl-4", "pl-8", "pl-12"];

/** Indentation for a folder at `depth` (1 = top level). */
export function folderIndentClass(depth: number | null | undefined) {
  return DEPTH_INDENT[Math.min(Math.max((depth ?? 1) - 1, 0), DEPTH_INDENT.length - 1)];
}

/** Folders parent-first, siblings in server order, so a flat list reads as a tree. */
export function foldersInTreeOrder<T extends Pick<FolderListItem, "id" | "parentId">>(folders: T[]): T[] {
  const ids = new Set(folders.map((folder) => folder.id));
  const children = new Map<string | null, T[]>();
  for (const folder of folders) {
    const parentKey = folder.parentId && ids.has(folder.parentId) ? folder.parentId : null;
    children.set(parentKey, [...(children.get(parentKey) ?? []), folder]);
  }
  const ordered: T[] = [];
  const seen = new Set<string>();
  const visit = (parentId: string | null) => {
    for (const folder of children.get(parentId) ?? []) {
      if (seen.has(folder.id)) continue;
      seen.add(folder.id);
      ordered.push(folder);
      visit(folder.id);
    }
  };
  visit(null);
  return ordered;
}

/** A folder plus every folder below it. */
export function folderSubtreeIds(folders: Pick<FolderListItem, "id" | "parentId">[], folderId: string) {
  const ids = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId && ids.has(folder.parentId) && !ids.has(folder.id)) {
        ids.add(folder.id);
        grew = true;
      }
    }
  }
  return ids;
}

export function normalizeFolderSelection(value: string | null | undefined): FolderSelection {
  if (!value) return "all";
  if (value === "unfiled") return "unfiled";
  return value;
}

export function folderSearchValue(selection: FolderSelection): string {
  return selection === "all" ? "" : selection === "unfiled" ? "unfiled" : selection;
}

export function selectedFolderFromList(
  folders: FolderListItem[],
  selection: FolderSelection,
): FolderListItem | null {
  if (selection === "all" || selection === "unfiled") return null;
  return folders.find((folder) => folder.id === selection) ?? null;
}

export function FolderSwatch({
  color,
  className,
}: {
  color: string | null | undefined;
  className?: string;
}) {
  const backgroundColor = color
    ? (FOLDER_COLOR_VALUES[color] ?? color)
    : "var(--folder-color-slate)";
  return (
    <span
      aria-hidden="true"
      className={cn("h-2.5 w-2.5 shrink-0 rounded-sm border border-border/40", className)}
      style={{ backgroundColor }}
    />
  );
}

function selectionLabel({
  folders,
  selection,
  allLabel,
  unfiledLabel,
}: {
  folders: FolderListItem[];
  selection: FolderSelection;
  allLabel: string;
  unfiledLabel: string;
}) {
  if (selection === "all") return allLabel;
  if (selection === "unfiled") return unfiledLabel;
  return folders.find((folder) => folder.id === selection)?.name ?? allLabel;
}

function selectionCount(result: FolderListResult | null | undefined, selection: FolderSelection) {
  if (!result) return 0;
  if (selection === "all") return result.allCount;
  if (selection === "unfiled") return result.unfiledCount;
  return result.folders.find((folder) => folder.id === selection)?.itemCount ?? 0;
}

export function FolderChip({
  result,
  selection,
  allLabel,
  onClick,
}: {
  result: FolderListResult | null | undefined;
  selection: FolderSelection;
  allLabel: string;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const folder = result ? selectedFolderFromList(result.folders, selection) : null;
  return (
    <Button variant="outline" size="sm" className="max-w-full justify-start" onClick={onClick}>
      {selection === "all" ? <FolderIcon className="mr-2 h-3.5 w-3.5" /> : <FolderSwatch color={folder?.color} className="mr-2" />}
      <span className="truncate">{selectionLabel({ folders: result?.folders ?? [], selection, allLabel, unfiledLabel: t("folders.unfiled") })}</span>
      <span className="ml-2 text-xs text-muted-foreground">{selectionCount(result, selection)}</span>
      <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0" />
    </Button>
  );
}

export function FolderRail({
  result,
  selection,
  itemLabelPlural,
  allLabel,
  loading = false,
  onSelect,
  onCreate,
  onRename,
  onEdit,
  onDelete,
  nested = false,
  onCreateChild,
  describeFolder,
}: {
  result: FolderListResult | null | undefined;
  selection: FolderSelection;
  itemLabelPlural: string;
  allLabel: string;
  loading?: boolean;
  onSelect: (selection: FolderSelection) => void;
  onCreate: () => void;
  onRename: (folder: FolderListItem, name: string) => void;
  onEdit: (folder: FolderListItem) => void;
  onDelete: (folder: FolderListItem) => void;
  /** Show subfolders indented under their parent. */
  nested?: boolean;
  onCreateChild?: (parent: FolderListItem) => void;
  /** Extra detail for a folder's tooltip, such as who created it. */
  describeFolder?: (folder: FolderListItem) => string;
}) {
  const { t } = useTranslation();
  const folders = useMemo(
    () => (nested ? foldersInTreeOrder(result?.folders ?? []) : result?.folders ?? []),
    [nested, result?.folders],
  );
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");

  useEffect(() => {
    if (!renamingFolderId) return;
    const folder = folders.find((entry) => entry.id === renamingFolderId);
    if (!folder) setRenamingFolderId(null);
  }, [folders, renamingFolderId]);

  function startRename(folder: FolderListItem) {
    setRenamingFolderId(folder.id);
    setRenameDraft(folder.name);
  }

  function commitRename(folder: FolderListItem) {
    const name = renameDraft.trim();
    if (name && name !== folder.name) onRename(folder, name);
    setRenamingFolderId(null);
  }

  function renderVirtualRow(
    key: FolderSelection,
    label: string,
    count: number,
    icon: ReactNode,
  ) {
    const active = selection === key;
    return (
      <button
        type="button"
        className={cn(
          "grid w-full grid-cols-(--gtc-folder-row) items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/40",
          active ? "bg-accent/60 text-foreground" : "text-muted-foreground",
        )}
        aria-current={active ? "page" : undefined}
        onClick={() => onSelect(key)}
      >
        <span className="h-4 w-4">{icon}</span>
        <span className="truncate">{label}</span>
        <span className="text-xs text-muted-foreground">{count}</span>
      </button>
    );
  }

  return (
    <nav aria-label={t("folders.navLabel", { items: itemLabelPlural })} className="hidden w-(--sz-folder-rail) shrink-0 border-r border-border pr-3 md:block">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-(length:--text-micro) font-medium uppercase tracking-wide text-muted-foreground">{t("folders.heading")}</div>
        <Button variant="ghost" size="icon-sm" title={t("folders.newFolder")} onClick={onCreate}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      {loading ? (
        <div className="space-y-2">
          <div className="h-7 rounded-md bg-muted/60" />
          <div className="h-7 rounded-md bg-muted/40" />
          <div className="h-7 rounded-md bg-muted/30" />
        </div>
      ) : (
        <div className="space-y-0.5">
          {renderVirtualRow("all", allLabel, result?.allCount ?? 0, <FolderIcon className="h-3.5 w-3.5" />)}
          {folders.map((folder) => (
            <FolderRailItem
              key={folder.id}
              folder={folder}
              depth={nested ? folder.depth : 1}
              description={describeFolder?.(folder)}
              onCreateChild={onCreateChild && (folder.depth ?? 1) < MAX_FOLDER_DEPTH ? () => onCreateChild(folder) : undefined}
              active={selection === folder.id}
              renaming={renamingFolderId === folder.id}
              renameDraft={renameDraft}
              onRenameDraftChange={setRenameDraft}
              onRenameCommit={() => commitRename(folder)}
              onRenameCancel={() => setRenamingFolderId(null)}
              onSelect={() => onSelect(folder.id)}
              onStartRename={() => startRename(folder)}
              onEdit={() => onEdit(folder)}
              onDelete={() => onDelete(folder)}
            />
          ))}
          <div className="px-2 pb-1 pt-3 text-(length:--text-micro) font-medium uppercase tracking-wide text-muted-foreground">
            {t("folders.system")}
          </div>
          {renderVirtualRow("unfiled", t("folders.unfiled"), result?.unfiledCount ?? 0, <FolderSwatch color={null} className="mt-0.5" />)}
        </div>
      )}
    </nav>
  );
}

/**
 * One selectable rail row. The leading 1rem grid column is the reserved
 * disclosure/indent slot so nested folders can slot in later without relayout
 * (ux-spec §3.1/§3.2 "nesting-ready").
 */
export function FolderRailItem({
  folder,
  depth = 1,
  description,
  onCreateChild,
  active,
  renaming,
  renameDraft,
  onRenameDraftChange,
  onRenameCommit,
  onRenameCancel,
  onSelect,
  onStartRename,
  onEdit,
  onDelete,
}: {
  folder: FolderListItem;
  depth?: number;
  description?: string;
  onCreateChild?: () => void;
  active: boolean;
  renaming: boolean;
  renameDraft: string;
  onRenameDraftChange: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onSelect: () => void;
  onStartRename: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={cn(
        "group grid grid-cols-(--gtc-folder-row-actions) items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent/40",
        active ? "bg-accent/60 text-foreground" : "text-muted-foreground",
        folderIndentClass(depth),
      )}
      data-folder-depth={depth}
    >
      <span className="h-4 w-4" />
      <button
        type="button"
        className="flex min-w-0 items-center gap-2 text-left"
        aria-current={active ? "page" : undefined}
        title={description ? `${folder.name} · ${description}` : undefined}
        onClick={onSelect}
        onDoubleClick={onStartRename}
      >
        <FolderSwatch color={folder.color} />
        {renaming ? (
          <input
            value={renameDraft}
            onChange={(event) => onRenameDraftChange(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") onRenameCommit();
              if (event.key === "Escape") onRenameCancel();
            }}
            onBlur={onRenameCommit}
            className="h-6 min-w-0 flex-1 rounded-sm border border-border bg-background px-1 text-sm outline-none"
            autoFocus
          />
        ) : (
          <span className="truncate">{folder.name}</span>
        )}
      </button>
      <span className="text-xs text-muted-foreground">{folder.itemCount}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
            aria-label={t("folders.actionsFor", { name: folder.name })}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onCreateChild ? (
            <DropdownMenuItem onSelect={onCreateChild}>
              <Plus className="h-3.5 w-3.5" />
              {t("folders.newSubfolder")}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={onStartRename}>{t("folders.rename")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onEdit}>{t("folders.editColor")}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={onDelete}>
            <Trash2 className="h-3.5 w-3.5" />
            {t("folders.delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/**
 * Dismissible nudge shown when items exist but no folders do (ux-spec §6.3).
 * Dismissal persists per storage key.
 */
export function AllUnfiledBanner({
  storageKey,
  itemLabelPlural,
  onCreateFolder,
}: {
  storageKey: string;
  itemLabelPlural: string;
  onCreateFolder: () => void;
}) {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) === "1";
    } catch {
      return false;
    }
  });

  if (dismissed) return null;

  function dismiss() {
    setDismissed(true);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Ignore storage failures; the banner just reappears next visit.
    }
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
      <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 text-muted-foreground">
        {t("folders.banner.text", { items: itemLabelPlural })}
      </span>
      <Button size="sm" variant="outline" onClick={onCreateFolder}>
        {t("folders.banner.create")}
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label={t("folders.banner.dismiss")} onClick={dismiss}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

export function MobileFolderSheet({
  open,
  onOpenChange,
  result,
  selection,
  allLabel,
  itemLabelPlural,
  onSelect,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: FolderListResult | null | undefined;
  selection: FolderSelection;
  allLabel: string;
  itemLabelPlural: string;
  onSelect: (selection: FolderSelection) => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();

  function select(next: FolderSelection) {
    onSelect(next);
    onOpenChange(false);
  }

  const model = useMemo(() => treeFromResult(result), [result]);

  function renderBranch(node: FolderTreeNode, rootLabel?: string) {
    return (
      <div key={node.folder.id} data-folder-id={node.folder.id}>
        <MobileFolderRow
          id={node.folder.id}
          label={rootLabel ?? node.folder.name}
          count={node.folder.itemCount}
          color={node.folder.color}
          selected={selection === node.folder.id}
          onSelect={select}
        />
        {node.children.length > 0 ? (
          <div className="pl-3">
            {node.children.map((child) => renderBranch(child))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-(--sz-folder-sheet-max) rounded-t-lg pb-4">
        <SheetHeader className="border-b border-border px-4 py-3">
          <SheetTitle>{t("folders.sheetTitle", { items: itemLabelPlural })}</SheetTitle>
        </SheetHeader>
        <div className="overflow-y-auto px-3">
          <MobileFolderRow
            id="all"
            label={allLabel}
            count={result?.allCount ?? 0}
            selected={selection === "all"}
            onSelect={select}
            all
          />
          {result?.kind === "skill" ? (
            <>
              {model.my ? renderBranch(model.my, t("folders.mySkills")) : null}
              <div className="px-2 pb-0.5 pt-2 text-(length:--text-micro) font-medium uppercase tracking-wide text-muted-foreground">
                {t("folders.organization")}
              </div>
              {model.company.map((node) => renderBranch(node))}
              {model.projects ? renderBranch(model.projects, t("folders.projects")) : null}
              {model.bundled ? renderBranch(model.bundled, t("folders.bundled")) : null}
            </>
          ) : (
            model.roots.map((node) => renderBranch(node, reservedRootLabel(node.folder)))
          )}
          <MobileFolderRow
            id="unfiled"
            label={t("folders.unfiled")}
            count={result?.unfiledCount ?? 0}
            selected={selection === "unfiled"}
            onSelect={select}
          />
        </div>
        <div className="border-t border-border px-4 pt-3">
          <Button size="sm" variant="outline" className="w-full" onClick={onCreate}>
            <Plus className="mr-2 h-3.5 w-3.5" />
            {t("folders.newFolder")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function MobileFolderRow({
  id,
  label,
  count,
  color,
  selected,
  all = false,
  onSelect,
}: {
  id: FolderSelection;
  label: string;
  count: number;
  color?: string | null;
  selected: boolean;
  all?: boolean;
  onSelect: (selection: FolderSelection) => void;
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-accent/50"
      onClick={() => onSelect(id)}
    >
      {all ? <FolderIcon className="h-3.5 w-3.5 text-muted-foreground" /> : <FolderSwatch color={color} />}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
      {selected ? <Check className="h-3.5 w-3.5" /> : null}
    </button>
  );
}

export function MoveToMenu({
  folders,
  currentFolderId,
  onMove,
  onCreateAndMove,
}: {
  folders: FolderListItem[];
  currentFolderId: string | null | undefined;
  onMove: (folderId: string | null) => void;
  onCreateAndMove: () => void;
}) {
  const { t } = useTranslation();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>{t("folders.moveTo")}</DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        <MoveToMenuItems
          folders={folders}
          currentFolderId={currentFolderId}
          onMove={onMove}
          onCreateAndMove={onCreateAndMove}
        />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function MoveToMenuItems({
  folders,
  currentFolderId,
  onMove,
  onCreateAndMove,
}: {
  folders: FolderListItem[];
  currentFolderId: string | null | undefined;
  onMove: (folderId: string | null) => void;
  onCreateAndMove: () => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const visibleFolders = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    const ordered = foldersInTreeOrder(folders);
    if (!lowered) return ordered;
    return ordered.filter((folder) => folder.name.toLowerCase().includes(lowered));
  }, [folders, query]);

  return (
    <>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
            placeholder={t("folders.search")}
            className="h-7 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => onMove(null)}>
          <FolderSwatch color={null} />
          {t("folders.unfiled")}
          {currentFolderId == null ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
        </DropdownMenuItem>
        {visibleFolders.map((folder) => (
          <DropdownMenuItem key={folder.id} className={query.trim() ? undefined : folderIndentClass(folder.depth)} onSelect={() => onMove(folder.id)}>
            <FolderSwatch color={folder.color} />
            <span className="min-w-0 flex-1 truncate">{folder.name}</span>
            {currentFolderId === folder.id ? <Check className="ml-auto h-3.5 w-3.5" /> : null}
          </DropdownMenuItem>
        ))}
        {visibleFolders.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">{t("folders.noMatch")}</div>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCreateAndMove}>
          <Plus className="h-3.5 w-3.5" />
          {t("folders.newFolderEllipsis")}
        </DropdownMenuItem>
    </>
  );
}

export function FolderFormDialog({
  open,
  kind,
  folder,
  onOpenChange,
  onSubmit,
  pending = false,
  parentOptions,
  initialParentId = null,
}: {
  open: boolean;
  kind: FolderKind;
  folder: FolderListItem | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: { name: string; color: string | null; parentId?: string | null }) => void;
  pending?: boolean;
  /** When set, the dialog offers "Inside" so folders can be nested. */
  parentOptions?: FolderListItem[];
  initialParentId?: string | null;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string | null>(FOLDER_COLORS[0] ?? null);
  const [parentId, setParentId] = useState<string | null>(null);
  const isEdit = Boolean(folder);
  // A folder cannot go inside itself or below the deepest level.
  const parentChoices = useMemo(() => {
    if (!parentOptions) return null;
    const excluded = folder ? folderSubtreeIds(parentOptions, folder.id) : new Set<string>();
    return foldersInTreeOrder(parentOptions).filter((option) =>
      !excluded.has(option.id) && (option.depth ?? 1) < MAX_FOLDER_DEPTH);
  }, [folder, parentOptions]);

  useEffect(() => {
    if (!open) return;
    setName(folder?.name ?? "");
    setColor(folder?.color ?? FOLDER_COLORS[0] ?? null);
    setParentId(folder ? folder.parentId ?? null : initialParentId);
  }, [folder, initialParentId, open]);

  const payload = () => ({ name: name.trim(), color, ...(parentChoices ? { parentId } : {}) });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? t("folders.form.editTitle") : t("folders.form.createTitle")}</DialogTitle>
          <DialogDescription>
            {kind === "routine"
              ? t("folders.form.descriptionRoutine")
              : kind === "project"
                ? t("folders.form.descriptionProject")
                : t("folders.form.descriptionSkill")}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium" htmlFor="folder-name">{t("folders.form.name")}</label>
            <Input
              id="folder-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
              onKeyDown={(event) => {
                if (event.key === "Enter" && name.trim()) onSubmit(payload());
              }}
            />
          </div>
          {parentChoices ? (
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="folder-parent">{t("folders.form.parent")}</label>
              <NativeSelect
                id="folder-parent"
                value={parentId ?? ""}
                onChange={(event) => setParentId(event.target.value || null)}
              >
                <option value="">{t("folders.form.topLevel")}</option>
                {parentChoices.map((option) => (
                  <option key={option.id} value={option.id}>
                    {"\u2003".repeat(Math.max((option.depth ?? 1) - 1, 0)) + option.name}
                  </option>
                ))}
              </NativeSelect>
              <p className="text-xs text-muted-foreground">{t("folders.form.parentHint")}</p>
            </div>
          ) : null}
          <div className="space-y-2">
            <div className="text-sm font-medium">{t("folders.form.color")}</div>
            <div className="flex flex-wrap gap-2">
              {FOLDER_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={t("folders.form.useColor", { color: swatch })}
                  className={cn(
                    "h-7 w-7 rounded-md border border-border",
                    color === swatch && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                  )}
                  style={{ backgroundColor: FOLDER_COLOR_VALUES[swatch] }}
                  onClick={() => setColor(swatch)}
                />
              ))}
              <button
                type="button"
                className={cn(
                  "h-7 rounded-md border border-border px-2 text-xs text-muted-foreground",
                  color == null && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                )}
                onClick={() => setColor(null)}
              >
                {t("folders.form.none")}
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            {t("folders.form.cancel")}
          </Button>
          <Button onClick={() => onSubmit(payload())} disabled={pending || !name.trim()}>
            {pending ? t("folders.form.saving") : isEdit ? t("folders.form.save") : t("folders.form.create")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteFolderDialog({
  open,
  folder,
  itemLabelPlural,
  onOpenChange,
  onConfirm,
  pending = false,
}: {
  open: boolean;
  folder: FolderListItem | null;
  itemLabelPlural: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  pending?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("folders.deleteDialog.title")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("folders.deleteDialog.body", { count: folder?.itemCount ?? 0, items: itemLabelPlural })}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{t("folders.deleteDialog.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={pending || !folder}
            onClick={(event) => {
              event.preventDefault();
              onConfirm();
            }}
          >
            {pending ? t("folders.deleteDialog.deleting") : t("folders.deleteDialog.confirm")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function BulkBar({
  selectedCount,
  folders,
  onMove,
  onCreateAndMove,
  onClear,
  onDone,
}: {
  selectedCount: number;
  folders: FolderListItem[];
  onMove: (folderId: string | null) => void;
  onCreateAndMove: () => void;
  onClear: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  if (selectedCount === 0) return null;
  return (
    <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-md border border-border bg-background/95 px-3 py-2 shadow-sm backdrop-blur">
      <span className="mr-auto text-sm text-muted-foreground">{t("folders.bulk.selected", { count: selectedCount })}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline">{t("folders.moveTo")}</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <MoveToMenuItems
            folders={folders}
            currentFolderId={undefined}
            onMove={onMove}
            onCreateAndMove={onCreateAndMove}
          />
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" variant="ghost" onClick={onClear}>{t("folders.bulk.deselect")}</Button>
      <Button size="sm" onClick={onDone}>{t("folders.bulk.done")}</Button>
    </div>
  );
}
