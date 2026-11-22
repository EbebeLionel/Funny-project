"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { FlaskConical, SkipForward } from "lucide-react";
import {
  fetchFunniestSetsAction,
  type FunniestSet,
} from "@/app/actions/captions/fetch-funniest-sets-action";
import { Top100CaptionImage } from "@/components/top-100-caption-image";
import { useToast } from "@/hooks/use-toast";

type Pick = {
  imageId: string;
  shownCaptionIds: string[];
  /** Null when the user said none of them stood out. */
  pickedCaptionId: string | null;
  pickedContent: string | null;
  /** Time from the set appearing to the pick, in milliseconds. */
  ms: number;
};

type Run = {
  finishedAt: string;
  picks: Pick[];
};

const STORAGE_KEY = "funnybone:funniest-experiment";

const loadRuns = (): Run[] => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Run[]) : [];
  } catch {
    return [];
  }
};

const saveRun = (run: Run) => {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...loadRuns(), run]));
  } catch {
    // Storage can be unavailable (private mode); the summary still shows.
  }
};

const seconds = (ms: number) => (ms / 1000).toFixed(1);

type Props = {
  initialSets: FunniestSet[];
  setCount: number;
};

/**
 * Time-boxed prototype (Iteration 3, item 7): show two or three captions for
 * the same image and ask which is funniest. Picks stay in this browser and are
 * NOT recorded as votes, so the experiment cannot skew real scores.
 */
