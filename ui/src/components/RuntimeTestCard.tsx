import { useTranslation } from "@/i18n";
import {
  CircleCheck,
  CircleAlert,
  Loader2,
  Play,
  ChevronRight,
} from "lucide-react";
import type { AdapterEnvironmentTestResult } from "@paperclipai/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
export type TestState = "idle" | "running" | "pass" | "fail";

const copy = {
  idle: { title: "ui2g2.runtimeTest.idle.title", description: "ui2g2.runtimeTest.idle.description", action: "ui2g2.runtimeTest.action.run" },
  running: { title: "ui2g2.runtimeTest.running.title", description: "ui2g2.runtimeTest.running.description", action: "ui2g2.runtimeTest.action.testing" },
  pass: { title: "ui2g2.runtimeTest.pass.title", description: "ui2g2.runtimeTest.pass.description", action: "ui2g2.runtimeTest.action.testAgain" },
  warn: { title: "ui2g2.runtimeTest.warn.title", description: "ui2g2.runtimeTest.warn.description", action: "ui2g2.runtimeTest.action.testAgain" },
  fail: { title: "ui2g2.runtimeTest.fail.title", description: "ui2g2.runtimeTest.fail.description", action: "ui2g2.runtimeTest.action.retryTest" },
} as const;

const prerequisiteCopy = {
  idle: { title: "ui2g2.runtimePrereq.idle.title", description: "ui2g2.runtimePrereq.idle.description", action: "ui2g2.runtimePrereq.action.check" },
  running: { title: "ui2g2.runtimePrereq.running.title", description: "ui2g2.runtimePrereq.running.description", action: "ui2g2.runtimePrereq.action.checking" },
  pass: { title: "ui2g2.runtimePrereq.pass.title", description: "ui2g2.runtimePrereq.pass.description", action: "ui2g2.runtimePrereq.action.checkAgain" },
  warn: { title: "ui2g2.runtimePrereq.warn.title", description: "ui2g2.runtimePrereq.warn.description", action: "ui2g2.runtimePrereq.action.checkAgain" },
  fail: { title: "ui2g2.runtimePrereq.fail.title", description: "ui2g2.runtimePrereq.fail.description", action: "ui2g2.runtimePrereq.action.retryCheck" },
} as const;

export function RuntimeTestCard({
  state,
  result,
  error,
  onTest,
  disabled = false,
  variant = "connection",
}: {
  state: TestState | "warn";
  result: AdapterEnvironmentTestResult | null;
  error?: string | null;
  onTest: () => void;
  disabled?: boolean;
  variant?: "connection" | "prerequisites";
}) {
  const { t } = useTranslation();
  const missingRuntime = state === "fail"
    ? result?.checks.find(check => check.code === "acpx_runtime_package_missing")
    : undefined;
  const base = (variant === "prerequisites" ? prerequisiteCopy : copy)[state];
  const content = missingRuntime
    ? { title: t("ui2g2.runtimeTest.runtimeMissing"), description: missingRuntime.message, action: t(copy.fail.action) }
    : { title: t(base.title), description: t(base.description), action: t(base.action) };
  const Icon =
    state === "running"
      ? Loader2
      : state === "pass"
        ? CircleCheck
        : state === "fail" || state === "warn"
          ? CircleAlert
          : Play;
  return (
    <section
      aria-label={t("ui2g2.runtimeTest.aria")}
      className="rounded-lg border border-border bg-card"
    >
      <div className="flex items-start gap-3 p-4 sm:items-center">
        <span
          aria-hidden="true"
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full bg-muted",
            state === "pass"
              ? "text-green-600 dark:text-green-400"
              : state === "fail"
                ? "text-destructive"
                : "text-muted-foreground",
          )}
        >
          <Icon
            className={cn(
              "size-4",
              state === "running" && "animate-spin motion-reduce:animate-none",
            )}
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role={state === "fail" ? "alert" : "status"}
            aria-atomic="true"
            className="min-w-0 space-y-1"
          >
            <h3 className="text-sm font-medium">{content.title}</h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {state === "fail" && error ? error : content.description}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0 self-start sm:self-center"
            disabled={disabled || state === "running"}
            onClick={onTest}
          >
            {content.action}
          </Button>
        </div>
      </div>
      {result && result.checks.length > 0 && (
        <details
          key={`${state}:${result.testedAt}`}
          className="group border-t border-border"
        >
          <summary className="flex cursor-pointer list-none items-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
            <ChevronRight
              aria-hidden="true"
              className="size-3 transition-transform group-open:rotate-90"
            />
            {t("ui2g2.runtimeTest.details")}
          </summary>
          <ul className="space-y-3 px-4 pb-4">
            {result.checks.map((check) => (
              <li
                key={check.code}
                className="flex gap-2 text-xs leading-relaxed"
              >
                {check.level === "error" || check.level === "warn" ? (
                  <CircleAlert
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-destructive"
                  />
                ) : (
                  <CircleCheck
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                  />
                )}
                <div className="min-w-0 space-y-1">
                  <p className="break-words text-foreground">{check.message}</p>
                  {check.detail && (
                    <p className="break-all text-muted-foreground">
                      {check.detail}
                    </p>
                  )}
                  {check.hint && (
                    <p className="text-muted-foreground">{check.hint}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
