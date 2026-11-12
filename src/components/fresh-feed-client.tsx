"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  type PanInfo,
} from "framer-motion";
import { ChevronUp, ChevronDown, SkipForward, Undo2 } from "lucide-react";
import {
  fetchCaptionScoreAction,
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

/** Horizontal drag distance (px) or fling speed (px/s) that counts as a vote. */
const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 600;

type ExitDirection = "up" | "down" | "skip";

type LastRating = {
  caption: FreshCaption;
  vote: 1 | -1;
  /** Score shown on the strip: a local estimate until the real one arrives. */
  score: number;
  status: "saving" | "saved" | "undoing";
};

const formatScore = (score: number) => (score > 0 ? `+${score}` : `${score}`);

/* ------------------------------------------------------------------------ */
/* Card                                                                      */
/* ------------------------------------------------------------------------ */

type SwipeCardProps = {
  caption: FreshCaption;
  onVote: (vote: 1 | -1) => void;
  onSkip: () => void;
};

const cardVariants = {
  enter: { opacity: 0, scale: 0.96, y: 12 },
  center: { opacity: 1, scale: 1, y: 0, x: 0, rotate: 0 },
  exit: (direction: ExitDirection) =>
    direction === "up"
      ? { x: 480, rotate: 14, opacity: 0 }
      : direction === "down"
        ? { x: -480, rotate: -14, opacity: 0 }
        : { y: 320, opacity: 0, scale: 0.9 },
};

/**
 * One caption card. Owns its own drag motion values so each card starts
 * centred and the outgoing card is not disturbed when the next one mounts.
 */
const SwipeCard = forwardRef<HTMLDivElement, SwipeCardProps>(function SwipeCard(
  { caption, onVote, onSkip },
  ref
) {
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-240, 240], [-10, 10]);
  const funnyOpacity = useTransform(x, [30, SWIPE_DISTANCE], [0, 1]);
  const notFunnyOpacity = useTransform(x, [-30, -SWIPE_DISTANCE], [0, 1]);

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const { offset, velocity } = info;
    if (offset.x > SWIPE_DISTANCE || velocity.x > SWIPE_VELOCITY) {
      onVote(1);
    } else if (offset.x < -SWIPE_DISTANCE || velocity.x < -SWIPE_VELOCITY) {
      onVote(-1);
    }
    // Otherwise dragSnapToOrigin springs the card back.
  };

  return (
    <motion.div
      ref={ref}
      drag="x"
      dragSnapToOrigin
      dragElastic={0.9}
      onDragEnd={handleDragEnd}
      style={{ x, rotate }}
      variants={cardVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      whileDrag={{ scale: 1.02 }}
      className="relative bg-white dark:bg-[#1a1a1a] rounded-2xl overflow-hidden
                 border border-gray-200 dark:border-gray-700/50 shadow-sm
                 cursor-grab select-none touch-pan-y
                 [&_img]:pointer-events-none [&_img]:[-webkit-user-drag:none]"
    >
      {/* Swipe feedback labels */}
      <motion.div
        style={{ opacity: funnyOpacity }}
        className="pointer-events-none absolute left-4 top-4 z-20 rounded-lg border-2
                   border-primary bg-white/90 dark:bg-black/70 px-3 py-1
                   text-primary font-bold uppercase tracking-wide -rotate-12"
        aria-hidden="true"
      >
        Funny
      </motion.div>
      <motion.div
        style={{ opacity: notFunnyOpacity }}
        className="pointer-events-none absolute right-4 top-4 z-20 rounded-lg border-2
                   border-gray-500 bg-white/90 dark:bg-black/70 px-3 py-1
                   text-gray-700 dark:text-gray-200 font-bold uppercase tracking-wide rotate-12"
        aria-hidden="true"
      >
        Not funny
      </motion.div>

      <div className="p-3 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <BrandImage variant="mark" alt="Crackd" className="w-6 h-6" />
          <span className="text-primary text-sm font-bold">Crackd</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {caption.like_count === 0 ? "No votes yet" : `Score ${formatScore(caption.like_count)}`}
        </span>
      </div>

      <div className="relative w-full aspect-[4/5] sm:aspect-square">
        <Top100CaptionImage src={caption.image_url} captionId={caption.id} />
      </div>

      <div className="p-4">
        <p className="text-base sm:text-lg leading-snug">{caption.content}</p>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-3 gap-2 p-3 border-t border-gray-200 dark:border-gray-700/50">
        <button
          type="button"
          onClick={() => onVote(1)}
          className="flex flex-col items-center justify-center gap-1 rounded-xl py-3
                     bg-gray-50 dark:bg-neutral-800 hover:bg-primary/10
                     text-gray-700 dark:text-gray-200 hover:text-primary
                     transition-colors"
          aria-label="Upvote (Arrow Up, or swipe right)"
        >
          <ChevronUp className="w-6 h-6" />
          <span className="text-xs">Funny</span>
          <kbd className="text-[10px] text-muted-foreground hidden sm:block">↑</kbd>
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="flex flex-col items-center justify-center gap-1 rounded-xl py-3
                     bg-gray-50 dark:bg-neutral-800 hover:bg-gray-200
                     dark:hover:bg-neutral-700 text-gray-700 dark:text-gray-200
                     transition-colors"
          aria-label="Skip (Arrow Right)"
        >
          <SkipForward className="w-6 h-6" />
          <span className="text-xs">Skip</span>
          <kbd className="text-[10px] text-muted-foreground hidden sm:block">→</kbd>
        </button>
        <button
          type="button"
          onClick={() => onVote(-1)}
          className="flex flex-col items-center justify-center gap-1 rounded-xl py-3
                     bg-gray-50 dark:bg-neutral-800 hover:bg-primary/10
                     text-gray-700 dark:text-gray-200 hover:text-primary
                     transition-colors"
          aria-label="Downvote (Arrow Down, or swipe left)"
        >
          <ChevronDown className="w-6 h-6" />
          <span className="text-xs">Not funny</span>
          <kbd className="text-[10px] text-muted-foreground hidden sm:block">↓</kbd>
        </button>
      </div>
    </motion.div>
  );
});

