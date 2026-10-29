import { useEffect, useRef, useState } from "react";
import { t as translate, useTranslation } from "@/i18n";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalLink,
  GitPullRequest,
  MoreHorizontal,
  RefreshCw,
  Search,
} from "lucide-react";
import type {
  GitHubChatConfiguration,
  GitHubTaskReview,
} from "@paperclipai/shared";
import {
  githubChatApi,
  type GitHubConfigurationRecord,
} from "@/api/githubChat";
import {
  chatEndpointsApi,
  type ChatEndpoint,
} from "@/api/chatEndpoints";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/EmptyState";
import { MarkdownBody } from "@/components/MarkdownBody";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Link } from "@/lib/router";
import { formatDateTime } from "@/lib/utils";
import {
  GitHubAccessEditor,
  GitHubPolicyEditor,
  GitHubToggle,
} from "./GitHubBotConfiguration";
import { ChatExecutionDefaults } from "./ChatExecutionDefaults";

export function GitHubRepositoryAccess({
  endpointId,
  companyId,
  managementUrl,
  pending,
  onRefresh,
  onChange,
  onToggleAll,
}: {
  endpointId: string;
  companyId: string;
  managementUrl: string;
  pending: boolean;
  onRefresh: () => void;
  onChange: (id: string, enabled: boolean) => void;
  onToggleAll: (enabled: boolean) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const more = useRef<HTMLDivElement>(null);
  const list = useInfiniteQuery({
    queryKey: ["github-bot-repository-pages", endpointId, search],
    queryFn: ({ pageParam }) => githubChatApi.repositories(endpointId, { limit: 20, offset: pageParam, search }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.nextOffset ?? undefined,
  });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];
  const summary = list.data?.pages[0];
  const disableAll = (summary?.enabledCount ?? 0) > 0;
  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 0;
  }, [search]);
  useEffect(() => {
    if (!list.hasNextPage || list.isFetching || list.isError || pending || !more.current || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) void list.fetchNextPage({ cancelRefetch: false });
    }, { root: scroller.current });
    observer.observe(more.current);
    return () => observer.disconnect();
  }, [list.hasNextPage, list.isFetching, list.isError, list.fetchNextPage, pending]);
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t("ui3g7.gitHubRepositoryAccess.title")}</h2>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t("ui3g7.gitHubRepositoryAccess.manageLabel")}
            >
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={managementUrl} target="_blank" rel="noreferrer">
                {t("ui3g7.gitHubRepositoryAccess.manageOnGitHub")}
                <ExternalLink className="size-4" />
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pending} onClick={onRefresh}>
              <RefreshCw className="size-4" />
              {t("ui3g7.gitHubRepositoryAccess.refresh")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="text-xs text-muted-foreground">
        {t("ui3g7.gitHubRepositoryAccess.intro")}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-48">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input aria-label={t("ui3g7.gitHubRepositoryAccess.search")} placeholder={t("ui3g7.gitHubRepositoryAccess.search")} className="pl-9"
            value={search} maxLength={200} onChange={(event) => setSearch(event.target.value)} />
        </div>
        <Button variant="outline" size="sm" disabled={pending || list.isFetching || !summary || !summary.totalCount || (!disableAll && !summary.availableCount)}
          aria-label={disableAll ? t("ui3g7.gitHubRepositoryAccess.disableAllLabel") : t("ui3g7.gitHubRepositoryAccess.enableAllLabel")}
          onClick={() => onToggleAll(!disableAll)}>
          {disableAll ? t("ui3g7.gitHubRepositoryAccess.disableAll") : t("ui3g7.gitHubRepositoryAccess.enableAll")}
        </Button>
      </div>
      {summary && <p className="text-xs text-muted-foreground">
        {t("ui3g7.gitHubRepositoryAccess.summary", { enabled: summary.enabledCount, total: summary.totalCount })}
      </p>}
      {list.isError && <p role="alert" className="text-sm text-destructive">
        {t("ui3g7.gitHubRepositoryAccess.loadError")} <Button variant="link" size="sm" onClick={() => void list.refetch()}>{t("ui3g7.gitHubBotManagement.tryAgain")}</Button>
      </p>}
      <div ref={scroller} role="region" aria-label={t("ui3g7.gitHubRepositoryAccess.regionLabel")} tabIndex={0}
        className="max-h-96 overflow-y-auto overscroll-contain border-y border-border">
        <div className="divide-y divide-border">
        {rows.map((resource) => (
          <div key={resource.id} className="px-1 py-1">
            <GitHubToggle
              label={resource.label ?? resource.providerResourceId}
              checked={resource.enabled}
              disabled={
                pending ||
                (resource.availability !== "available" && !resource.enabled)
              }
              description={
                resource.availability === "available"
                  ? undefined
                  : t("ui3g7.gitHubRepositoryAccess.unavailable")
              }
              onChange={(enabled) => onChange(resource.id, enabled)}
            />
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{t("ui3g7.gitHubRepositoryAccess.taskDefaults")}</summary>
              <div className="pt-3">
                <ChatExecutionDefaults
                  companyId={companyId}
                  value={resource.executionDefaults}
                  resource
                  onSave={async (executionDefaults) => {
                    await chatEndpointsApi.updateResources(endpointId, [{ id: resource.id, executionDefaults }]);
                    await client.invalidateQueries({ queryKey: ["github-bot-repositories", endpointId] });
                    await client.invalidateQueries({ queryKey: ["github-bot-repository-pages", endpointId] });
                  }}
                />
              </div>
            </details>
          </div>
        ))}
        </div>
        {list.isPending ? <p role="status" className="py-4 text-sm text-muted-foreground">{t("ui3g7.gitHubRepositoryAccess.loading")}</p> : rows.length === 0 && !list.isError && (
          <p className="py-4 text-sm text-muted-foreground">
            {search ? t("ui3g7.gitHubRepositoryAccess.noMatch") : t("ui3g7.gitHubRepositoryAccess.noneAvailable")}
          </p>
        )}
        {list.hasNextPage && <div ref={more} className="flex justify-center py-2">
          <Button variant="ghost" size="sm" disabled={pending || list.isFetching}
            onClick={() => void list.fetchNextPage({ cancelRefetch: false })}>
            {list.isFetchingNextPage ? t("ui3g7.gitHubRepositoryAccess.loading") : t("ui3g7.gitHubRepositoryAccess.loadMore")}
          </Button>
        </div>}
      </div>
    </section>
  );
}

