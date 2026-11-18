"use server";

import { createClient } from "@/utils/supabase/server";

export type MyVote = {
  captionId: string;
  content: string;
  imageUrl: string | null;
  vote: 1 | -1;
  /** Current net score, maintained by the database trigger. */
  score: number;
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

/**
 * The signed-in user's caption votes, most recent first.
 *
 * Changing a vote deletes the old row and inserts a new one, so
 * `created_datetime_utc` is the time of the user's latest vote on that caption.
 */
export const fetchMyVotesAction = async (
  offset = 0,
  limit = 20
): Promise<MyVotesPage> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("User not found.");
  }

  const { data, error, count } = await supabase
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
    .eq("profile_id", user.id)
    .order("created_datetime_utc", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Error fetching user's votes:", error);
    throw new Error("Failed to fetch your votes");
  }

  const rows = (data ?? []) as unknown as VoteRow[];
  const votes: MyVote[] = [];
  for (const row of rows) {
    const caption = one(row.captions);
    const value = Number(row.vote_value);
    // Skip captions the user can no longer read (deleted or made private).
    if (!caption || (value !== 1 && value !== -1)) continue;
    votes.push({
      captionId: caption.id,
      content: caption.content ?? "",
      imageUrl: one(caption.images)?.url ?? null,
      vote: value as 1 | -1,
      score: caption.like_count ?? 0,
      votedAt: row.created_datetime_utc,
    });
  }

  const total = count ?? 0;
  return { votes, total, hasMore: offset + rows.length < total };
};
