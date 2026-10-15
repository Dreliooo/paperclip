import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

/** Shared by the saved connection and its interactive review stories. */
export function RemoteMcpManagement({ providerName, connected = true, canReconnect = true, canDisconnect = true, busy = false, onReconnect, onManage, onDisconnect }: {
  providerName: string;
  connected?: boolean;
  canReconnect?: boolean;
  canDisconnect?: boolean;
  busy?: boolean;
  onReconnect: () => void;
  onManage: () => void;
  onDisconnect: () => void | Promise<unknown>;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  return <section className="space-y-4">
    <h2 className="text-sm font-semibold">{t("ui3g2.connections.management.settings")}</h2>
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" disabled={!canReconnect || busy} onClick={onReconnect}>{t("ui3g2.connections.management.reconnect")}</Button>
      <Button variant="outline" onClick={onManage}>{t("ui3g2.connections.management.manageIn", { provider: providerName })}</Button>
      {connected && canDisconnect && <AlertDialog open={confirming} onOpenChange={(open) => { if (!busy) setConfirming(open); }}>
        <AlertDialogTrigger asChild><Button variant="ghost" className="text-destructive">{t("ui3g2.connections.management.disconnect")}</Button></AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("ui3g2.connections.management.disconnectTitle", { provider: providerName })}</AlertDialogTitle>
            <AlertDialogDescription>{t("ui3g2.connections.management.disconnectBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>{t("ui3g2.connections.management.cancel")}</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={async (event) => {
              event.preventDefault();
              try { await onDisconnect(); setConfirming(false); } catch { /* The controller displays the failure. */ }
            }}>{busy ? t("ui3g2.connections.management.disconnecting") : t("ui3g2.connections.management.disconnectAction")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>}
    </div>
  </section>;
}
