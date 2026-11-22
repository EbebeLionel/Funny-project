"use server";

import { createClient } from "@/utils/supabase/server";
import { fetchTop100RanksAction } from "./fetch-top-100-ranks-action";

export type MyVote = {
  captionId: string;
  content: string;
  imageUrl: string | null;
  vote: 1 | -1;
  /** Current net score, maintained by the database trigger. */
  score: number;
  /**
   * Net score just after the user's vote was counted, or null if it could not
   * be worked out.
   */
  scoreAtVote: number | null;
  /** Position in the All Time Top 100, or null if the caption is not in it. */
  top100Rank: number | null;
  votedAt: string;
};

export type MyVotesPage = {
  votes: MyVote[];
  /** Total number of captions the user has voted on. */
  total: number;
  hasMore: boolean;
};

type ImageRelation = { url: string | null };
type CaptionRelation = {
  id: string;
  content: string | null;
  like_count: number | null;
  images: ImageRelation | ImageRelation[] | null;
};
type VoteRow = {
  caption_id: string;
  vote_value: number;
  created_datetime_utc: string;
  captions: CaptionRelation | CaptionRelation[] | null;
};

// The generated types model these joins as arrays even though each is a single
// foreign key, so accept both shapes.
const one = <T,>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

/** Upper bound on later votes read per page when working out past scores. */
const LATER_VOTES_LIMIT = 10000;

/**
 * The signed-in user's caption votes, most recent first.
 *
 * Changing a vote deletes the old row and inserts a new one, so
 * `created_datetime_utc` is the time of the user's latest vote on that caption.
 *
 * `like_count` is kept equal to the sum of a caption's `caption_votes` rows by
 * a trigger, so the score at the time of the user's vote is the current score
 * minus every vote cast on that caption afterwards. A vote someone changed
 * later counts as cast at the time of the change, so this is a close estimate
 * rather than an exact history.
 *
 * `sinceDays` limits the list to votes cast in that many past days (by vote
 * time, not caption creation time).
 */
export const fetchMyVotesAction = async (
  offset = 0,
  limit = 20,
  sinceDays?: number
): Promise<MyVotesPage> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not found.");
  }

  let votesQuery = supabase
    .from("caption_votes")
    .select(
      `
      caption_id,
      vote_value,
      created_datetime_utc,
      captions (
        id,
        content,
        like_count,
        images ( url )
      )
    `,
      { count: "exact" }
    )
    .eq("profile_id", user.id);
  if (sinceDays !== undefined) {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    votesQuery = votesQuery.gte("created_datetime_utc", since.toISOString());
  }

  const [votesResult, ranks] = await Promise.all([
    votesQuery
      .order("created_datetime_utc", { ascending: false })
      .range(offset, offset + limit - 1),
    fetchTop100RanksAction(),
  ]);

  const { data, error, count } = votesResult;
  if (error) {
    console.error("Error fetching user's votes:", error);
    throw new Error("Failed to fetch your votes");
  }

  const rows = (data ?? []) as unknown as VoteRow[];

  // Sum of votes cast on each caption after the user's own vote.
  const laterSums = new Map<string, number>();
  let laterKnown = rows.length > 0;
  if (rows.length > 0) {
    const votedAt = new Map(rows.map((r) => [r.caption_id, r.created_datetime_utc]));
    const earliest = rows.reduce(
      (min, r) => (r.created_datetime_utc < min ? r.created_datetime_utc : min),
      rows[0].created_datetime_utc
    );
    const { data: later, error: laterError } = await supabase
      .from("caption_votes")
      .select("caption_id, vote_value, created_datetime_utc")
      .in("caption_id", Array.from(votedAt.keys()))
      .gt("created_datetime_utc", earliest)
      .limit(LATER_VOTES_LIMIT);

    if (laterError || (later?.length ?? 0) >= LATER_VOTES_LIMIT) {
      if (laterError) console.error("Error fetching later votes:", laterError);
      laterKnown = false;
    } else {
      later?.forEach((v) => {
        const mine = votedAt.get(v.caption_id);
        if (mine && v.created_datetime_utc > mine) {
          laterSums.set(v.caption_id, (laterSums.get(v.caption_id) ?? 0) + Number(v.vote_value));
        }
      });
    }
  }

  const votes: MyVote[] = [];
  for (const row of rows) {
    const caption = one(row.captions);
    const value = Number(row.vote_value);
    // Skip captions the user can no longer read (deleted or made private).
    if (!caption || (value !== 1 && value !== -1)) continue;
    const score = caption.like_count ?? 0;
    votes.push({
      captionId: caption.id,
      content: caption.content ?? "",
      imageUrl: one(caption.images)?.url ?? null,
      vote: value as 1 | -1,
      score,
      scoreAtVote: laterKnown ? score - (laterSums.get(caption.id) ?? 0) : null,
      top100Rank: ranks[caption.id] ?? null,
      votedAt: row.created_datetime_utc,
    });
  }

  const total = count ?? 0;
  return { votes, total, hasMore: offset + rows.length < total };
};
