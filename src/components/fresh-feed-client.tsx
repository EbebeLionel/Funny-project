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
import {
  ChevronUp,
  ChevronDown,
  Flame,
  Sparkles,
  SkipForward,
  Trophy,
  Undo2,
  X,
} from "lucide-react";
import {
  fetchCaptionScoreAction,
  fetchCaptionScoresAction,
  fetchFreshCaptionsAction,
  type FreshCaption,
} from "@/app/actions/captions/fetch-fresh-captions-action";
import {
  fetchRatingStatsAction,
  fetchTop100WinsAction,
  type RatingStats,
  type Top100Win,
} from "@/app/actions/captions/fetch-rating-stats-action";
import {
  fetchFlavorOptionsAction,
  type FlavorOption,
} from "@/app/actions/captions/fetch-flavor-options-action";
import { toggleCaptionVoteAction } from "@/app/actions/captions";
import { checkAuthStatusAction } from "@/app/actions/auth/check-auth-status";
import { LoginPromptModal } from "@/components/ui/login-prompt-modal";
import { Top100CaptionImage } from "@/components/top-100-caption-image";
import { BrandImage } from "@/components/brand-image";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type FreshFeedClientProps = {
  initialCaptions: FreshCaption[];
  initialIsAuthenticated: boolean;
};

/** Where a user finds every caption they voted on recently. */
const RECENT_VOTES_HREF = "/top-100/past-week";

/** A vote saved in this session, newest first. */
type SessionRating = {
  caption: FreshCaption;
  vote: 1 | -1;
  /** Live score: a local estimate until the real one arrives, then refreshed. */
  score: number;
};

/** How many recent ratings the strip under the card shows. */
const STRIP_SIZE = 4;
/** How often (ms) the strip and recap refresh their scores. */
const SCORE_REFRESH_MS = 15000;

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

/** Ratings per day that fill the progress ring. */
const DAILY_GOAL = 20;
/** Session counts that get a small celebration. */
const MILESTONES = [10, 25, 50];
const MILESTONE_MESSAGES: Record<number, string> = {
  10: "Nice rhythm. Every vote helps a new caption find its audience.",
  25: "You're a seasoned judge now.",
  50: "Fifty! That's a serious judging session.",
};
/** How long (ms) a celebration banner stays up on its own. */
const CELEBRATION_MS = 4000;
/** Top 100 captions the user has already been told about (localStorage). */
const WINS_SEEN_KEY = "funnybone:top100-wins-seen";

const readSeenWins = (): Set<string> => {
  try {
    const raw = window.localStorage.getItem(WINS_SEEN_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
};

const writeSeenWins = (ids: string[]) => {
  try {
    const seen = readSeenWins();
    ids.forEach((id) => seen.add(id));
    window.localStorage.setItem(WINS_SEEN_KEY, JSON.stringify(Array.from(seen)));
  } catch {
    // Storage can be unavailable (private mode); the notice just shows again.
  }
};

type Celebration =
  | { kind: "milestone"; count: number }
  | { kind: "goal"; count: number };

/** Small ring that fills as today's ratings approach the daily goal. */
function GoalRing({ value, goal }: { value: number; goal: number }) {
  const radius = 15;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(1, value / goal);
  const done = value >= goal;
  return (
    <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90 shrink-0" aria-hidden="true">
      <circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        strokeWidth="4"
        className="stroke-gray-200 dark:stroke-neutral-700"
      />
      <motion.circle
        cx="18"
        cy="18"
        r={radius}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-primary"
        strokeDasharray={circumference}
        initial={false}
        animate={{ strokeDashoffset: circumference * (1 - progress) }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
      {done && (
        <circle cx="18" cy="18" r="7" className="fill-primary" />
      )}
    </svg>
  );
}

/** Flavor chips that restart the feed with one humor flavor. */
function FlavorChips({
  flavors,
  active,
  onPick,
}: {
  flavors: FlavorOption[];
  active: FlavorOption | null;
  onPick: (flavor: FlavorOption | null) => void;
}) {
  if (flavors.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-center gap-2">
      {flavors.map((flavor) => (
        <button
          key={flavor.id}
          type="button"
          onClick={() => onPick(flavor)}
          aria-pressed={active?.id === flavor.id}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            active?.id === flavor.id
              ? "border-primary bg-primary text-white"
              : "border-[#666363] hover:border-primary hover:text-primary"
          )}
        >
          {flavor.name}
        </button>
      ))}
    </div>
  );
}

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

function RatingThumb({
  rating,
  onClick,
}: {
  rating: SessionRating;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      layout
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.8 }}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      onClick={onClick}
      className="group relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 overflow-hidden rounded-xl
                 bg-gray-200 dark:bg-neutral-900"
      title={rating.caption.content}
      aria-label={
        `${rating.vote === 1 ? "Funny" : "Not funny"}: ${rating.caption.content}. ` +
        `Score ${formatScore(rating.score)}`
      }
    >
      <img
        src={rating.caption.image_url}
        alt=""
        className="absolute inset-0 w-full h-full object-cover transition-transform
                   group-hover:scale-105"
        loading="lazy"
      />
      <span
        className={cn(
          "absolute left-1 top-1 flex items-center justify-center w-5 h-5 rounded-full text-white",
          rating.vote === 1 ? "bg-primary" : "bg-gray-600"
        )}
        aria-hidden="true"
      >
        {rating.vote === 1 ? (
          <ChevronUp className="w-3.5 h-3.5" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5" />
        )}
      </span>
      <span
        className="absolute inset-x-0 bottom-0 bg-black/65 py-0.5 text-center text-xs
                   font-semibold text-white"
        aria-hidden="true"
      >
        {formatScore(rating.score)}
      </span>
    </motion.button>
  );
}

