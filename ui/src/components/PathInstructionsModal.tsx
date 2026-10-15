import { useState } from "react";
import { Apple, Monitor, Terminal } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n";

type Platform = "mac" | "windows" | "linux";

const platforms: { id: Platform; label: string; icon: typeof Apple }[] = [
  { id: "mac", label: "macOS", icon: Apple },
  { id: "windows", label: "Windows", icon: Monitor },
  { id: "linux", label: "Linux", icon: Terminal },
];

// Step and tip values are i18n keys, resolved with t() at render time.
const instructions: Record<Platform, { steps: string[]; tip?: string }> = {
  mac: {
    steps: [
      "ui2g6.pathInstructionsModal.mac.step1",
      "ui2g6.pathInstructionsModal.mac.step2",
      "ui2g6.pathInstructionsModal.mac.step3",
      "ui2g6.pathInstructionsModal.mac.step4",
    ],
    tip: "ui2g6.pathInstructionsModal.mac.tip",
  },
  windows: {
    steps: [
      "ui2g6.pathInstructionsModal.windows.step1",
      "ui2g6.pathInstructionsModal.windows.step2",
      "ui2g6.pathInstructionsModal.windows.step3",
    ],
    tip: "ui2g6.pathInstructionsModal.windows.tip",
  },
  linux: {
    steps: [
      "ui2g6.pathInstructionsModal.linux.step1",
      "ui2g6.pathInstructionsModal.linux.step2",
      "ui2g6.pathInstructionsModal.linux.step3",
    ],
    tip: "ui2g6.pathInstructionsModal.linux.tip",
  },
};

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("win")) return "windows";
  return "linux";
}

interface PathInstructionsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PathInstructionsModal({
  open,
  onOpenChange,
}: PathInstructionsModalProps) {
  const { t } = useTranslation();
  const [platform, setPlatform] = useState<Platform>(detectPlatform);

  const current = instructions[platform];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t("ui2g6.pathInstructionsModal.title")}</DialogTitle>
          <DialogDescription>
            {t("ui2g6.pathInstructionsModal.descriptionBefore")}{" "}
            <code className="text-xs bg-muted px-1 py-0.5 rounded">/Users/you/project</code>
            {t("ui2g6.pathInstructionsModal.descriptionAfter")}
          </DialogDescription>
        </DialogHeader>

        {/* Platform tabs */}
        <div className="flex gap-1 rounded-md border border-border p-0.5">
          {platforms.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
                platform === p.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50",
              )}
              onClick={() => setPlatform(p.id)}
            >
              <p.icon className="h-3.5 w-3.5" />
              {p.label}
            </button>
          ))}
        </div>

        {/* Steps */}
        <ol className="space-y-2 text-sm">
          {current.steps.map((step, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground font-mono text-xs mt-0.5 shrink-0">
                {i + 1}.
              </span>
              <span>{t(step)}</span>
            </li>
          ))}
        </ol>

        {current.tip && (
          <p className="text-xs text-muted-foreground border-l-2 border-border pl-3">
            {t(current.tip)}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Small "Choose" button that opens the PathInstructionsModal.
 * Drop-in replacement for the old showDirectoryPicker buttons.
 */
export function ChoosePathButton({ className }: { className?: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={cn(
          "inline-flex items-center rounded-md border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent/50 transition-colors shrink-0",
          className,
        )}
        onClick={() => setOpen(true)}
      >
        {t("ui2g6.pathInstructionsModal.choose")}
      </button>
      <PathInstructionsModal open={open} onOpenChange={setOpen} />
    </>
  );
}
