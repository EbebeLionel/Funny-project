"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Trophy } from "lucide-react";
import {
  fetchMyVotesAction,
  type MyVote,
  type MyVotesPage,
} from "@/app/actions/captions/fetch-my-votes-action";
import { fetchCaptionScoreAction } from "@/app/actions/captions/fetch-fresh-captions-action";
import { toggleCaptionVoteAction } from "@/app/actions/captions";
import { BrandImage } from "@/components/brand-image";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export const formatScore = (score: number) => (score > 0 ? `+${score}` : `${score}`);

export const relativeTime = (iso: string) => {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const steps: [number, Intl.RelativeTimeFormatUnit][] = [
    [60, "second"],
    [60, "minute"],
    [24, "hour"],
    [7, "day"],
    [4.35, "week"],
    [12, "month"],
    [Number.POSITIVE_INFINITY, "year"],
  ];
  let value = Math.max(0, seconds);
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return rtf.format(-Math.round(value), unit);
    value /= size;
  }
  return "";
};

/** A row in the list. `vote` is null after the user removes their vote here. */
type Row = Omit<MyVote, "vote"> & { vote: 1 | -1 | null; pending: boolean };

const toRow = (vote: MyVote): Row => ({ ...vote, pending: false });

function ScoreLine({ row }: { row: Row }) {
  const now = formatScore(row.score);
  if (row.vote === null) {
    return (
      <span>
        Vote removed · Score <span className="font-semibold text-foreground">{now}</span>
      </span>
    );
  }
  if (row.scoreAtVote === null || row.scoreAtVote === row.score) {
    return (
      <span>
        Score <span className="font-semibold text-foreground">{now}</span>
      </span>
    );
  }
  const delta = row.score - row.scoreAtVote;
  return (
    <span
      aria-label={`Score was ${formatScore(row.scoreAtVote)} when you voted, now ${now}`}
      title="Score when you voted → score now"
    >
      Score {formatScore(row.scoreAtVote)} →{" "}
      <span className="font-semibold text-foreground">{now}</span>{" "}
      <span className={cn("font-medium", delta > 0 ? "text-primary" : "text-muted-foreground")}>
        ({delta > 0 ? "▲" : "▼"}
        {Math.abs(delta)})
      </span>
    </span>
  );
}

