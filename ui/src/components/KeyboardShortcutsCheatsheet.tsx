import { useTranslation } from "@/i18n";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ShortcutEntry {
  keys: string[];
  label: string;
  /** Render keys as a simultaneous chord (joined with "+") rather than a
   *  "then" sequence. */
  combo?: boolean;
}

interface ShortcutSection {
  title: string;
  shortcuts: ShortcutEntry[];
}

const sections: ShortcutSection[] = [
  {
    title: "ui2g2.keyboardShortcuts.sectionInbox",
    shortcuts: [
      { keys: ["j"], label: "ui2g2.keyboardShortcuts.moveDown" },
      { keys: ["↓"], label: "ui2g2.keyboardShortcuts.moveDown" },
      { keys: ["k"], label: "ui2g2.keyboardShortcuts.moveUp" },
      { keys: ["↑"], label: "ui2g2.keyboardShortcuts.moveUp" },
      { keys: ["←"], label: "ui2g2.keyboardShortcuts.collapseGroup" },
      { keys: ["→"], label: "ui2g2.keyboardShortcuts.expandGroup" },
      { keys: ["Enter"], label: "ui2g2.keyboardShortcuts.openItem" },
      { keys: ["a"], label: "ui2g2.keyboardShortcuts.archiveItem" },
      { keys: ["y"], label: "ui2g2.keyboardShortcuts.archiveItem" },
      { keys: ["r"], label: "ui2g2.keyboardShortcuts.markRead" },
      { keys: ["U"], label: "ui2g2.keyboardShortcuts.markUnread" },
    ],
  },
  {
    title: "ui2g2.keyboardShortcuts.sectionTask",
    shortcuts: [
      { keys: ["y"], label: "ui2g2.keyboardShortcuts.quickArchive" },
      { keys: ["g", "i"], label: "ui2g2.keyboardShortcuts.goInbox" },
      { keys: ["g", "c"], label: "ui2g2.keyboardShortcuts.focusComposer" },
    ],
  },
  {
    title: "ui2g2.keyboardShortcuts.sectionDecisions",
    shortcuts: [
      { keys: ["j"], label: "ui2g2.keyboardShortcuts.moveDown" },
      { keys: ["↓"], label: "ui2g2.keyboardShortcuts.moveDown" },
      { keys: ["k"], label: "ui2g2.keyboardShortcuts.moveUp" },
      { keys: ["↑"], label: "ui2g2.keyboardShortcuts.moveUp" },
      { keys: ["Enter"], label: "ui2g2.keyboardShortcuts.openCloseDecision" },
      { keys: ["x"], label: "ui2g2.keyboardShortcuts.dismissDecision" },
    ],
  },
  {
    title: "ui2g2.keyboardShortcuts.sectionGlobal",
    shortcuts: [
      { keys: ["/"], label: "ui2g2.keyboardShortcuts.searchPage" },
      { keys: ["c"], label: "ui2g2.keyboardShortcuts.newTask" },
      { keys: ["["], label: "ui2g2.keyboardShortcuts.toggleSidebar" },
      { keys: ["]"], label: "ui2g2.keyboardShortcuts.togglePanel" },
      { keys: ["?"], label: "ui2g2.keyboardShortcuts.showShortcuts" },
    ],
  },
];

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-xs font-medium text-foreground shadow-(--shadow-extract-10)">
      {children}
    </kbd>
  );
}

export function KeyboardShortcutsCheatsheetContent() {
  const { t } = useTranslation();
  return (
    <>
      <div className="divide-y divide-border border-t border-border">
        {sections.map((section) => (
          <div key={section.title} className="px-5 py-3">
            <h3 className="mb-2 text-(length:--text-micro) font-semibold uppercase tracking-wider text-muted-foreground">
              {t(section.title)}
            </h3>
            <div className="space-y-1.5">
              {section.shortcuts.map((shortcut) => (
                <div
                  key={shortcut.label + shortcut.keys.join()}
                  className="flex items-center justify-between gap-4"
                >
                  <span className="text-sm text-foreground/90">{t(shortcut.label)}</span>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, i) => (
                      <span key={key} className="flex items-center gap-1">
                        {i > 0 && (
                          <span className="text-xs text-muted-foreground">
                            {shortcut.combo ? "+" : t("ui2g2.keyboardShortcuts.then")}
                          </span>
                        )}
                        <KeyCap>{key}</KeyCap>
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">
          {t("ui2g2.keyboardShortcuts.pressPrefix")} <KeyCap>Esc</KeyCap> {t("ui2g2.keyboardShortcuts.closeHint")}
        </p>
      </div>
    </>
  );
}

export function KeyboardShortcutsCheatsheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden" showCloseButton={false}>
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-base">{t("ui2g2.keyboardShortcuts.title")}</DialogTitle>
        </DialogHeader>
        <KeyboardShortcutsCheatsheetContent />
      </DialogContent>
    </Dialog>
  );
}
