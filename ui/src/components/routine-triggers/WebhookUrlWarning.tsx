import { InlineBanner } from "@/components/InlineBanner";
import { webhookUrlWarningReason } from "@/lib/webhook-url-warning";
import { useTranslation } from "@/i18n";

const warnings = {
  loopback: {
    titleKey: "ui3g2.webhookUrlWarning.loopbackTitle",
    messageKey: "ui3g2.webhookUrlWarning.loopbackMessage",
  },
  private: {
    titleKey: "ui3g2.webhookUrlWarning.privateTitle",
    messageKey: "ui3g2.webhookUrlWarning.privateMessage",
  },
  tailscale: {
    titleKey: "ui3g2.webhookUrlWarning.tailscaleTitle",
    messageKey: "ui3g2.webhookUrlWarning.tailscaleMessage",
  },
  https: {
    titleKey: "ui3g2.webhookUrlWarning.httpsTitle",
    messageKey: "ui3g2.webhookUrlWarning.httpsMessage",
  },
  invalid: {
    titleKey: "ui3g2.webhookUrlWarning.invalidTitle",
    messageKey: "ui3g2.webhookUrlWarning.invalidMessage",
  },
};

export function WebhookUrlWarning({ url }: { url: string }) {
  const { t } = useTranslation();
  const reason = webhookUrlWarningReason(url);
  if (!reason) return null;
  const warning = warnings[reason];
  return <InlineBanner tone="warning" title={t(warning.titleKey)}>
    <div className="space-y-2">
      <p>{t(warning.messageKey)}</p>
      <p>{t("ui3g2.webhookUrlWarning.continueNote")}</p>
      <a className="underline underline-offset-4" href="https://docs.paperclip.ing/reference/deploy/https/" target="_blank" rel="noopener noreferrer">{t("ui3g2.webhookUrlWarning.learnHttps")}</a>
    </div>
  </InlineBanner>;
}
