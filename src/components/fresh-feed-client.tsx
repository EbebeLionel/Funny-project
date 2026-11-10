"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, SkipForward } from "lucide-react";
import {
  fetchFreshCaptionsAction,
  type FreshCaption,
} from "@/app/actions/captions/fetch-fresh-captions-action";
import { toggleCaptionVoteAction } from "@/app/actions/captions";
import { checkAuthStatusAction } from "@/app/actions/auth/check-auth-status";
import { LoginPromptModal } from "@/components/ui/login-prompt-modal";
import { Top100CaptionImage } from "@/components/top-100-caption-image";
import { BrandImage } from "@/components/brand-image";
import { useToast } from "@/hooks/use-toast";

type FreshFeedClientProps = {
  initialCaptions: FreshCaption[];
  initialIsAuthenticated: boolean;
};

/** Fetch more when this many captions remain in the queue. */
const REFILL_THRESHOLD = 5;
const PAGE_SIZE = 20;

type LastRating = {
  captionId: string;
  vote: 1 | -1;
  score: number;
};

export default function FreshFeedClient({
  initialCaptions,
  initialIsAuthenticated,
}: FreshFeedClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [queue, setQueue] = useState<FreshCaption[]>(initialCaptions);
  const [index, setIndex] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(initialIsAuthenticated);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [ratedCount, setRatedCount] = useState(0);
  const [lastRating, setLastRating] = useState<LastRating | null>(null);
  const [isVoting, setIsVoting] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(initialCaptions.length === 0);

  // Ids seen in this session so a refill never repeats a skipped caption.
  const seenIdsRef = useRef<Set<string>>(new Set(initialCaptions.map((c) => c.id)));
  const loadingRef = useRef(false);

  const current = queue[index];
  const next = queue[index + 1];

  // The server-rendered auth state can be stale after a client-side login, so
  // re-check once on mount (same approach as the Top 100 page).
  useEffect(() => {
    let cancelled = false;
    checkAuthStatusAction()
      .then((auth) => {
        if (!cancelled) setIsAuthenticated(auth.isAuthenticated && !auth.isAnonymous);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Warm the browser cache with the next image so advancing feels instant.
  useEffect(() => {
    if (!next?.image_url) return;
    const img = new Image();
    img.src = next.image_url;
  }, [next?.image_url]);

  const loadMore = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoadingMore(true);
    try {
      const more = await fetchFreshCaptionsAction(PAGE_SIZE, Array.from(seenIdsRef.current));
      const fresh = more.filter((c) => !seenIdsRef.current.has(c.id));
      fresh.forEach((c) => seenIdsRef.current.add(c.id));
      if (fresh.length === 0) {
        setExhausted(true);
      } else {
        setQueue((prev) => [...prev, ...fresh]);
      }
    } catch (error) {
      console.error("Failed to load more fresh captions:", error);
      toast({
        title: "Could not load more captions",
        description: "Please try again in a moment.",
        variant: "destructive",
      });
    } finally {
      loadingRef.current = false;
      setIsLoadingMore(false);
    }
  }, [toast]);

  // Refill before the queue runs dry.
  useEffect(() => {
    const remaining = queue.length - index;
    if (!exhausted && remaining <= REFILL_THRESHOLD) {
      void loadMore();
    }
  }, [queue.length, index, exhausted, loadMore]);

  const advance = useCallback(() => {
    setIndex((i) => i + 1);
  }, []);

  const handleSkip = useCallback(() => {
    if (!current || isVoting) return;
    advance();
  }, [current, isVoting, advance]);

  const handleVote = useCallback(
    async (vote: 1 | -1) => {
      if (!current || isVoting) return;
      if (!isAuthenticated) {
        setShowLoginPrompt(true);
        return;
      }

      setIsVoting(true);
      try {
        await toggleCaptionVoteAction(current.id, vote);
        const score = current.like_count + vote;
        setLastRating({ captionId: current.id, vote, score });
        setRatedCount((n) => n + 1);
        advance();
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("User not found")) {
          setIsAuthenticated(false);
          setShowLoginPrompt(true);
        } else {
          console.error("Vote failed:", error);
          toast({
            title: "Vote failed",
            description: "Your vote was not saved. Please try again.",
            variant: "destructive",
          });
        }
      } finally {
        setIsVoting(false);
      }
    },
    [current, isVoting, isAuthenticated, advance, toast]
  );

  // Keyboard: ↑ upvote, ↓ downvote, → skip. Ignored while typing or when a
  // dialog is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showLoginPrompt) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        void handleVote(1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        void handleVote(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleSkip();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleVote, handleSkip, showLoginPrompt]);

  const handleStartOver = async () => {
    seenIdsRef.current = new Set();
    setQueue([]);
    setIndex(0);
    setExhausted(false);
    setLastRating(null);
    await loadMore();
  };

  const isFinished = !current && exhausted && !isLoadingMore;

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
      <div className="container mx-auto px-4 py-6 sm:py-10 max-w-2xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-6">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Fresh</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Captions that haven&apos;t been rated yet. Be the first to judge.
            </p>
          </div>
          <div
            className="self-start sm:self-auto rounded-full border border-[#666363] px-3 py-1
                       text-sm text-muted-foreground"
            aria-live="polite"
          >
            Rated today: <span className="text-primary font-semibold">{ratedCount}</span>
          </div>
        </div>

        {/* Result of the last vote */}
        {lastRating && !isFinished && (
          <div
            className="mb-4 rounded-xl bg-gray-50 dark:bg-neutral-800 px-4 py-2 text-sm
                       flex items-center gap-2"
            aria-live="polite"
          >
            {lastRating.vote === 1 ? (
              <ChevronUp className="w-4 h-4 text-primary" />
            ) : (
              <ChevronDown className="w-4 h-4 text-primary" />
            )}
            <span>
              Vote saved. That caption&apos;s score is now{" "}
              <span className="font-semibold">
                {lastRating.score > 0 ? `+${lastRating.score}` : lastRating.score}
              </span>
              .
            </span>
          </div>
        )}

        {/* Card */}
        {current ? (
          <div
            key={current.id}
            className="bg-white dark:bg-[#1a1a1a] rounded-2xl overflow-hidden
                       border border-gray-200 dark:border-gray-700/50 shadow-sm"
          >
            <div className="p-3 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <BrandImage variant="mark" alt="Crackd" className="w-6 h-6" />
                <span className="text-primary text-sm font-bold">Crackd</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {current.like_count === 0
                  ? "No votes yet"
                  : `Score ${current.like_count > 0 ? "+" : ""}${current.like_count}`}
              </span>
            </div>

            <div className="relative w-full aspect-[4/5] sm:aspect-square">
              <Top100CaptionImage src={current.image_url} captionId={current.id} />
            </div>

            <div className="p-4">
              <p className="text-base sm:text-lg leading-snug">{current.content}</p>
            </div>

            {/* Actions */}
            <div
              className="grid grid-cols-3 gap-2 p-3 border-t border-gray-200
                         dark:border-gray-700/50"
            >
              <button
                type="button"
                onClick={() => void handleVote(1)}
                disabled={isVoting}
                className="flex flex-col items-center justify-center gap-1 rounded-xl py-3
                           bg-gray-50 dark:bg-neutral-800 hover:bg-primary/10
                           text-gray-700 dark:text-gray-200 hover:text-primary
                           transition-colors disabled:opacity-50"
                aria-label="Upvote (Arrow Up)"
              >
                <ChevronUp className="w-6 h-6" />
                <span className="text-xs">Funny</span>
                <kbd className="text-[10px] text-muted-foreground hidden sm:block">↑</kbd>
              </button>
              <button
                type="button"
                onClick={handleSkip}
                disabled={isVoting}
                className="flex flex-col items-center justify-center gap-1 rounded-xl py-3
                           bg-gray-50 dark:bg-neutral-800 hover:bg-gray-200
                           dark:hover:bg-neutral-700 text-gray-700 dark:text-gray-200
                           transition-colors disabled:opacity-50"
                aria-label="Skip (Arrow Right)"
              >
                <SkipForward className="w-6 h-6" />
                <span className="text-xs">Skip</span>
                <kbd className="text-[10px] text-muted-foreground hidden sm:block">→</kbd>
              </button>
              <button
                type="button"
                onClick={() => void handleVote(-1)}
                disabled={isVoting}
                className="flex flex-col items-center justify-center gap-1 rounded-xl py-3
                           bg-gray-50 dark:bg-neutral-800 hover:bg-primary/10
                           text-gray-700 dark:text-gray-200 hover:text-primary
                           transition-colors disabled:opacity-50"
                aria-label="Downvote (Arrow Down)"
              >
                <ChevronDown className="w-6 h-6" />
                <span className="text-xs">Not funny</span>
                <kbd className="text-[10px] text-muted-foreground hidden sm:block">↓</kbd>
              </button>
            </div>
          </div>
        ) : isFinished ? (
          <div
            className="bg-gray-50 dark:bg-neutral-800 rounded-2xl p-8 flex flex-col
                       items-center text-center gap-4"
          >
            <BrandImage variant="mark" alt="Crackd Logo" className="w-16 h-16" />
            <h2 className="text-2xl font-bold">You&apos;ve seen everything fresh</h2>
            <p className="text-sm text-muted-foreground max-w-sm">
              {ratedCount > 0
                ? `You rated ${ratedCount} caption${ratedCount === 1 ? "" : "s"} this session. `
                : ""}
              Check back later for new captions, or see what&apos;s winning right now.
            </p>
            <div className="flex gap-3">
              <Link
                href="/top-100/all-time"
                className="px-4 py-2 rounded-full bg-primary text-white text-sm font-medium
                           hover:bg-primary/90 transition-colors"
              >
                Go to Top 100
              </Link>
              <button
                type="button"
                onClick={() => void handleStartOver()}
                className="px-4 py-2 rounded-full border border-[#666363] text-sm font-medium
                           hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
              >
                Start over
              </button>
            </div>
          </div>
        ) : (
          <div
            className="bg-gray-50 dark:bg-neutral-800 rounded-2xl aspect-[4/5] sm:aspect-square
                       animate-pulse"
            aria-busy="true"
            aria-label="Loading captions"
          />
        )}

        {!isAuthenticated && current && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            You can browse without an account. Voting asks you to log in.
          </p>
        )}
      </div>

      <LoginPromptModal
        open={showLoginPrompt}
        onOpenChange={setShowLoginPrompt}
        onProceed={() => {
          setShowLoginPrompt(false);
          router.push("/login");
        }}
      />
    </div>
  );
}