export function GitHubBotManagement({
  endpoint,
  view,
}: {
  endpoint: ChatEndpoint;
  view: "settings" | "access";
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["github-bot-configuration", endpoint.id],
    queryFn: () => githubChatApi.configuration(endpoint.id),
  });
  const [draft, setDraft] = useState<GitHubConfigurationRecord | null>(null);
  const [editorVersion, setEditorVersion] = useState(0);
  const [scoreText, setScoreText] = useState<string | null>(null);
  const [automaticMode, setAutomaticMode] = useState<"linked_authors" | "allowed_authors" | null>(null);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const record = draft ?? query.data;
  const currentScoreText = scoreText ?? String(record?.configuration.defaults.ratingThreshold ?? 5);
  const score = Number(currentScoreText);
  const scoreValid = record?.configuration.defaults.ratingThreshold === null ||
    (currentScoreText.trim() !== "" && Number.isInteger(score) && score >= 1 && score <= 5);
  const dirty = Boolean(
    draft &&
      JSON.stringify(draft.configuration) !==
        JSON.stringify(query.data?.configuration),
  );
  const edit = (configuration: GitHubChatConfiguration) => {
    if (record) {
      if (configuration.defaults.invocation !== "mentions_only")
        setAutomaticMode(configuration.defaults.invocation);
      else if (record.configuration.defaults.invocation !== "mentions_only")
        setAutomaticMode(record.configuration.defaults.invocation);
      setDraft({ ...record, configuration });
    }
    setNotice("");
  };
  const act = async (fn: () => Promise<unknown>) => {
    setPending(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("ui3g7.gitHubBotManagement.saveError"));
    } finally {
      setPending(false);
    }
  };
  if (query.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("ui3g7.gitHubBotManagement.loadError")}{" "}
        <Button
          variant="link"
          onClick={() => {
            void query.refetch();
          }}
        >
          {t("ui3g7.gitHubBotManagement.tryAgain")}
        </Button>
      </p>
    );
  if (!record)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("ui3g7.gitHubBotManagement.loadingConfig")}
      </p>
    );
  const config = record.configuration;
  return (
    <section className="max-w-3xl space-y-8">
      <fieldset disabled={pending} className="min-w-0 space-y-8">
        {view === "access" ? (
          <>
            <GitHubRepositoryAccess
              endpointId={endpoint.id}
              companyId={endpoint.companyId}
              pending={pending}
              managementUrl={
                endpoint.setup?.github?.managementUrl ??
                endpoint.setup?.github?.installationUrl ??
                "https://github.com/settings/installations"
              }
              onRefresh={() =>
                void act(async () => {
                  await githubChatApi.refreshRepositories(endpoint.id);
                  await client.invalidateQueries({ queryKey: ["github-bot-repositories", endpoint.id] });
                  await client.invalidateQueries({ queryKey: ["github-bot-repository-pages", endpoint.id] });
                  setNotice(
                    t("ui3g7.gitHubBotManagement.refreshed"),
                  );
                })
              }
              onChange={(id, enabled) =>
                void act(async () => {
                  await chatEndpointsApi.updateResources(endpoint.id, [
                    { id, enabled },
                  ]);
                  await client.invalidateQueries({ queryKey: ["github-bot-repositories", endpoint.id] });
                  await client.invalidateQueries({ queryKey: ["github-bot-repository-pages", endpoint.id] });
                })
              }
              onToggleAll={(enabled) => void act(async () => {
                await githubChatApi.toggleAllRepositories(endpoint.id, enabled);
                await client.invalidateQueries({ queryKey: ["github-bot-repositories", endpoint.id] });
                await client.invalidateQueries({ queryKey: ["github-bot-repository-pages", endpoint.id] });
              })}
            />
            <GitHubAccessEditor
              endpointId={endpoint.id}
              companyId={endpoint.companyId}
              configuration={config}
              onChange={edit}
            />
            {!config.toolsEnabled && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  {t("ui3g7.gitHubBotManagement.toolsDisabled")}
                </p>
                <Button
                  variant="outline"
                  onClick={() => edit({ ...config, toolsEnabled: true })}
                >
                  {t("ui3g7.gitHubBotManagement.enableTools")}
                </Button>
              </div>
            )}
            {endpoint.connectionId && (
              <Link
                className="text-xs text-muted-foreground underline underline-offset-4"
                to={`/apps/${endpoint.connectionId}`}
              >
                {t("ui3g7.gitHubBotManagement.manageToolPermissions")}
              </Link>
            )}
          </>
        ) : (
          <>
            <GitHubPolicyEditor key={editorVersion}
              readOnly={pending}
              scoreText={currentScoreText}
              onScoreTextChange={setScoreText}
              rememberedAutomaticMode={automaticMode ?? (config.defaults.invocation === "mentions_only" ? "linked_authors" : config.defaults.invocation)}
              accessHref={`/apps/chat/${endpoint.id}/access`}
              policy={config.defaults}
              onChange={(defaults) => edit({ ...config, defaults })}
            />
          </>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {(dirty || !scoreValid) && (
        <div className="sticky bottom-(--tc-composer-bottom) z-10 flex items-center justify-between gap-3 border-t border-border bg-background py-4 md:bottom-0">
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setDraft(null);
              setScoreText(null);
              setAutomaticMode(null);
              setEditorVersion((value) => value + 1);
              setError("");
            }}
          >
            {t("ui3g7.gitHubBotManagement.discard")}
          </Button>
          <Button
            disabled={pending || !scoreValid}
            onClick={() =>
              void act(async () => {
                const saved = await githubChatApi.save(
                  endpoint.id,
                  record.revision,
                  config,
                );
                client.setQueryData(
                  ["github-bot-configuration", endpoint.id],
                  saved,
                );
                setDraft(null);
                setScoreText(null);
                setAutomaticMode(null);
                setNotice(translate("ui3g7.gitHubBotManagement.saved"));
              })
            }
          >
            {pending ? t("ui3g7.gitHubBotManagement.saving") : t("ui3g7.gitHubBotManagement.save")}
          </Button>
        </div>
      )}
    </section>
  );
}