export default function FunniestExperimentClient({ initialSets, setCount }: Props) {
  const { toast } = useToast();
  const [sets, setSets] = useState(initialSets);
  const [index, setIndex] = useState(0);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [runCount, setRunCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const shownAt = useRef(0);
  // Latest index and picks, so a click on a card that is still animating out
  // cannot record against the wrong image or overwrite a newer pick.
  const indexRef = useRef(0);
  const picksRef = useRef<Pick[]>([]);

  const current = sets[index];
  const finished = !current && picks.length > 0;

  useEffect(() => {
    shownAt.current = performance.now();
  }, [index, sets]);

  useEffect(() => {
    setRunCount(loadRuns().length);
  }, []);

  const choose = useCallback(
    (imageId: string, captionId: string | null) => {
      const set = sets[indexRef.current];
      if (!set || set.imageId !== imageId) return;
      const picked = set.captions.find((c) => c.id === captionId) ?? null;
      const pick: Pick = {
        imageId: set.imageId,
        shownCaptionIds: set.captions.map((c) => c.id),
        pickedCaptionId: picked?.id ?? null,
        pickedContent: picked?.content ?? null,
        ms: Math.round(performance.now() - shownAt.current),
      };
      picksRef.current = [...picksRef.current, pick];
      indexRef.current += 1;
      setPicks(picksRef.current);
      setIndex(indexRef.current);
      if (indexRef.current >= sets.length) {
        saveRun({ finishedAt: new Date().toISOString(), picks: picksRef.current });
        setRunCount((n) => n + 1);
      }
    },
    [sets]
  );

  // Keys 1–3 pick a caption, → means none stood out.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!current) return;
      const n = Number(event.key);
      if (n >= 1 && n <= current.captions.length) {
        event.preventDefault();
        choose(current.imageId, current.captions[n - 1].id);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        choose(current.imageId, null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [current, choose]);

  const startAgain = async () => {
    setIsLoading(true);
    try {
      const next = await fetchFunniestSetsAction(setCount, 3);
      indexRef.current = 0;
      picksRef.current = [];
      setSets(next);
      setIndex(0);
      setPicks([]);
    } catch (error) {
      console.error("Could not load a new experiment set:", error);
      toast({ title: "Error", description: "Couldn't load new images. Please try again." });
    } finally {
      setIsLoading(false);
    }
  };

  const copyResults = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(loadRuns(), null, 2));
      toast({
        title: "Copied",
        description: "All experiment runs from this browser are on your clipboard.",
      });
    } catch {
      toast({ title: "Couldn't copy", description: "Your browser blocked clipboard access." });
    }
  };

  const decided = picks.filter((p) => p.pickedCaptionId !== null);
  const totalMs = picks.reduce((sum, p) => sum + p.ms, 0);
  const captionsRead = picks.reduce((sum, p) => sum + p.shownCaptionIds.length, 0);

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
      <div className="container mx-auto px-4 py-6 sm:py-10 max-w-2xl">
        <div className="mb-5">
          <span
            className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-0.5
                       text-xs font-medium text-primary"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Experiment
          </span>
          <h1 className="mt-2 text-3xl sm:text-4xl font-bold tracking-tight">Which is funniest?</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {`${setCount} images, a few captions each. Pick the one that made you laugh. ` +
              "Picks here stay in this browser and don't count as votes."}
          </p>
        </div>

        {current ? (
          <div>
            <p className="mb-2 text-xs text-muted-foreground" aria-live="polite">
              Image {index + 1} of {sets.length}
            </p>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={current.imageId}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.2 }}
                className="rounded-2xl overflow-hidden border border-gray-200
                           dark:border-gray-700/50 bg-white dark:bg-[#1a1a1a]"
              >
                <div className="relative w-full aspect-[4/3]">
                  <Top100CaptionImage src={current.imageUrl} captionId={current.imageId} />
                </div>
                <div className="p-3 space-y-2">
                  {current.captions.map((caption, i) => (
                    <button
                      key={caption.id}
                      type="button"
                      onClick={() => choose(current.imageId, caption.id)}
                      className="w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left
                                 bg-gray-50 dark:bg-neutral-800 hover:bg-primary/10
                                 hover:text-primary transition-colors"
                    >
                      <kbd
                        className="mt-0.5 flex items-center justify-center w-6 h-6 shrink-0
                                   rounded-md border border-[#666363] text-xs
                                   text-muted-foreground"
                      >
                        {i + 1}
                      </kbd>
                      <span className="text-sm sm:text-base leading-snug">{caption.content}</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => choose(current.imageId, null)}
                    className="w-full flex items-center justify-center gap-2 rounded-xl py-2.5
                               text-sm text-muted-foreground hover:bg-gray-100
                               dark:hover:bg-neutral-700 transition-colors"
                  >
                    <SkipForward className="w-4 h-4" />
                    None stand out
                    <kbd className="text-[10px] hidden sm:inline">→</kbd>
                  </button>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        ) : finished ? (
          <div className="bg-gray-50 dark:bg-neutral-800 rounded-2xl p-6 sm:p-8 space-y-5">
            <div>
              <h2 className="text-2xl font-bold">Thanks, that&apos;s the set</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Results from this run. They&apos;re saved in this browser ({runCount} run
                {runCount === 1 ? "" : "s"} so far) for the experiment report.
              </p>
            </div>
            <dl className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-white dark:bg-neutral-900 p-3">
                <dt className="text-xs text-muted-foreground">Picked a favourite</dt>
                <dd className="text-xl font-bold">
                  {decided.length}/{picks.length}
                </dd>
              </div>
              <div className="rounded-xl bg-white dark:bg-neutral-900 p-3">
                <dt className="text-xs text-muted-foreground">Seconds per image</dt>
                <dd className="text-xl font-bold">{seconds(totalMs / picks.length)}</dd>
              </div>
              <div className="rounded-xl bg-white dark:bg-neutral-900 p-3">
                <dt className="text-xs text-muted-foreground">Seconds per caption</dt>
                <dd className="text-xl font-bold">
                  {seconds(totalMs / Math.max(1, captionsRead))}
                </dd>
              </div>
            </dl>
            <ol className="space-y-2 text-sm">
              {picks.map((p, i) => (
                <li key={p.imageId} className="flex gap-2">
                  <span className="text-muted-foreground">{i + 1}.</span>
                  <span className="flex-1">
                    {p.pickedContent ?? <em className="text-muted-foreground">None stood out</em>}
                  </span>
                  <span className="text-muted-foreground">{seconds(p.ms)}s</span>
                </li>
              ))}
            </ol>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void startAgain()}
                disabled={isLoading}
                className="px-4 py-2 rounded-full bg-primary text-white text-sm font-medium
                           hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? "Loading…" : "Try another set"}
              </button>
              <button
                type="button"
                onClick={() => void copyResults()}
                className="px-4 py-2 rounded-full border border-[#666363] text-sm font-medium
                           hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
              >
                Copy results
              </button>
              <Link
                href="/fresh"
                className="px-4 py-2 rounded-full border border-[#666363] text-sm font-medium
                           hover:bg-gray-100 dark:hover:bg-neutral-700 transition-colors"
              >
                Back to Fresh
              </Link>
            </div>
          </div>
        ) : (
          <div className="bg-gray-50 dark:bg-neutral-800 rounded-2xl p-8 text-center space-y-3">
            <p className="text-muted-foreground">
              Couldn&apos;t find images with several captions right now.
            </p>
            <button
              type="button"
              onClick={() => void startAgain()}
              disabled={isLoading}
              className="px-4 py-2 rounded-full bg-primary text-white text-sm font-medium
                         hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
