"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchPopularCaptionsAction } from "@/app/actions/captions/fetch-popular-captions-action";
import {
  toggleCaptionVoteAction,
  fetchUserCaptionVotesAction,
  insertSaveAction,
  deleteSaveAction,
  fetchSavedCaptionsAction,
} from "@/app/actions/captions";
import { useToast } from "@/hooks/use-toast";
import ShareModal from "@/components/share-modal";
import { IconChevronDown } from "@tabler/icons-react";
import { CaptionGridSkeleton } from "@/components/ui/image-grid-skeleton";
import { useRouter } from "next/navigation";
import { LoginPromptModal } from "@/components/ui/login-prompt-modal";
import { checkAuthStatusAction } from "@/app/actions/auth/check-auth-status";
import Link from "next/link";
import { ChevronUp, ChevronDown } from "lucide-react";
import { buildCaptionShareUrl } from "@/utils/site-url";
import { BrandImage } from "@/components/brand-image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { CaptionModal } from "@/components/ui/caption-modal";
import { BookmarkButton } from "@/components/ui/bookmark-button";
import { Top100CaptionImage } from "@/components/top-100-caption-image";
import { fetchMyVotesAction } from "@/app/actions/captions/fetch-my-votes-action";
import { fetchCaptionScoreAction } from "@/app/actions/captions/fetch-fresh-captions-action";

// functions to load in our pregenrated thumbnails
const THUMBNAIL_SIZES = [320, 480, 640, 750, 828, 1080, 1200, 1920, 2048, 3840] as const;

const parseImageUrl = (url: string) => {
  // expects: https://images.domain.com/<userId>/<imageId>.<ext>
  const match = url.match(/https?:\/\/[^\/]+\/([^\/]+)\/([^\/\?]+)\.([^\/\?\s]+)/);
  if (match) {
    const [, userId, imageId, extension] = match;
    return { userId, imageId, extension };
  }
  return null;
};

const generateThumbnailUrls = (
  baseUrl: string,
  userId: string,
  imageId: string,
  extension: string
) => {
  const basePath = `${baseUrl}/${userId}/${imageId}`;
  return {
    original: `${basePath}.${extension}`,
    srcSet: THUMBNAIL_SIZES.map((size) => `${basePath}-${size}.${extension} ${size}w`).join(", "),
    gridUrl: `${basePath}-${THUMBNAIL_SIZES.find((s) => s >= 640) || 640}.${extension}`,
    blurUrl: `${basePath}-640.${extension}`,
  };
};

type PopularCaption = {
  id: string;
  content: string;
  image_url: string;
  like_count: number;
  is_common_use: boolean;
  created_at: string;
};

type PopularCaptionsFilter = "all" | "year" | "past30" | "week";

interface PopularCaptionsPageClientProps {
  initialFilter?: PopularCaptionsFilter;
  pastWeekHref?: string;
  pastMonthHref?: string;
  pastYearHref?: string;
  allTimeHref?: string;
  initialCaptions?: PopularCaption[];
  initialUserVotes?: Record<string, 1 | -1 | null>;
  initialIsAuthenticated?: boolean;
}

const filterOptions: Array<{ key: PopularCaptionsFilter; label: string }> = [
  { key: "week", label: "Past Week" },
  { key: "past30", label: "Past Month" },
  { key: "year", label: "Past Year" },
  { key: "all", label: "All Time" },
];

type CardCaption = Pick<PopularCaption, "id" | "content" | "image_url" | "like_count">;

/** A caption the user voted on recently; `vote` is null after they remove it. */
type RecentVote = CardCaption & { vote: 1 | -1 | null };

/** Recent votes loaded per page: two rows of the widest grid. */
const RECENT_PAGE_SIZE = 8;

type Top100CardProps = {
  caption: CardCaption;
  vote: 1 | -1 | null;
  saved: boolean;
  highlighted?: boolean;
  domId?: string;
  onOpen: () => void;
  onVote: (value: 1 | -1) => void;
  onSave: () => void;
};

