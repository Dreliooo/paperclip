import { useTranslation } from "@/i18n";
import { useId, useState } from "react";
import {
  Download,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SlackAvatarProps {
  agentName: string;
  appName: string;
  avatarUrl: string;
}

/** Manual fallback shared by Slack onboarding and its Settings page. */
export function SlackAvatarContent({
  agentName,
  appName,
  avatarUrl,
  compact = false,
}: SlackAvatarProps & { compact?: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  const filename = `${appName.replace(/[^a-zA-Z0-9_-]+/g, "-") || "agent"}-avatar.png`;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(false);
  const download = async () => {
    if (downloading) return;
    setDownloading(true);
    setDownloadError(false);
    try {
      const response = await fetch(avatarUrl);
      if (
        !response.ok ||
        !response.headers.get("content-type")?.startsWith("image/png")
      )
        throw new Error("Avatar unavailable");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1_000);
    } catch {
      setDownloadError(true);
    } finally {
      setDownloading(false);
    }
  };
  return (
    <div className="space-y-8">
      <section
        aria-labelledby={`${id}-download`}
        className="flex flex-col items-start gap-6 sm:flex-row sm:items-center"
      >
        <img
          src={avatarUrl}
          width={512}
          height={512}
          alt={t("ui3g7.slackAvatarStep.alt", { name: agentName })}
          className="size-40 shrink-0 rounded-lg bg-muted object-contain"
        />
        <div className="space-y-3">
          <div className="space-y-1">
            <h2 id={`${id}-download`} className="text-sm font-semibold">
              {compact
                ? t("ui3g7.slackAvatarStep.downloadCompact")
                : t("ui3g7.slackAvatarStep.downloadStep")}
            </h2>
            <p className="text-xs text-muted-foreground">
              {t("ui3g7.slackAvatarStep.specs")}
            </p>
          </div>
          <Button variant="outline" asChild>
            <a
              href={avatarUrl}
              download={filename}
              aria-disabled={downloading}
              onClick={(event) => {
                event.preventDefault();
                void download();
              }}
            >
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {t("ui3g7.slackAvatarStep.download")}
            </a>
          </Button>
          {downloadError && (
            <p role="alert" className="text-sm text-destructive">
              {t("ui3g7.slackAvatarStep.downloadError")}
            </p>
          )}
        </div>
      </section>

      <details open={compact ? undefined : true} className="space-y-4">
        <summary
          className={
            compact
              ? "cursor-pointer text-sm underline underline-offset-4"
              : "hidden"
          }
        >
          {t("ui3g7.slackAvatarStep.howToUpload")}
        </summary>
        <section aria-labelledby={`${id}-upload`} className="space-y-4">
          <div className="space-y-1">
            <h2 id={`${id}-upload`} className="text-sm font-semibold">
              {compact ? t("ui3g7.slackAvatarStep.uploadCompact") : t("ui3g7.slackAvatarStep.uploadStep")}
            </h2>
            <p className="text-sm text-muted-foreground">
              {t("ui3g7.slackAvatarStep.uploadHelp")}
            </p>
          </div>
          <ol className="list-decimal space-y-3 pl-5 text-sm">
            <li>
              <a
                href="https://api.slack.com/apps"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-4"
              >
                {t("ui3g7.slackAvatarStep.openSettings")}{" "}
                <ExternalLink className="inline size-3" />
              </a>{" "}
              {t("ui3g7.slackAvatarStep.andChoose")}<strong>{appName}</strong>.
            </li>
            <li>
              {t("ui3g7.slackAvatarStep.chooseBasic")}<strong>Basic Information</strong>{t("ui3g7.slackAvatarStep.scrollTo")}{" "}
              <strong>Display Information</strong>.
            </li>
            <li>
              {t("ui3g7.slackAvatarStep.under")}<strong>App icon &amp; Preview</strong>{t("ui3g7.slackAvatarStep.clickIcon")}{" "}
              <span className="break-all font-mono text-xs">{filename}</span>.
            </li>
            <li>
              {t("ui3g7.slackAvatarStep.confirmCrop")}<strong>Save Changes</strong>{t("ui3g7.slackAvatarStep.inSlack")}
            </li>
          </ol>
        </section>
      </details>
    </div>
  );
}


export function SlackAvatarSettings(props: SlackAvatarProps) {
  const { t } = useTranslation();
  return (
    <section className="space-y-4" aria-label={t("ui3g7.slackAvatarStep.sectionLabel")}>
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{t("ui3g7.slackAvatarStep.agentAvatar")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("ui3g7.slackAvatarStep.useAvatar", { name: props.agentName })}
        </p>
      </div>
      <SlackAvatarContent {...props} compact />
    </section>
  );
}