/* ------------------------------------------------------------------------ */
/* Feed                                                                      */
/* ------------------------------------------------------------------------ */

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
  const [exitDirection, setExitDirection] = useState<ExitDirection>("skip");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(initialCaptions.length === 0);

  // Ids seen in this session so a refill never repeats a skipped caption.
  const seenIdsRef = useRef<Set<string>>(new Set(initialCaptions.map((c) => c.id)));
  const loadingRef = useRef(false);
  // Latest index, readable from async callbacks that outlive a render.
  const indexRef = useRef(0);
  indexRef.current = index;
  // Captions whose vote request is still in flight; blocks a double vote on
  // the same card from a fast swipe followed by a key press.
  const pendingRef = useRef<Set<string>>(new Set());

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

  const advance = useCallback((direction: ExitDirection) => {
    setExitDirection(direction);
    setIndex((i) => i + 1);
  }, []);

  /** Put a caption back in front of the user (after a failed vote or an undo). */
  const restore = useCallback((caption: FreshCaption) => {
    const at = indexRef.current;
    setQueue((prev) => {
      const without = prev.filter((c) => c.id !== caption.id);
      return [...without.slice(0, at), caption, ...without.slice(at)];
    });
  }, []);

  const handleSkip = useCallback(() => {
    if (!current) return;
    advance("skip");
  }, [current, advance]);

  const handleVote = useCallback(
    (vote: 1 | -1) => {
      if (!current || pendingRef.current.has(current.id)) return;
      if (!isAuthenticated) {
        setShowLoginPrompt(true);
        return;
      }

      const caption = current;
      pendingRef.current.add(caption.id);

      // Advance straight away so the card flies off under the finger; the
      // request completes in the background and the strip confirms it.
      advance(vote === 1 ? "up" : "down");
      setLastRating({ caption, vote, score: caption.like_count + vote, status: "saving" });

      void (async () => {
        try {
          await toggleCaptionVoteAction(caption.id, vote);
          setRatedCount((n) => n + 1);
          setLastRating((prev) =>
            prev?.caption.id === caption.id ? { ...prev, status: "saved" } : prev
          );

          // Replace the local estimate with the trigger-maintained score.
          const realScore = await fetchCaptionScoreAction(caption.id);
          if (realScore !== null) {
            setLastRating((prev) =>
              prev?.caption.id === caption.id ? { ...prev, score: realScore } : prev
            );
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          setLastRating((prev) => (prev?.caption.id === caption.id ? null : prev));
          restore(caption);
          if (message.includes("User not found")) {
            setIsAuthenticated(false);
            setShowLoginPrompt(true);
          } else {
            console.error("Vote failed:", error);
            toast({
              title: "Vote failed",
              description: "Your vote was not saved. The caption is back so you can try again.",
              variant: "destructive",
            });
          }
        } finally {
          pendingRef.current.delete(caption.id);
        }
      })();
    },
    [current, isAuthenticated, advance, restore, toast]
  );

  const handleUndo = useCallback(() => {
    if (!lastRating || lastRating.status !== "saved") return;
    const { caption, vote } = lastRating;
    setLastRating({ ...lastRating, status: "undoing" });

    void (async () => {
      try {
        // Voting the same way again removes the vote (repo voting rules).
        await toggleCaptionVoteAction(caption.id, vote);
        setRatedCount((n) => Math.max(0, n - 1));
        setLastRating(null);
        restore(caption);
      } catch (error) {
        console.error("Undo failed:", error);
        setLastRating((prev) => (prev ? { ...prev, status: "saved" } : prev));
        toast({
          title: "Could not undo",
          description: "Your vote is still saved. Please try again.",
          variant: "destructive",
        });
      }
    })();
  }, [lastRating, restore, toast]);

  // Keyboard: ↑ upvote, ↓ downvote, → skip, Backspace undo. Ignored while
  // typing or when a dialog is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showLoginPrompt) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable) return;

      if (event.key === "ArrowUp") {
        event.preventDefault();
        handleVote(1);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        handleVote(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        handleSkip();
      } else if (event.key === "Backspace") {
        event.preventDefault();
        handleUndo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleVote, handleSkip, handleUndo, showLoginPrompt]);

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
        <div className="min-h-[2.75rem] mb-4">
          <AnimatePresence>
            {lastRating && !isFinished && (
              <motion.div
                key={lastRating.caption.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18 }}
                className="rounded-xl bg-gray-50 dark:bg-neutral-800 px-4 py-2 text-sm
                           flex items-center gap-2"
                aria-live="polite"
              >
                {lastRating.vote === 1 ? (
                  <ChevronUp className="w-4 h-4 text-primary shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-primary shrink-0" />
                )}
                <span className="flex-1">
                  {lastRating.status === "saving" ? (
                    "Saving your vote…"
                  ) : lastRating.status === "undoing" ? (
                    "Undoing…"
                  ) : (
                    <>
                      Vote saved. That caption&apos;s score is now{" "}
                      <span className="font-semibold">{formatScore(lastRating.score)}</span>.
                    </>
                  )}
                </span>
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={lastRating.status !== "saved"}
                  className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium
                             text-primary hover:bg-primary/10 transition-colors
                             disabled:opacity-50 disabled:hover:bg-transparent"
                  aria-label="Undo last vote (Backspace)"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Undo
                  <kbd className="text-[10px] text-muted-foreground hidden sm:inline">⌫</kbd>
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Card */}
        {current ? (
          <div className="relative">
            <AnimatePresence mode="popLayout" custom={exitDirection} initial={false}>
              <SwipeCard
                key={current.id}
                caption={current}
                onVote={handleVote}
                onSkip={handleSkip}
              />
            </AnimatePresence>
            <p className="mt-3 text-center text-xs text-muted-foreground sm:hidden">
              Swipe right for funny, left for not funny.
            </p>
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