function VoteButton({
  direction,
  active,
  disabled,
  onClick,
}: {
  direction: 1 | -1;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  const label =
    direction === 1
      ? active
        ? "Remove your funny vote"
        : "Vote funny"
      : active
        ? "Remove your not-funny vote"
        : "Vote not funny";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={cn(
        "flex items-center justify-center w-10 h-10 sm:w-9 sm:h-9 rounded-full transition-colors",
        "disabled:opacity-50",
        active
          ? direction === 1
            ? "bg-primary text-white hover:bg-primary/85"
            : "bg-gray-600 text-white dark:bg-neutral-500 hover:bg-gray-700"
          : "text-muted-foreground hover:bg-primary/10 hover:text-primary"
      )}
    >
      {direction === 1 ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
    </button>
  );
}

function RatingRow({
  row,
  onVote,
}: {
  row: Row;
  onVote: (captionId: string, value: 1 | -1) => void;
}) {
  const href = `/caption/${row.captionId}`;
  return (
    <li
      className={cn(
        "flex items-center gap-3 sm:gap-4 rounded-2xl bg-gray-50 dark:bg-neutral-800 p-3",
        row.vote === null && "opacity-70"
      )}
    >
      <Link
        href={href}
        className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 overflow-hidden rounded-lg
                   bg-gray-200 dark:bg-neutral-900"
        tabIndex={-1}
        aria-hidden="true"
      >
        {row.imageUrl ? (
          <img src={row.imageUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <BrandImage variant="mark" alt="" className="w-full h-full p-4 opacity-40" />
        )}
      </Link>

      <div className="flex-1 min-w-0">
        <Link
          href={href}
          className="block text-sm sm:text-base font-medium leading-snug line-clamp-2
                     hover:underline"
        >
          {row.content}
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">
          <ScoreLine row={row} />
        </p>
        <div
          className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs
                     text-muted-foreground"
        >
          {row.vote !== null && (
            <time dateTime={row.votedAt} title={new Date(row.votedAt).toLocaleString()}>
              Voted {relativeTime(row.votedAt)}
            </time>
          )}
          {row.top100Rank !== null && (
            <Link
              href={`/top-100/all-time#caption-${row.captionId}`}
              className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5
                         font-medium text-primary hover:bg-primary/25 transition-colors"
            >
              <Trophy className="w-3 h-3" />#{row.top100Rank} in Top 100
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col items-center gap-1 shrink-0">
        <VoteButton
          direction={1}
          active={row.vote === 1}
          disabled={row.pending}
          onClick={() => onVote(row.captionId, 1)}
        />
        <VoteButton
          direction={-1}
          active={row.vote === -1}
          disabled={row.pending}
          onClick={() => onVote(row.captionId, -1)}
        />
      </div>
    </li>
  );
}

type MyRatingsListProps = {
  /** First page rendered on the server; fetched on mount when omitted. */
  initial?: MyVotesPage;
  pageSize?: number;
  /** Only votes cast in this many past days. */
  sinceDays?: number;
  /** Shown after the count, e.g. "in the past week". */
  periodLabel?: string;
  /** Two columns from the sm breakpoint up. */
  columns?: 1 | 2;
  emptyText?: string;
  emptyAction?: React.ReactNode;
  /** Called after a vote is changed or removed from the list. */
  onVoteChange?: (captionId: string, vote: 1 | -1 | null, score: number) => void;
};

/**
 * Captions the signed-in user has voted on, newest vote first, with the score
 * then and now. Tapping an arrow changes the vote; tapping the active arrow
 * removes it (same rule as Top 100).
 */
export default function MyRatingsList({
  initial,
  pageSize = 20,
  sinceDays,
  periodLabel,
  columns = 1,
  emptyText = "Captions you vote on will show up here, newest first.",
  emptyAction,
  onVoteChange,
}: MyRatingsListProps) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[]>(initial?.votes.map(toRow) ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [hasMore, setHasMore] = useState(initial?.hasMore ?? false);
  // Vote rows read so far (including any skipped because the caption is gone),
  // so the next page starts in the right place.
  const [offset, setOffset] = useState(initial ? Math.min(pageSize, initial.total) : 0);
  const [isLoading, setIsLoading] = useState(!initial);

  const loadPage = async (from: number) => {
    setIsLoading(true);
    try {
      const page = await fetchMyVotesAction(from, pageSize, sinceDays);
      setRows((prev) => {
        const seen = new Set(prev.map((r) => r.captionId));
        return [...prev, ...page.votes.filter((v) => !seen.has(v.captionId)).map(toRow)];
      });
      setTotal(page.total);
      setHasMore(page.hasMore);
      setOffset(from + pageSize);
    } catch (error) {
      console.error("Error loading your ratings:", error);
      toast({ title: "Error", description: "Couldn't load your ratings." });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!initial) void loadPage(0);
    // Only on mount; later pages come from "Load more".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateRow = (captionId: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.captionId === captionId ? { ...r, ...patch } : r)));

  const handleVote = async (captionId: string, value: 1 | -1) => {
    const row = rows.find((r) => r.captionId === captionId);
    if (!row || row.pending) return;
    const newVote = row.vote === value ? null : value;
    updateRow(captionId, { pending: true });
    try {
      await toggleCaptionVoteAction(captionId, value);
      const estimate = row.score + (newVote ?? 0) - (row.vote ?? 0);
      const score = (await fetchCaptionScoreAction(captionId)) ?? estimate;
      updateRow(captionId, {
        vote: newVote,
        score,
        // A changed vote is a new vote, so "then" starts again from now.
        scoreAtVote: newVote === null ? null : score,
        votedAt: newVote === null ? row.votedAt : new Date().toISOString(),
        pending: false,
      });
      setTotal((t) => t + (row.vote === null ? 1 : 0) - (newVote === null ? 1 : 0));
      onVoteChange?.(captionId, newVote, score);
    } catch (error) {
      updateRow(captionId, { pending: false });
      const message = error instanceof Error ? error.message : "";
      console.error("Vote change failed:", error);
      toast({
        title: "Vote not changed",
        description: message.includes("User not found")
          ? "Please log in again."
          : "Something went wrong. Please try again.",
        variant: "destructive",
      });
    }
  };

  const listClass = columns === 2 ? "grid gap-3 sm:grid-cols-2" : "space-y-3";

  if (isLoading && rows.length === 0) {
    return (
      <ul className={listClass} aria-busy="true" aria-label="Loading your votes">
        {Array.from({ length: Math.min(pageSize, 4) }).map((_, i) => (
          <li
            key={i}
            className="h-[104px] rounded-2xl bg-gray-50 dark:bg-neutral-800 animate-pulse"
          />
        ))}
      </ul>
    );
  }

  if (rows.length === 0) {
    return (
      <div
        className="bg-gray-50 dark:bg-neutral-800 rounded-2xl p-5 flex flex-col sm:flex-row
                   items-center gap-4 text-center sm:text-left"
      >
        <BrandImage variant="mark" alt="" className="w-10 h-10 shrink-0" />
        <p className="flex-1 text-sm text-muted-foreground">{emptyText}</p>
        {emptyAction}
      </div>
    );
  }

  const inTop100 = rows.filter((r) => r.vote !== null && r.top100Rank !== null).length;

  return (
    <div>
      <p className="mb-3 text-sm text-muted-foreground" aria-live="polite">
        {total} caption{total === 1 ? "" : "s"} rated{periodLabel ? ` ${periodLabel}` : ""},
        newest first
        {inTop100 > 0 && (
          <>
            {" "}
            · <span className="text-primary font-medium">{inTop100} in Top 100</span>
          </>
        )}
      </p>
      <ul className={listClass}>
        {rows.map((row) => (
          <RatingRow key={row.captionId} row={row} onVote={(id, v) => void handleVote(id, v)} />
        ))}
      </ul>
      {hasMore && (
        <div className="flex justify-center mt-6">
          <button
            type="button"
            onClick={() => void loadPage(offset)}
            disabled={isLoading}
            className="px-6 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-full
                       transition-colors disabled:opacity-50"
          >
            {isLoading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </div>
  );
}