/** The Top 100 caption card, shared by the ranked grid and "Your recent votes". */
function Top100Card({
  caption,
  vote,
  saved,
  highlighted = false,
  domId,
  onOpen,
  onVote,
  onSave,
}: Top100CardProps) {
  // generate our thumbnail urls
  const info = parseImageUrl(caption.image_url);
  let displayUrl = caption.image_url;
  let srcSet: string | undefined;
  if (info) {
    const baseUrl = caption.image_url.split("/").slice(0, 3).join("/");
    const t = generateThumbnailUrls(baseUrl, info.userId, info.imageId, info.extension);
    displayUrl = t.gridUrl;
    srcSet = t.srcSet;
  }

  const shareUrl = buildCaptionShareUrl(caption.id);
  const isUpvoted = vote === 1;
  const isDownvoted = vote === -1;

  return (
    <div
      id={domId}
      className={`relative cursor-pointer group w-full h-full flex scroll-mt-24 rounded-lg
        transition-shadow duration-500 ${
          highlighted ? "ring-4 ring-primary ring-offset-2 ring-offset-background" : ""
        }`}
      onClick={onOpen}
    >
      <div
        className="relative bg-white dark:bg-[#1a1a1a] rounded-lg overflow-hidden
               shadow-md dark:shadow-lg ring-1 ring-gray-200 dark:ring-0
               hover:shadow-xl transition-all duration-300 flex flex-col w-full
               sm:max-w-[320px] sm:mx-auto"
      >
        {/* Top Section - Branding */}
        <div className="p-3 flex justify-between items-center">
          {/* Left: Crackd branding */}
          <div className="flex items-center gap-2">
            <BrandImage variant="mark" alt="Crackd" className="w-6 h-6" />
            <span className="text-primary text-sm font-bold">Crackd</span>
          </div>

          {/* Right: Upvote/Downvote counter */}
          <TooltipProvider>
            <div className="flex flex-col items-center gap-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onVote(1);
                    }}
                    className={`cursor-pointer transition-colors ${
                      isUpvoted
                        ? "text-primary"
                        : "text-gray-500 dark:text-gray-400 hover:text-primary"
                    }`}
                  >
                    <ChevronUp className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="left"
                  className="bg-white text-gray-900 border border-gray-200
                             dark:bg-[#2a2a2a] dark:text-white
                             dark:border-gray-700/50"
                >
                  <p>Upvote</p>
                </TooltipContent>
              </Tooltip>
              <span className="text-gray-900 dark:text-white text-sm font-medium">
                {caption.like_count}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      onVote(-1);
                    }}
                    className={`cursor-pointer transition-colors ${
                      isDownvoted
                        ? "text-primary"
                        : "text-gray-500 dark:text-gray-400 hover:text-primary"
                    }`}
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="left"
                  className="bg-white text-gray-900 border border-gray-200
                             dark:bg-[#2a2a2a] dark:text-white
                             dark:border-gray-700/50"
                >
                  <p>Downvote</p>
                </TooltipContent>
              </Tooltip>
            </div>
          </TooltipProvider>
        </div>

        {/* Caption Text - Below header */}
        <div className="px-3 pb-3">
          <p
            className="text-gray-900 dark:text-white text-base leading-relaxed
                       font-medium"
          >
            {caption.content}
          </p>
        </div>

        {/* Main Image */}
        <div className="w-full flex-1 min-h-[320px] px-3 pb-3">
          <Top100CaptionImage src={displayUrl} srcSet={srcSet} captionId={caption.id} />
        </div>

        {/* Bottom Action Bar */}
        <div
          className="p-3 bg-gray-50 dark:bg-[#1a1a1a] border-t border-gray-200
                     dark:border-white/10"
        >
          <div className="flex items-center justify-between">
            <div
              className="p-2 text-gray-600 dark:text-white hover:bg-gray-200/70
                          dark:hover:bg-white/10 rounded transition-colors flex
                          items-center justify-center"
              onClick={(event) => event.stopPropagation()}
            >
              <BookmarkButton bookmarked={saved} onClick={onSave} size={20} />
            </div>
            <div
              className="p-2 hover:bg-gray-200/70 dark:hover:bg-white/10 rounded
                          transition-colors flex items-center justify-center"
              onClick={(event) => event.stopPropagation()}
            >
              <ShareModal shareUrl={shareUrl} buttonClassName="text-gray-600 dark:text-white" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PopularCaptionsPageClient({
  initialFilter = "week",
  pastWeekHref,
  pastMonthHref,
  pastYearHref,
  allTimeHref,
  initialCaptions = [],
  initialUserVotes = {},
  initialIsAuthenticated = false,
}: PopularCaptionsPageClientProps) {
  const [popularCaptions, setPopularCaptions] = useState<PopularCaption[]>(initialCaptions);
  const [userVotes, setUserVotes] = useState<Record<string, 1 | -1 | null>>(initialUserVotes);
  const [isLoading, setIsLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [itemsPerPage, setItemsPerPage] = useState(8);
  const [visibleCount, setVisibleCount] = useState(8);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const { toast } = useToast();
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(initialIsAuthenticated);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [savedCaptions, setSavedCaptions] = useState<string[]>([]);
  const isFirstLoad = useRef(true);

  const [filter, setFilter] = useState<PopularCaptionsFilter>(initialFilter);
  const filterHrefs: Partial<Record<PopularCaptionsFilter, string>> = {
    week: pastWeekHref,
    past30: pastMonthHref,
    year: pastYearHref,
    all: allTimeHref,
  };

  // "Your recent votes" (PM feedback: show them here rather than on a separate
  // page). Filtered by when the user voted, not when the caption was created.
  const recentVotesPeriod =
    filter === "week"
      ? { days: 7, label: "in the past week" }
      : filter === "past30"
        ? { days: 30, label: "in the past month" }
        : null;
  const recentDays = recentVotesPeriod?.days;
  const [recentVotes, setRecentVotes] = useState<RecentVote[]>([]);
  const [recentTotal, setRecentTotal] = useState(0);
  const [recentHasMore, setRecentHasMore] = useState(false);
  const [recentOffset, setRecentOffset] = useState(0);
  const [recentLoading, setRecentLoading] = useState(false);
  // Which list the caption viewer is stepping through.
  const [modalSource, setModalSource] = useState<"ranked" | "recent">("ranked");

  const loadRecentVotes = useCallback(
    async (from: number) => {
      if (recentDays === undefined) return;
      setRecentLoading(true);
      try {
        const page = await fetchMyVotesAction(from, RECENT_PAGE_SIZE, recentDays);
        const items: RecentVote[] = page.votes.map((v) => ({
          id: v.captionId,
          content: v.content,
          image_url: v.imageUrl ?? "",
          like_count: v.score,
          vote: v.vote,
        }));
        setRecentVotes((prev) => {
          const base = from === 0 ? [] : prev;
          const seen = new Set(base.map((v) => v.id));
          return [...base, ...items.filter((v) => !seen.has(v.id))];
        });
        setRecentTotal(page.total);
        setRecentHasMore(page.hasMore);
        setRecentOffset(from + RECENT_PAGE_SIZE);
      } catch (error) {
        console.error("Error loading recent votes:", error);
        toast({ title: "Error", description: "Couldn't load your recent votes." });
      } finally {
        setRecentLoading(false);
      }
    },
    [recentDays, toast]
  );

  useEffect(() => {
    setRecentVotes([]);
    setRecentTotal(0);
    setRecentHasMore(false);
    if (isAuthenticated && recentDays !== undefined) void loadRecentVotes(0);
  }, [isAuthenticated, recentDays, loadRecentVotes]);

  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      return;
    }

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const captions = await fetchPopularCaptionsAction(100, filter);
        const auth = await checkAuthStatusAction();
        setIsAuthenticated(auth.isAuthenticated && !auth.isAnonymous);
        setPopularCaptions(captions);

        // Fetch user votes if authenticated
        if (auth.isAuthenticated && !auth.isAnonymous && captions.length > 0) {
          const captionIds = captions.map((c) => c.id);
          const votes = await fetchUserCaptionVotesAction(captionIds);
          console.log("Fetched user votes:", votes); // Debug log
          setUserVotes(votes);
          const saved = await fetchSavedCaptionsAction();
          setSavedCaptions(saved.map((caption) => caption.id));
        } else {
          // Clear votes if not authenticated
          setUserVotes({});
          setSavedCaptions([]);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          title: "Error",
          description: "Failed to load captions",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [toast, filter]);

  useEffect(() => {
    const fetchSavedCaptions = async () => {
      if (!isAuthenticated) {
        setSavedCaptions([]);
        return;
      }

      try {
        const saved = await fetchSavedCaptionsAction();
        setSavedCaptions(saved.map((caption) => caption.id));
      } catch (error) {
        console.error("Error fetching saved captions:", error);
        setSavedCaptions([]);
      }
    };

    fetchSavedCaptions();
  }, [isAuthenticated]);

  // Deep link from "Your votes": /top-100/all-time#caption-<id> reveals that
  // caption's spot (loading enough pages to include it), scrolls to it and
  // highlights it.
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  useEffect(() => {
    let scroll: number | undefined;
    let rescroll: number | undefined;
    let clear: number | undefined;
    const reveal = () => {
      const match = window.location.hash.match(/^#caption-(.+)$/);
      if (!match) return;
      const targetId = decodeURIComponent(match[1]);
      const position = popularCaptions.findIndex((c) => c.id === targetId);
      if (position === -1) return;
      setVisibleCount((count) =>
        Math.max(count, Math.ceil((position + 1) / itemsPerPage) * itemsPerPage)
      );
      setHighlightedId(targetId);
      window.clearTimeout(scroll);
      window.clearTimeout(rescroll);
      window.clearTimeout(clear);
      const scrollToTarget = (behavior: ScrollBehavior) =>
        document
          .getElementById(`caption-${targetId}`)
          ?.scrollIntoView({ behavior, block: "center" });
      // Wait for the extra cards to render, then scroll again once images
      // above it have loaded and shifted the layout.
      scroll = window.setTimeout(() => scrollToTarget("auto"), 150);
      rescroll = window.setTimeout(() => scrollToTarget("smooth"), 900);
      clear = window.setTimeout(() => setHighlightedId(null), 6000);
    };
    reveal();
    window.addEventListener("hashchange", reveal);
    return () => {
      window.removeEventListener("hashchange", reveal);
      window.clearTimeout(scroll);
      window.clearTimeout(rescroll);
      window.clearTimeout(clear);
    };
  }, [popularCaptions, itemsPerPage]);

  const handleVote = async (captionId: string, voteValue: 1 | -1) => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }

    const currentVote = userVotes[captionId] ?? null;
    const originalVote = currentVote;
    const originalCount = popularCaptions.find((c) => c.id === captionId)?.like_count || 0;

    // Optimistic update: determine new vote value
    let newVoteValue: 1 | -1 | null;
    if (currentVote === voteValue) {
      // If clicking the same vote, remove it
      newVoteValue = null;
    } else {
      // Otherwise, set the new vote
      newVoteValue = voteValue;
    }

    // Calculate optimistic count change
    let countChange = 0;
    if (originalVote === 1 && newVoteValue === null) {
      countChange = -1; // Removing upvote
    } else if (originalVote === -1 && newVoteValue === null) {
      countChange = 1; // Removing downvote
    } else if (originalVote === null && newVoteValue === 1) {
      countChange = 1; // Adding upvote
    } else if (originalVote === null && newVoteValue === -1) {
      countChange = -1; // Adding downvote
    } else if (originalVote === 1 && newVoteValue === -1) {
      countChange = -2; // Switching from upvote to downvote
    } else if (originalVote === -1 && newVoteValue === 1) {
      countChange = 2; // Switching from downvote to upvote
    }

    // Optimistic UI update
    setUserVotes((prev) => ({
      ...prev,
      [captionId]: newVoteValue,
    }));

    setPopularCaptions((prev) =>
      prev.map((caption) =>
        caption.id === captionId
          ? { ...caption, like_count: caption.like_count + countChange }
          : caption
      )
    );
    // Keep the same caption in "Your recent votes" in step.
    setRecentVotes((prev) =>
      prev.map((v) =>
        v.id === captionId
          ? { ...v, vote: newVoteValue, like_count: originalCount + countChange }
          : v
      )
    );

    try {
      await toggleCaptionVoteAction(captionId, voteValue);
    } catch (error) {
      console.error("Error updating vote:", error);
      // Revert optimistic update
      setUserVotes((prev) => ({
        ...prev,
        [captionId]: originalVote,
      }));
      setPopularCaptions((prev) =>
        prev.map((caption) =>
          caption.id === captionId
            ? { ...caption, like_count: originalCount }
            : caption
        )
      );
      setRecentVotes((prev) =>
        prev.map((v) =>
          v.id === captionId ? { ...v, vote: originalVote, like_count: originalCount } : v
        )
      );
      toast({
        title: "Error",
        description: "Failed to update vote",
      });
    }
  };

  const handleSlideSave = async (captionId: string) => {
    if (!isAuthenticated) {
      setShowLoginPrompt(true);
      return;
    }

    const originalState = savedCaptions;
    const isSaved = savedCaptions.includes(captionId);

    try {
      if (isSaved) {
        setSavedCaptions((prev) => prev.filter((id) => id !== captionId));
        await deleteSaveAction(captionId);
      } else {
        setSavedCaptions((prev) => [...prev, captionId]);
        await insertSaveAction(captionId);
      }
    } catch (error) {
      console.error("Error saving/unsaving caption:", error);
      setSavedCaptions(originalState);
      toast({
        title: "Error",
        description: "Failed to update favorite.",
      });
    }
  };

  /**
   * Vote on a card in "Your recent votes". Same toggle rule as the ranked
   * grid: the same arrow again removes the vote. The card stays in the list
   * until the page reloads so the vote can be put back.
   */
  const handleRecentVote = async (captionId: string, voteValue: 1 | -1) => {
    const item = recentVotes.find((v) => v.id === captionId);
    if (!item) return;
    const newVote = item.vote === voteValue ? null : voteValue;
    const estimate = item.like_count + (newVote ?? 0) - (item.vote ?? 0);
    const apply = (vote: 1 | -1 | null, score: number) => {
      setRecentVotes((prev) =>
        prev.map((v) => (v.id === captionId ? { ...v, vote, like_count: score } : v))
      );
      setUserVotes((prev) => (captionId in prev ? { ...prev, [captionId]: vote } : prev));
      setPopularCaptions((prev) =>
        prev.map((c) => (c.id === captionId ? { ...c, like_count: score } : c))
      );
    };

    apply(newVote, estimate);
    try {
      await toggleCaptionVoteAction(captionId, voteValue);
      setRecentTotal((t) => t + (item.vote === null ? 1 : 0) - (newVote === null ? 1 : 0));
      const score = await fetchCaptionScoreAction(captionId);
      if (score !== null) apply(newVote, score);
    } catch (error) {
      console.error("Error updating vote:", error);
      apply(item.vote, item.like_count);
      toast({ title: "Error", description: "Failed to update vote" });
    }
  };

  const handleImageClick = (index: number) => {
    setModalSource("ranked");
    setSelectedIndex(index);
  };

  const handleRecentClick = (index: number) => {
    setModalSource("recent");
    setSelectedIndex(index);
  };

  const handleCloseCarousel = () => {
    setSelectedIndex(null);
  };

  const modalLength = modalSource === "recent" ? recentVotes.length : popularCaptions.length;

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && selectedIndex !== null) {
        handleCloseCarousel();
      }
    };

    const handleArrowKeys = (event: KeyboardEvent) => {
      if (selectedIndex === null || modalLength === 0) return;

      if (event.key === "ArrowLeft") {
        setSelectedIndex((prev) => {
          if (prev === null) return null;
          return prev === 0 ? modalLength - 1 : prev - 1;
        });
      } else if (event.key === "ArrowRight") {
        setSelectedIndex((prev) => {
          if (prev === null) return null;
          return prev === modalLength - 1 ? 0 : prev + 1;
        });
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.addEventListener("keydown", handleArrowKeys);
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.removeEventListener("keydown", handleArrowKeys);
    };
  }, [selectedIndex, modalLength]);

  const loadMore = () => {
    setVisibleCount((prev) => prev + itemsPerPage);
  };

  const handleItemsPerPageChange = (value: string) => {
    const newValue = parseInt(value);
    setItemsPerPage(newValue);
    setVisibleCount(newValue);
  };

  const visibleCaptions = popularCaptions.slice(0, visibleCount);
  const hasMore = visibleCount < popularCaptions.length;
  const modalItems: CardCaption[] = modalSource === "recent" ? recentVotes : popularCaptions;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4">
        <div
          className="flex justify-center mb-8 relative"
          style={{ height: "44px" }}
        >
          <div
            className="relative flex justify-between w-full max-w-[470px] 
                        h-[36px] sm:h-[44px] bg-transparent rounded-3xl mx-auto
                        border border-[#666363] overflow-hidden"
          >
            <div
              className={[
                "absolute inset-y-0 left-0 w-1/4 rounded-[16px]",
                "bg-gray-500/20 animate-skeleton",
              ].join(" ")}
            />
            {/* Filter buttons skeleton */}
            <div className="w-full flex relative z-10">
              {filterOptions.map(({ label }) => (
                <div key={label} className="w-1/4 flex items-center justify-center">
                  <div className="h-4 w-16 bg-gray-400 rounded animate-skeleton" />
                </div>
              ))}
            </div>
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="absolute top-0 bottom-0 w-[2px] bg-[#666363]"
                style={{ left: `${i * 25}%` }}
              />
            ))}
          </div>
        </div>
        <CaptionGridSkeleton count={8} />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-1 py-1">
      {/* Mobile-only Get Crackd Box */}
      <div className="block sm:hidden w-full mb-8">
        <div
          className="bg-gray-50 dark:bg-neutral-800 rounded-2xl p-8 flex
                      flex-col items-center justify-center"
        >
          <div className="relative w-24 h-24 mb-4">
            <BrandImage variant="mark" alt="Crackd Logo" className="w-full h-full" />
          </div>
          <h2
            className="text-gray-900 dark:text-white text-4xl font-bold
                        tracking-tight scale-y-150"
          >
            GET CRACKD
          </h2>
        </div>
      </div>

      <div className="flex justify-center mb-8 relative" style={{ height: "44px" }}>
        <div
          className="relative flex justify-between w-full max-w-[470px] h-[36px] sm:h-[44px] 
                      bg-transparent rounded-3xl mx-auto border border-[#666363] overflow-hidden"
        >
          {/* Primary Slider */}
          <div
            className={`absolute top-0 left-0 h-[36px] sm:h-[44px] w-1/4 rounded-[16px] 
              bg-primary dark:bg-primary/40
                       transition-all duration-300 ${
                        filter === "week"
                          ? "rounded-l-3xl rounded-r-none"
                          : filter === "all"
                          ? "rounded-r-3xl rounded-l-none"
                          : "rounded-none"
                      }`}
            style={{
              transform: `translateX(${(
                filter === "week" ? 0 :
                filter === "past30" ? 100 :
                filter === "year" ? 200 : 300
              )}%)`,
            }}
          />

          {/* Buttons */}
          {filterOptions.map(({ key, label }) => {
            const isActive = filter === key;
            const className = `relative w-1/4 h-full flex items-center justify-center
                          text-xs sm:text-sm md:text-base font-normal leading-[120%]
                          tracking-[-0.02em] z-10 transition-colors 
                          duration-200 ${
                            isActive
                              ? "text-white dark:text-white border-2 border-primary"
                              : "text-gray-800 dark:text-[#9A9A9A]"
                          } ${
                            key === "week"
                              ? "rounded-l-3xl rounded-r-none"
                              : key === "all"
                              ? "rounded-r-3xl rounded-l-none"
                              : "rounded-none"
                          }`;

            const href = filterHrefs[key];
            if (href) {
              return (
                <Link key={key} href={href} className={className}>
                  {label}
                </Link>
              );
            }

            return (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={className}
              >
                {label}
              </button>
            );
          })}

          {/* Vertical Borders */}
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="absolute top-0 bottom-0 w-[2px] bg-[#666363]"
              style={{ left: `${i * 25}%` }}
            />
          ))}
        </div>
      </div>

      {/* The user's own recent votes (PM feedback: show them here rather than
          on a separate page). Filtered by when they voted, not by when the
          caption was created. */}
      {isAuthenticated && recentVotesPeriod && (
        <section
          id="your-votes"
          aria-labelledby="your-votes-heading"
          className="w-full max-w-7xl mx-auto px-4 mb-6 scroll-mt-24"
        >
          <h2 id="your-votes-heading" className="text-xl sm:text-2xl font-bold tracking-tight">
            Your recent votes
          </h2>
          <p className="mt-1 mb-4 text-sm text-muted-foreground" aria-live="polite">
            {recentTotal > 0
              ? `${recentTotal} caption${recentTotal === 1 ? "" : "s"} you voted on ` +
                `${recentVotesPeriod.label}, newest first. Tap an arrow to change your ` +
                "vote, or tap it again to remove it."
              : `Captions you vote on ${recentVotesPeriod.label} show up here, newest first.`}
          </p>
          {recentLoading && recentVotes.length === 0 ? (
            <CaptionGridSkeleton count={4} />
          ) : recentVotes.length === 0 ? (
            <div
              className="bg-gray-50 dark:bg-neutral-800 rounded-2xl p-5 flex flex-col sm:flex-row
                         items-center gap-4 text-center sm:text-left"
            >
              <BrandImage variant="mark" alt="" className="w-10 h-10 shrink-0" />
              <p className="flex-1 text-sm text-muted-foreground">
                {`You haven't voted on any captions ${recentVotesPeriod.label}.`}
              </p>
              <Link
                href="/fresh"
                className="shrink-0 px-4 py-2 rounded-full bg-primary text-white text-sm
                           font-medium hover:bg-primary/90 transition-colors"
              >
                Rate captions in Fresh
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {recentVotes.map((caption, index) => (
                  <Top100Card
                    key={caption.id}
                    caption={caption}
                    vote={caption.vote}
                    saved={savedCaptions.includes(caption.id)}
                    onOpen={() => handleRecentClick(index)}
                    onVote={(value) => void handleRecentVote(caption.id, value)}
                    onSave={() => void handleSlideSave(caption.id)}
                  />
                ))}
              </div>
              {recentHasMore && (
                <div className="flex justify-center mt-8">
                  <button
                    onClick={() => void loadRecentVotes(recentOffset)}
                    disabled={recentLoading}
                    className="px-6 py-2 bg-primary/20 hover:bg-primary/30 text-primary
                               rounded-full transition-colors duration-200 disabled:opacity-50"
                  >
                    {recentLoading ? "Loading…" : "Load More"}
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <div className="flex-1 w-full flex flex-col gap-8 p-4 relative">
        <div className="flex justify-end items-center w-full max-w-7xl mx-auto px-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">Show</span>
              <div className="relative" ref={dropdownRef}>
                <button
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="flex items-center gap-2 bg-background/30 border border-primary/20
                            rounded-lg px-3 py-1.5 text-sm text-primary
                            hover:border-primary/40 transition-colors duration-200"
                >
                  {itemsPerPage}
                  <IconChevronDown className="w-4 h-4" />
                </button>
                {isDropdownOpen && (
                  <div
                    className="absolute right-0 mt-2 w-20 bg-background/90 border
                                  border-primary/20 rounded-lg shadow-lg overflow-hidden z-50"
                  >
                    {[4, 8, 12, 16, 20, 24].map((value) => (
                      <button
                        key={value}
                        onClick={() => {
                          handleItemsPerPageChange(value.toString());
                          setIsDropdownOpen(false);
                        }}
                        className="w-full px-3 py-2 text-sm text-primary hover:bg-primary/10
                                  transition-colors duration-200 text-left"
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <span className="text-sm text-muted-foreground">at a time</span>
            </div>
          </div>
        </div>
      {visibleCaptions.length === 0 ? (
        <p className="text-center text-gray-400 mt-12 text-lg">
          {recentVotesPeriod
            ? `No captions created ${recentVotesPeriod.label} have been voted up yet.`
            : "No captions found."}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {visibleCaptions.map((caption, index) => (
            <Top100Card
              key={caption.id}
              domId={`caption-${caption.id}`}
              caption={caption}
              vote={userVotes[caption.id] ?? null}
              saved={savedCaptions.includes(caption.id)}
              highlighted={highlightedId === caption.id}
              onOpen={() => handleImageClick(index)}
              onVote={(value) => void handleVote(caption.id, value)}
              onSave={() => void handleSlideSave(caption.id)}
            />
          ))}
        </div>
      )}
      {hasMore && (
              <div className="flex justify-center mt-8">
                <button
                  onClick={loadMore}
                  className="px-6 py-2 bg-primary/20 hover:bg-primary/30 text-primary
                             rounded-full transition-colors duration-200"
                >
                  Load More
                </button>
              </div>
            )}

      {/* Modal */}
      {selectedIndex !== null && modalItems.length > 0 && (
        <CaptionModal
          items={modalItems.map((caption) => ({
            id: caption.id,
            content: caption.content,
            imageUrl: caption.image_url,
          }))}
          currentIndex={selectedIndex}
          onClose={handleCloseCarousel}
          onIndexChange={(index) => setSelectedIndex(index)}
          savedCaptionIds={savedCaptions}
          onSave={handleSlideSave}
          wrapNavigation
        />
      )}
      
      {/* New Post button */}
      <div className="fixed bottom-16 left-1/2 -translate-x-1/2 z-40">
        <a
          href="/new"
          className="flex items-center justify-center w-48 h-12 rounded-full
                    bg-primary text-primary-foreground font-bold text-lg shadow-lg
                    hover:bg-primary/90 transition-colors duration-200
                    select-none"
        >
          New Post
        </a>
      </div>
      {/* Login Prompt Modal */}
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