export function orderedGitHubReviews(reviews: GitHubTaskReview[]) {
  return [...reviews].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

export function gitHubReviewResultLabel(review: GitHubTaskReview) {
  const completed = review.state === "completed" && review.assessment?.complete;
  const conclusion = review.conclusion
    ? translate({
        success: "ui3g7.gitHubBotManagement.passed",
        failure: "ui3g7.gitHubBotManagement.belowThreshold",
        neutral: "ui3g7.gitHubBotManagement.reportOnly",
        action_required: "ui3g7.gitHubBotManagement.actionRequired",
      }[review.conclusion])
    : translate("ui3g7.gitHubBotManagement.awaitingCheck");
  const state = translate({
    queued: "ui3g7.gitHubBotManagement.queued",
    running: "ui3g7.gitHubBotManagement.reviewing",
    completed: "ui3g7.gitHubBotManagement.incomplete",
    incomplete: "ui3g7.gitHubBotManagement.incomplete",
    error: "ui3g7.gitHubBotManagement.reviewFailed",
    superseded: "ui3g7.gitHubBotManagement.superseded",
    manual_required: "ui3g7.gitHubBotManagement.actionRequired",
  }[review.state]);
  return completed ? translate("ui3g7.gitHubBotManagement.scored", { score: review.assessment!.score, conclusion }) : state;
}

function ReviewResult({ review }: { review: GitHubTaskReview }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="text-sm font-medium">
          {gitHubReviewResultLabel(review)}
        </span>
        <span className="text-xs text-muted-foreground">
          {t("ui3g7.gitHubBotManagement.commit")} <code>{review.headSha.slice(0, 7)}</code> ·{" "}
          {formatDateTime(review.updatedAt)}
        </span>
      </div>
      {review.assessment ? (
        <MarkdownBody className="text-sm">
          {review.assessment.summary}
        </MarkdownBody>
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("ui3g7.gitHubBotManagement.noAssessment")}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <Link
          className="underline underline-offset-4"
          to={`/issues/${review.issueId}`}
        >
          {t("ui3g7.gitHubBotManagement.paperclipTask")}
        </Link>
        {review.summaryUrl && (
          <a
            className="underline underline-offset-4"
            href={review.summaryUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t("ui3g7.gitHubBotManagement.githubComment")}
          </a>
        )}
        {review.checkUrl && (
          <a
            className="underline underline-offset-4"
            href={review.checkUrl}
            target="_blank"
            rel="noreferrer"
          >
            {t("ui3g7.gitHubBotManagement.check")}
          </a>
        )}
      </div>
      <section className="space-y-4 text-sm" aria-label={t("ui3g7.gitHubBotManagement.evidence")}>
        <div className="space-y-3">
          {review.runId && (
            <Link
              className="text-xs underline underline-offset-4"
              to={`/issues/${review.issueId}?runId=${review.runId}`}
            >
              {t("ui3g7.gitHubBotManagement.agentRun")}
            </Link>
          )}
          {review.assessment && (
            <>
              <h3 className="font-medium">{t("ui3g7.gitHubBotManagement.rationale")}</h3>
              <MarkdownBody>{review.assessment.rationale}</MarkdownBody>
              {review.assessment.findings.length > 0 && (
                <section className="space-y-3">
                  <h3 className="font-medium">{t("ui3g7.gitHubBotManagement.findings")}</h3>
                  {review.assessment.findings.map((finding) => (
                    <div
                      key={finding.key}
                      className="space-y-2 border-l border-border pl-4"
                    >
                      <p className="break-all font-mono text-xs">
                        {finding.path}:{finding.line} · {finding.severity}
                      </p>
                      <MarkdownBody>{finding.body}</MarkdownBody>
                    </div>
                  ))}
                </section>
              )}
              <h3 className="font-medium">{t("ui3g7.gitHubBotManagement.coverage")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("ui3g7.gitHubBotManagement.coverageCounts", { reviewed: review.assessment.coverage.reviewedPaths.length, omitted: review.assessment.coverage.omittedPaths.length })}
              </p>
              {review.assessment.coverage.limitations.map((limit, index) => (
                <p key={index} className="text-xs text-muted-foreground">
                  {limit}
                </p>
              ))}
            </>
          )}
        </div>
      </section>
    </div>
  );
}

export function GitHubReviewList({
  endpointId,
  reviews,
}: {
  endpointId: string;
  reviews: GitHubTaskReview[];
}) {
  const { t } = useTranslation();
  if (!reviews.length)
    return (
      <EmptyState
        icon={GitPullRequest}
        message={t("ui3g7.gitHubBotManagement.noReviews")}
        description={t("ui3g7.gitHubBotManagement.noReviewsHelp")}
      />
    );
  return (
    <ul
      aria-label={t("ui3g7.gitHubBotManagement.reviewsList")}
      className="divide-y divide-border border-y border-border"
    >
      {orderedGitHubReviews(reviews).map((review) => (
        <li key={review.id}>
          <Link
            to={`/apps/chat/${endpointId}/reviews/${review.id}`}
            className="flex flex-wrap items-center gap-x-6 gap-y-2 py-4 text-sm hover:bg-accent/50"
          >
            <div className="min-w-0 flex-1 basis-48 space-y-1">
              <p className="break-words font-medium">
                {review.event.title || t("ui3g7.gitHubBotManagement.pullRequestNumber", { number: review.pullNumber })}
              </p>
              <p className="break-all text-xs text-muted-foreground">
                {review.repository} #{review.pullNumber} ·{" "}
                <code>{review.headSha.slice(0, 7)}</code>
              </p>
            </div>
            <div className="space-y-1 text-right">
              <p className="font-medium">{gitHubReviewResultLabel(review)}</p>
              <time
                className="text-xs text-muted-foreground"
                dateTime={review.createdAt}
              >
                {formatDateTime(review.createdAt)}
              </time>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function GitHubReviewDetail({
  endpointId,
  review,
}: {
  endpointId: string;
  review: GitHubTaskReview;
}) {
  const { t } = useTranslation();
  return (
    <article className="max-w-3xl space-y-6">
      <Link
        className="text-sm text-muted-foreground hover:underline"
        to={`/apps/chat/${endpointId}/reviews`}
      >
        ← {t("ui3g7.gitHubBotManagement.allReviews")}
      </Link>
      <header className="space-y-2">
        <h2 className="text-lg font-semibold">
          {review.event.title || t("ui3g7.gitHubBotManagement.pullRequestNumber", { number: review.pullNumber })}
        </h2>
        <a
          className="break-all text-sm text-muted-foreground hover:underline"
          href={`https://github.com/${review.repository}/pull/${review.pullNumber}`}
          target="_blank"
          rel="noreferrer"
        >
          {review.repository} #{review.pullNumber}
        </a>
      </header>
      <ReviewResult review={review} />
    </article>
  );
}

export function GitHubReviews({
  endpointId,
  reviewId,
}: {
  endpointId: string;
  reviewId?: string;
}) {
  const { t } = useTranslation();
  const query = useQuery({
    queryKey: ["github-bot-reviews", endpointId, reviewId ?? "list"],
    queryFn: async () => reviewId ? [await githubChatApi.review(endpointId, reviewId)] : githubChatApi.reviews(endpointId),
    refetchInterval: 5000,
  });
  if (query.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        {reviewId ? t("ui3g7.gitHubBotManagement.reviewLoadError") : t("ui3g7.gitHubBotManagement.reviewsLoadError")}{" "}
        <Button variant="link" onClick={() => void query.refetch()}>
          Try again
        </Button>
      </p>
    );
  if (query.isPending)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t("ui3g7.gitHubBotManagement.loadingReviews")}
      </p>
    );
  if (reviewId) {
    const review = query.data.find((review) => review.id === reviewId);
    return review ? (
      <GitHubReviewDetail endpointId={endpointId} review={review} />
    ) : (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-muted-foreground">
          {t("ui3g7.gitHubBotManagement.reviewNotFound")}
        </p>
        <Link
          to={`/apps/chat/${endpointId}/reviews`}
          className="text-sm underline"
        >
          {t("ui3g7.gitHubBotManagement.allReviews")}
        </Link>
      </div>
    );
  }
  return <GitHubReviewList endpointId={endpointId} reviews={query.data} />;
}
