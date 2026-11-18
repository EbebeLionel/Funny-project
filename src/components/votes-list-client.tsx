"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp } from "lucide-react";
import {
  fetchMyVotesAction,
  type MyVote,
  type MyVotesPage,
} from "@/app/actions/captions/fetch-my-votes-action";
import { BrandImage } from "@/components/brand-image";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type VotesListClientProps = {
  initial: MyVotesPage;
  pageSize: number;
};

const formatScore = (score: number) => (score > 0 ? `+${score}` : `${score}`);

const relativeTime = (iso: string) => {
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
  let value = seconds;
  for (const [size, unit] of steps) {
    if (Math.abs(value) < size) return rtf.format(-Math.round(value), unit);
    value /= size;
  }
  return "";
};

function VoteRow({ vote }: { vote: MyVote }) {
  const isUp = vote.vote === 1;
  return (
    <li>
      <Link
        href={`/caption/${vote.captionId}`}
        className="flex items-center gap-3 sm:gap-4 rounded-2xl bg-gray-50 dark:bg-neutral-800
                   p-3 hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
      >
        <div className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 overflow-hidden rounded-lg bg-gray-200 dark:bg-neutral-900">
          {vote.imageUrl ? (
            <img
              src={vote.imageUrl}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <BrandImage variant="mark" alt="" className="w-full h-full p-4 opacity-40" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm sm:text-base font-medium leading-snug line-clamp-2">
            {vote.content}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            <time dateTime={vote.votedAt} title={new Date(vote.votedAt).toLocaleString()}>
              Voted {relativeTime(vote.votedAt)}
            </time>
          </p>
        </div>

        <div className="flex flex-col items-center gap-1 shrink-0 w-14">
          <span
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-full",
              isUp ? "bg-primary/15 text-primary" : "bg-gray-200 dark:bg-neutral-700 text-muted-foreground"
            )}
            aria-label={isUp ? "You voted funny" : "You voted not funny"}
            title={isUp ? "You voted funny" : "You voted not funny"}
          >
            {isUp ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap" title="Current score">
            Score{" "}
            <span className="font-semibold text-gray-900 dark:text-white">
              {formatScore(vote.score)}
            </span>
          </span>
        </div>
      </Link>
    </li>
  );
}

export default function VotesListClient({ initial, pageSize }: VotesListClientProps) {
  const [votes, setVotes] = useState<MyVote[]>(initial.votes);
  const [total, setTotal] = useState(initial.total);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  // Rows read so far, including any skipped because the caption is gone, so
  // the next page starts in the right place.
  const [offset, setOffset] = useState(Math.min(pageSize, initial.total));
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const loadMore = async () => {
    setIsLoading(true);
    try {
      const page = await fetchMyVotesAction(offset, pageSize);
      setVotes((prev) => {
        const seen = new Set(prev.map((v) => v.captionId));
        return [...prev, ...page.votes.filter((v) => !seen.has(v.captionId))];
      });
      setTotal(page.total);
      setHasMore(page.hasMore);
      setOffset((prev) => prev + pageSize);
    } catch (error) {
      console.error("Error loading more votes:", error);
      toast({ title: "Error", description: "Couldn't load more of your votes." });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
      <div className="container mx-auto px-4 py-6 sm:py-10 max-w-2xl">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Your votes</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Every caption you&apos;ve rated, most recent first.
            </p>
          </div>
          <div
            className="self-start sm:self-auto rounded-full border border-[#666363] px-3 py-1
                       text-sm text-muted-foreground"
          >
            Voted on: <span className="text-primary font-semibold">{total}</span>
          </div>
        </div>

        {votes.length > 0 ? (
          <>
            <ul className="space-y-3">
              {votes.map((vote) => (
                <VoteRow key={vote.captionId} vote={vote} />
              ))}
            </ul>
            {hasMore && (
              <div className="flex justify-center mt-6">
                <button
                  type="button"
                  onClick={() => void loadMore()}
                  disabled={isLoading}
                  className="px-6 py-2 bg-primary/20 hover:bg-primary/30 text-primary rounded-full
                             transition-colors disabled:opacity-50"
                >
                  {isLoading ? "Loading…" : "Load more"}
                </button>
              </div>
            )}
          </>
        ) : (
          <div
            className="bg-gray-50 dark:bg-neutral-800 rounded-2xl p-8 flex flex-col
                       items-center text-center gap-4"
          >
            <BrandImage variant="mark" alt="Crackd Logo" className="w-16 h-16" />
            <h2 className="text-2xl font-bold">No votes yet</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              Captions you rate on Fresh will show up here, newest first.
            </p>
            <Link
              href="/fresh"
              className="px-4 py-2 rounded-full bg-primary text-white text-sm font-medium
                         hover:bg-primary/90 transition-colors"
            >
              Start rating
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
