"use server";

import { createClient } from "@/utils/supabase/server";
import { fetchTop100RanksAction } from "./fetch-top-100-ranks-action";

export type RatingStats = {
  /** Votes cast today, in the user's local time zone. */
  today: number;
  /**
   * Consecutive days with at least one vote, counting back from today. If the
   * user has not voted yet today, the streak counts back from yesterday, so it
   * is still alive until midnight.
   */
  streak: number;
  /** True when `today` is above zero. */
  activeToday: boolean;
  /** Every caption the user has a vote on. */
  total: number;
};

/** Rows read per page, and the most pages read, when working out the streak. */
const PAGE = 1000;
const MAX_PAGES = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar day (YYYY-MM-DD) for a UTC time and a `getTimezoneOffset()` value. */
const localDay = (utcMs: number, tzOffsetMinutes: number) =>
  new Date(utcMs - tzOffsetMinutes * 60 * 1000).toISOString().slice(0, 10);

/**
 * Rating counters for the Fresh header, computed from `caption_votes` so they
 * survive a reload.
 *
 * Changing a vote deletes the old row and inserts a new one, and an undo
 * deletes the row, so every row is one caption the user currently has a vote
 * on, dated by the latest change.
 *
 * `tzOffsetMinutes` is the browser's `new Date().getTimezoneOffset()`, so
 * "today" matches the user's clock rather than the server's.
 */
export const fetchRatingStatsAction = async (
  tzOffsetMinutes = 0
): Promise<RatingStats | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const offset = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0;
  const now = Date.now();
  const todayKey = localDay(now, offset);

  // Newest first, so the days that matter for the streak come first.
  const days = new Set<string>();
  let total = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error, count } = await supabase
      .from("caption_votes")
      .select("created_datetime_utc", page === 0 ? { count: "exact" } : undefined)
      .eq("profile_id", user.id)
      .order("created_datetime_utc", { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);

    if (error) {
      console.error("Error fetching rating stats:", error);
      return null;
    }
    if (page === 0) total = count ?? data?.length ?? 0;
    data?.forEach((row) => days.add(localDay(Date.parse(row.created_datetime_utc), offset)));
    if (!data || data.length < PAGE) break;
  }

  let today = 0;
  if (days.has(todayKey)) {
    // Count today's rows exactly rather than relying on the paged sample.
    const startOfToday = Date.parse(`${todayKey}T00:00:00.000Z`) + offset * 60 * 1000;
    const { count, error } = await supabase
      .from("caption_votes")
      .select("caption_id", { count: "exact", head: true })
      .eq("profile_id", user.id)
      .gte("created_datetime_utc", new Date(startOfToday).toISOString());
    if (error) console.error("Error counting today's votes:", error);
    today = count ?? 0;
  }

  // Walk back one day at a time. Starting from yesterday when today is empty
  // keeps a streak alive until the user's midnight.
  let streak = 0;
  let cursor = today > 0 ? now : now - DAY_MS;
  while (days.has(localDay(cursor, offset))) {
    streak += 1;
    cursor -= DAY_MS;
  }

  return { today, streak, activeToday: today > 0, total };
};

export type Top100Win = {
  captionId: string;
  content: string;
  imageUrl: string | null;
  /** Position in the All Time Top 100. */
  rank: number;
};

type ImageRelation = { url: string | null };
type CaptionRelation = {
  content: string | null;
  images: ImageRelation | ImageRelation[] | null;
};
type WinRow = {
  caption_id: string;
  captions: CaptionRelation | CaptionRelation[] | null;
};

const one = <T,>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

/**
 * Captions the signed-in user upvoted that are in the All Time Top 100 now,
 * best rank first. The client decides which of them are news to the user.
 */
export const fetchTop100WinsAction = async (): Promise<Top100Win[]> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const ranks = await fetchTop100RanksAction();
  const ids = Object.keys(ranks);
  if (ids.length === 0) return [];

  const { data, error } = await supabase
    .from("caption_votes")
    .select("caption_id, captions ( content, images ( url ) )")
    .eq("profile_id", user.id)
    .eq("vote_value", 1)
    .in("caption_id", ids);

  if (error) {
    console.error("Error fetching Top 100 wins:", error);
    return [];
  }

  // One entry per caption, even if a duplicate vote row ever slips in.
  const rows = Array.from(
    new Map(((data ?? []) as unknown as WinRow[]).map((row) => [row.caption_id, row])).values()
  );
  return rows
    .map((row) => {
      const caption = one(row.captions);
      return {
        captionId: row.caption_id,
        content: caption?.content ?? "",
        imageUrl: one(caption?.images ?? null)?.url ?? null,
        rank: ranks[row.caption_id],
      };
    })
    .sort((a, b) => a.rank - b.rank);
};