export default function FreshFeedClient({
  initialCaptions,
  initialIsAuthenticated,
}: FreshFeedClientProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [sessionRatings, setSessionRatings] = useState<SessionRating[]>([]);
  const openRecentVotes = useCallback(() => router.push(RECENT_VOTES_HREF), [router]);

  const [queue, setQueue] = useState<FreshCaption[]>(initialCaptions);
  const [index, setIndex] = useState(0);
  const [isAuthenticated, setIsAuthenticated] = useState(initialIsAuthenticated);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [ratedCount, setRatedCount] = useState(0);
  const [lastRating, setLastRating] = useState<LastRating | null>(null);
  const [exitDirection, setExitDirection] = useState<ExitDirection>("skip");
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(initialCaptions.length === 0);

  // Persisted counters. `sessionBase` is the session count when the stats
  // arrived; votes after that are added on top locally.
  const [stats, setStats] = useState<(RatingStats & { sessionBase: number }) | null>(null);
  const statsRef = useRef(stats);
  const ratedCountRef = useRef(0);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const celebratedRef = useRef<Set<number>>(new Set());
  const goalCelebratedRef = useRef(false);
  // The user chose to stop after hitting the daily goal.
  const [wrappedUp, setWrappedUp] = useState(false);
  // Upvoted captions now in the Top 100 that the user has not been told about.
  const [wins, setWins] = useState<Top100Win[]>([]);
  const [flavors, setFlavors] = useState<FlavorOption[]>([]);
  const flavorsRequestedRef = useRef(false);
  const [flavor, setFlavor] = useState<FlavorOption | null>(null);
  const flavorRef = useRef<FlavorOption | null>(null);

  // Ids seen in this session so a refill never repeats a skipped caption.
  const seenIdsRef = useRef<Set<string>>(new Set(initialCaptions.map((c) => c.id)));
  // Bumped whenever the queue is reset, so a load started before the reset is
  // dropped instead of mixing old results into the new queue.
  const generationRef = useRef(0);
  // Generation of the load in flight, or -1 when none is.
  const loadingRef = useRef(-1);
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

  // Rating counters and Top 100 news, loaded from the database once signed in.
  useEffect(() => {
    if (!isAuthenticated) {
      statsRef.current = null;
      setStats(null);
      setWins([]);
      return;
    }
    let cancelled = false;
    fetchRatingStatsAction(new Date().getTimezoneOffset())
      .then((loaded) => {
        if (cancelled || !loaded) return;
        const next = { ...loaded, sessionBase: ratedCountRef.current };
        // Only celebrate the goal when it is crossed in this session.
        goalCelebratedRef.current = loaded.today >= DAILY_GOAL;
        statsRef.current = next;
        setStats(next);
      })
      .catch((error) => console.error("Could not load rating stats:", error));
    fetchTop100WinsAction()
      .then((all) => {
        if (cancelled) return;
        const seen = readSeenWins();
        setWins(all.filter((w) => !seen.has(w.captionId)));
      })
      .catch((error) => console.error("Could not load Top 100 wins:", error));
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  const dismissWins = useCallback(() => {
    writeSeenWins(wins.map((w) => w.captionId));
    setWins([]);
  }, [wins]);

  // Milestone banners disappear on their own; the goal banner waits for a choice.
  useEffect(() => {
    if (celebration?.kind !== "milestone") return;
    const timer = window.setTimeout(() => setCelebration(null), CELEBRATION_MS);
    return () => window.clearTimeout(timer);
  }, [celebration]);

  /** Change the session count and celebrate milestones and the daily goal. */
  const changeRatedCount = useCallback((delta: 1 | -1) => {
    const count = Math.max(0, ratedCountRef.current + delta);
    ratedCountRef.current = count;
    setRatedCount(count);
    if (delta < 0) return;

    const s = statsRef.current;
    const today = s ? s.today + count - s.sessionBase : count;
    if (s && today >= DAILY_GOAL && !goalCelebratedRef.current) {
      goalCelebratedRef.current = true;
      setCelebration({ kind: "goal", count: today });
    } else if (MILESTONES.includes(count) && !celebratedRef.current.has(count)) {
      celebratedRef.current.add(count);
      setCelebration({ kind: "milestone", count });
    }
  }, []);

  const loadMore = useCallback(async () => {
    const generation = generationRef.current;
    if (loadingRef.current === generation) return;
    loadingRef.current = generation;
    setIsLoadingMore(true);
    try {
      const more = await fetchFreshCaptionsAction(
        PAGE_SIZE,
        Array.from(seenIdsRef.current),
        flavorRef.current?.id ?? null
      );
      if (generation !== generationRef.current) return;
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
      // A newer load may have started after a reset; leave its flag alone.
      if (loadingRef.current === generation) {
        loadingRef.current = -1;
        setIsLoadingMore(false);
      }
    }
  }, [toast]);

  /** Empty the queue and load again, e.g. after picking a flavor. */
  const resetQueue = useCallback(
    (options: { forgetSeen: boolean }) => {
      generationRef.current += 1;
      if (options.forgetSeen) seenIdsRef.current = new Set();
      setQueue([]);
      setIndex(0);
      setExhausted(false);
      setLastRating(null);
      setWrappedUp(false);
      void loadMore();
    },
    [loadMore]
  );

  const pickFlavor = useCallback(
    (next: FlavorOption | null) => {
      flavorRef.current = next;
      setFlavor(next);
      resetQueue({ forgetSeen: false });
    },
    [resetQueue]
  );

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
          changeRatedCount(1);
          setLastRating((prev) =>
            prev?.caption.id === caption.id ? { ...prev, status: "saved" } : prev
          );
          setSessionRatings((prev) => [
            { caption, vote, score: caption.like_count + vote },
            ...prev.filter((r) => r.caption.id !== caption.id),
          ]);

          // Replace the local estimate with the trigger-maintained score.
          const realScore = await fetchCaptionScoreAction(caption.id);
          if (realScore !== null) {
            setLastRating((prev) =>
              prev?.caption.id === caption.id ? { ...prev, score: realScore } : prev
            );
            setSessionRatings((prev) =>
              prev.map((r) => (r.caption.id === caption.id ? { ...r, score: realScore } : r))
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
    [current, isAuthenticated, advance, restore, toast, changeRatedCount]
  );

  const handleUndo = useCallback(() => {
    if (!lastRating || lastRating.status !== "saved") return;
    const { caption, vote } = lastRating;
    setLastRating({ ...lastRating, status: "undoing" });

    void (async () => {
      try {
        // Voting the same way again removes the vote (repo voting rules).
        await toggleCaptionVoteAction(caption.id, vote);
        changeRatedCount(-1);
        setLastRating(null);
        setSessionRatings((prev) => prev.filter((r) => r.caption.id !== caption.id));
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
  }, [lastRating, restore, toast, changeRatedCount]);

  // Keyboard: ↑ upvote, ↓ downvote, → skip, Backspace undo. Ignored while
  // typing or when a dialog is open.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showLoginPrompt || wrappedUp) return;
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
  }, [handleVote, handleSkip, handleUndo, showLoginPrompt, wrappedUp]);

  const handleStartOver = () => resetQueue({ forgetSeen: true });

  // Ran out of captions, or stopped after reaching the daily goal.
  const isFinished = (!current && exhausted && !isLoadingMore) || wrappedUp;
  // The feed widens to older captions once every near-zero caption is rated.
  const sawOlderPool = queue.some((c) => c.from_older_pool);

  // Flavor filters are only offered once the new captions run out.
  const needFlavors = sawOlderPool || isFinished;
  useEffect(() => {
    if (!needFlavors || flavorsRequestedRef.current) return;
    flavorsRequestedRef.current = true;
    fetchFlavorOptionsAction()
      .then(setFlavors)
      .catch((error) => console.error("Could not load flavors:", error));
  }, [needFlavors]);

  // Counters shown in the header: database totals plus votes since they loaded.
  const sinceStats = stats ? ratedCount - stats.sessionBase : 0;
  const todayCount = stats ? Math.max(0, stats.today + sinceStats) : ratedCount;
  const totalCount = stats ? Math.max(0, stats.total + sinceStats) : ratedCount;
  // A first vote today extends a streak that so far ran through yesterday.
  const streak = stats ? stats.streak + (!stats.activeToday && todayCount > 0 ? 1 : 0) : 0;

  // Keep the scores in the strip (or the end-screen recap) live while the page
  // is visible.
  const liveIds = (isFinished ? sessionRatings : sessionRatings.slice(0, STRIP_SIZE))
    .map((r) => r.caption.id)
    .join(",");
  useEffect(() => {
    if (!liveIds) return;
    const ids = liveIds.split(",");
    const refresh = async () => {
      if (document.visibilityState !== "visible") return;
      const scores = await fetchCaptionScoresAction(ids);
      setSessionRatings((prev) =>
        prev.map((r) => (r.caption.id in scores ? { ...r, score: scores[r.caption.id] } : r))
      );
    };
    const timer = window.setInterval(() => void refresh(), SCORE_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [liveIds]);

  const ratePanel = (
    <>
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

      {/* Upvoted captions that have since reached the Top 100 */}
      {wins.length > 0 && (
        <div
          className="mb-4 rounded-xl border border-primary/40 bg-primary/5 px-4 py-3 text-sm"
          role="status"
        >
          <div className="flex items-start gap-2">
            <Trophy className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold">
                {wins.length === 1
                  ? "A caption you upvoted is in the Top 100"
                  : `${wins.length} captions you upvoted are in the Top 100`}
              </p>
              <p className="text-xs text-muted-foreground">
                You made a difference. Your vote helped put them there.
              </p>
              <ul className="mt-2 space-y-1.5">
                {wins.slice(0, 3).map((w) => (
                  <li key={w.captionId}>
                    <Link
                      href={`/top-100/all-time#caption-${w.captionId}`}
                      onClick={dismissWins}
                      className="flex items-center gap-2 rounded-lg hover:text-primary"
                    >
                      {w.imageUrl && (
                        <img
                          src={w.imageUrl}
                          alt=""
                          className="w-8 h-8 shrink-0 rounded-md object-cover"
                          loading="lazy"
                        />
                      )}
                      <span className="w-9 shrink-0 font-semibold text-primary">
                        {`#${w.rank}`}
                      </span>
                      <span className="min-w-0 truncate">{w.content}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              {wins.length > 3 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {`And ${wins.length - 3} more in the Top 100.`}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={dismissWins}
              className="rounded-full p-1 text-muted-foreground hover:bg-primary/10
                         hover:text-primary transition-colors"
              aria-label="Dismiss Top 100 notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Active flavor filter */}
      {flavor && !isFinished && (
        <div
          className="mb-4 flex items-center justify-between gap-2 rounded-xl bg-gray-50
                     dark:bg-neutral-800 px-4 py-2 text-sm"
        >
          <span>
            {"Showing "}
            <span className="font-semibold text-primary">{flavor.name}</span>
            {" captions"}
          </span>
          <button
            type="button"
            onClick={() => pickFlavor(null)}
            className="text-xs font-medium text-primary hover:underline"
          >
            All captions
          </button>
        </div>
      )}

      {/* Explain the switch to older captions and offer a way to narrow it */}
      {current?.from_older_pool && !wrappedUp && (
        <div
          className="mb-4 rounded-xl border border-dashed border-[#666363] px-4 py-3 text-sm
                     text-muted-foreground space-y-2"
          role="status"
        >
          <p>
            {flavor
              ? `You've rated every new ${flavor.name} caption. ` +
                "Here are older ones you haven't voted on yet."
              : "You've rated every new caption. Here are older ones you haven't voted on yet."}
          </p>
          {!flavor && flavors.length > 0 && (
            <>
              <p className="text-xs">Or keep going with one humor flavor:</p>
              <FlavorChips flavors={flavors} active={flavor} onPick={pickFlavor} />
            </>
          )}
        </div>
      )}

      {/* Card */}
      {current && !wrappedUp ? (
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
          className="bg-gray-50 dark:bg-neutral-800 rounded-2xl p-6 sm:p-8 flex flex-col
                     items-center text-center gap-4"
        >
          <BrandImage variant="mark" alt="Crackd Logo" className="w-16 h-16" />
          <h2 className="text-2xl font-bold">
            {wrappedUp
              ? "Daily goal done"
              : flavor
                ? `You've rated everything in ${flavor.name}`
                : sawOlderPool
                  ? "You've rated everything available"
                  : "You've seen everything fresh"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            {wrappedUp
              ? `You rated ${todayCount} captions today` +
                (streak > 1 ? ` and your streak is at ${streak} days. ` : ". ") +
                "Come back tomorrow to keep it going."
              : flavor
                ? "Try another flavor, or go back to all captions."
                : sawOlderPool
                  ? "You rated every new caption, then the older ones you hadn't voted on " +
                    "that we could find. Pick a flavor below to keep going, or check back " +
                    "later for new captions."
                  : "Check back later for new captions, or see what's winning right now."}
          </p>

          {!wrappedUp && flavors.length > 0 && (
            <div className="w-full space-y-2">
              <h3 className="text-sm font-semibold">Keep going with a humor flavor</h3>
              <FlavorChips flavors={flavors} active={flavor} onPick={pickFlavor} />
              {flavor && (
                <button
                  type="button"
                  onClick={() => pickFlavor(null)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Back to all captions
                </button>
              )}
            </div>
          )}

          {sessionRatings.length > 0 && (
            <div className="w-full text-left">
              <h3 className="mb-2 text-sm font-semibold">
                This session: {sessionRatings.length} caption
                {sessionRatings.length === 1 ? "" : "s"} rated
              </h3>
              <ul className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
                {sessionRatings.map((r) => (
                  <li
                    key={r.caption.id}
                    className="flex items-center gap-3 rounded-xl bg-white dark:bg-neutral-900 p-2"
                  >
                    <img
                      src={r.caption.image_url}
                      alt=""
                      className="w-12 h-12 shrink-0 rounded-lg object-cover"
                      loading="lazy"
                    />
                    <p className="flex-1 min-w-0 text-sm leading-snug line-clamp-2">
                      {r.caption.content}
                    </p>
                    <span
                      className={cn(
                        "flex items-center justify-center w-6 h-6 shrink-0 rounded-full text-white",
                        r.vote === 1 ? "bg-primary" : "bg-gray-600"
                      )}
                      aria-label={r.vote === 1 ? "You voted funny" : "You voted not funny"}
                    >
                      {r.vote === 1 ? (
                        <ChevronUp className="w-4 h-4" />
                      ) : (
                        <ChevronDown className="w-4 h-4" />
                      )}
                    </span>
                    <span className="w-10 shrink-0 text-right text-sm font-semibold">
                      {formatScore(r.score)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap justify-center gap-3">
            {wrappedUp && (
              <button
                type="button"
                onClick={() => setWrappedUp(false)}
                className="px-4 py-2 rounded-full bg-primary text-white text-sm font-medium
                           hover:bg-primary/90 transition-colors"
              >
                Keep rating
              </button>
            )}
            <Link
              href={sessionRatings.length > 0 ? RECENT_VOTES_HREF : "/top-100/all-time"}
              className="px-4 py-2 rounded-full bg-primary text-white text-sm font-medium
                         hover:bg-primary/90 transition-colors"
            >
              {sessionRatings.length > 0 ? "See your votes in Top 100" : "Go to Top 100"}
            </Link>
            {!wrappedUp && (
              <button
                type="button"
                onClick={handleStartOver}
                className="px-4 py-2 rounded-full border border-[#666363] text-sm font-medium
                           hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
              >
                Start over
              </button>
            )}
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

      {/* Recently rated strip */}
      {current && !wrappedUp && sessionRatings.length > 0 && (
        <section className="mt-5" aria-label="Recently rated">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>Recently rated · live scores</span>
            <Link href={RECENT_VOTES_HREF} className="font-medium text-primary hover:underline">
              See all in Top 100
            </Link>
          </div>
          <div className="flex gap-2">
            <AnimatePresence mode="popLayout" initial={false}>
              {sessionRatings.slice(0, STRIP_SIZE).map((r) => (
                <RatingThumb key={r.caption.id} rating={r} onClick={openRecentVotes} />
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      {!isAuthenticated && current && (
        <p className="mt-4 text-center text-xs text-muted-foreground">
          You can browse without an account. Voting asks you to log in.
        </p>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
      <div className="container mx-auto px-4 py-6 sm:py-10 max-w-2xl">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Fresh</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Captions that haven&apos;t been rated yet. Be the first to judge.
            </p>
          </div>
          {stats ? (
            <div className="self-start sm:self-auto shrink-0 flex items-center gap-3">
              <div
                className="flex items-center gap-2"
                title={`Daily goal: rate ${DAILY_GOAL} captions`}
                aria-live="polite"
              >
                <GoalRing value={todayCount} goal={DAILY_GOAL} />
                <div className="leading-tight">
                  <p className="text-sm font-semibold">
                    <span className="text-primary">{todayCount}</span>
                    {` / ${DAILY_GOAL} today`}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {todayCount >= DAILY_GOAL ? "Daily goal done" : `Goal: rate ${DAILY_GOAL}`}
                  </p>
                </div>
              </div>
              <div className="h-8 w-px bg-gray-200 dark:bg-neutral-700" aria-hidden="true" />
              <div className="leading-tight">
                <p className="flex items-center gap-1 text-sm font-semibold">
                  <Flame
                    className={cn(
                      "w-4 h-4",
                      streak > 0 ? "text-orange-500" : "text-muted-foreground"
                    )}
                    aria-hidden="true"
                  />
                  {streak > 0 ? `${streak}-day streak` : "No streak yet"}
                </p>
                <p className="text-xs text-muted-foreground">{`${totalCount} rated all time`}</p>
              </div>
            </div>
          ) : (
            <div
              className="self-start sm:self-auto shrink-0 rounded-full border border-[#666363]
                         px-3 py-1 text-sm text-muted-foreground"
              aria-live="polite"
            >
              {"Rated today: "}
              <span className="text-primary font-semibold">{ratedCount}</span>
            </div>
          )}
        </div>

        {ratePanel}
      </div>

      {/* Milestone and daily-goal celebrations */}
      <AnimatePresence>
        {celebration && (
          <motion.div
            key={`${celebration.kind}-${celebration.count}`}
            initial={{ opacity: 0, y: 40, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40 }}
            transition={{ type: "spring", stiffness: 380, damping: 26 }}
            className="fixed inset-x-4 bottom-6 z-50 mx-auto max-w-sm rounded-2xl bg-primary
                       p-4 text-white shadow-lg"
            role="status"
          >
            <div className="flex items-start gap-3">
              <motion.span
                initial={{ rotate: -30, scale: 0.4 }}
                animate={{ rotate: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 9 }}
                className="mt-0.5"
                aria-hidden="true"
              >
                {celebration.kind === "goal" ? (
                  <Trophy className="w-6 h-6" />
                ) : (
                  <Sparkles className="w-6 h-6" />
                )}
              </motion.span>
              <div className="flex-1">
                <p className="font-bold">
                  {celebration.kind === "goal"
                    ? "Daily goal done!"
                    : `${celebration.count} ratings this session!`}
                </p>
                <p className="text-sm text-white/85">
                  {celebration.kind === "goal"
                    ? `You've rated ${celebration.count} captions today. ` +
                      "Stop here or keep going, it's up to you."
                    : (MILESTONE_MESSAGES[celebration.count] ?? "Keep it up.")}
                </p>
                {celebration.kind === "goal" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCelebration(null);
                        setWrappedUp(true);
                      }}
                      className="rounded-full bg-white px-3 py-1 text-xs font-semibold
                                 text-primary hover:bg-white/90 transition-colors"
                    >
                      Wrap up
                    </button>
                    <button
                      type="button"
                      onClick={() => setCelebration(null)}
                      className="rounded-full border border-white/60 px-3 py-1 text-xs
                                 font-semibold hover:bg-white/10 transition-colors"
                    >
                      Keep going
                    </button>
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setCelebration(null)}
                className="rounded-full p-1 hover:bg-white/15 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
