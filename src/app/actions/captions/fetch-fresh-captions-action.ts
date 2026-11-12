"use server";

import { createClient } from "@/utils/supabase/server";

export type FreshCaption = {
  id: string;
  content: string;
  image_id: string;
  image_url: string;
  like_count: number;
  created_at: string;
};

/** How many candidate rows to pull from the database per request. */
const POOL_SIZE = 300;
/**
 * `like_count` is a net score (upvotes minus downvotes); there is no separate
 * vote count. A score inside this band means almost nobody has judged the
 * caption yet, which is what "fresh" means here.
 */
const FRESH_SCORE_MIN = -1;
const FRESH_SCORE_MAX = 1;

type ImageRelation = { url: string | null; is_public: boolean | null };

type CandidateRow = {
  id: string;
  content: string | null;
  image_id: string;
  like_count: number;
  created_datetime_utc: string;
  // The generated Supabase types model this join as an array even though
  // captions.image_id is a single foreign key, so accept both shapes.
  images: ImageRelation | ImageRelation[] | null;
};

const imageOf = (row: CandidateRow): ImageRelation | null =>
  Array.isArray(row.images) ? (row.images[0] ?? null) : row.images;

const shuffle = <T,>(items: T[]) => {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

/**
 * Build a queue of public captions for the Fresh feed.
 *
 * - Leaves out captions the signed-in user has already voted on.
 * - Leaves out `excludeIds` (captions already shown in this session).
 * - Puts captions with few votes first, newest first within that, with some
 *   randomness so two people do not see the identical sequence.
 */
export const fetchFreshCaptionsAction = async (
  limit = 20,
  excludeIds: string[] = []
): Promise<FreshCaption[]> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const excluded = new Set(excludeIds);

  if (user) {
    const { data: votes, error: votesError } = await supabase
      .from("caption_votes")
      .select("caption_id")
      .eq("profile_id", user.id)
      .limit(5000);

    if (votesError) {
      console.error("Error fetching user votes for Fresh feed:", votesError);
    } else {
      votes?.forEach((vote) => {
        if (vote.caption_id) excluded.add(vote.caption_id);
      });
    }
  }

  const freshQuery = (nearZeroOnly: boolean) => {
    let query = supabase
      .from("captions")
      .select(
        `
        id,
        content,
        image_id,
        like_count,
        created_datetime_utc,
        images!inner (
          url,
          is_public
        )
      `,
        { count: "exact" }
      )
      .eq("is_public", true)
      .eq("images.is_public", true)
      .not("images.url", "is", null);
    if (nearZeroOnly) {
      query = query.gte("like_count", FRESH_SCORE_MIN).lte("like_count", FRESH_SCORE_MAX);
    }
    return query;
  };

  const loadPool = async (nearZeroOnly: boolean) => {
    // Count first so the random starting page is always inside the result set;
    // different sessions then see different captions.
    const { count, error: countError } = await freshQuery(nearZeroOnly)
      .limit(0)
      .range(0, 0);
    if (countError) {
      console.error("Error counting Fresh feed candidates:", countError);
      throw new Error("Failed to fetch fresh captions");
    }

    const total = count ?? 0;
    if (total === 0) return [];
    const pages = Math.max(1, Math.ceil(total / POOL_SIZE));
    const from = Math.floor(Math.random() * pages) * POOL_SIZE;

    const { data, error } = await freshQuery(nearZeroOnly)
      .order("created_datetime_utc", { ascending: false })
      .range(from, from + POOL_SIZE - 1);

    if (error) {
      console.error("Error fetching Fresh feed candidates:", error);
      throw new Error("Failed to fetch fresh captions");
    }
    return (data ?? []) as unknown as CandidateRow[];
  };

  // Prefer captions nobody has judged yet. If the user has worked through all
  // of those, widen to every public caption they have not voted on.
  let pool = await loadPool(true);
  if (pool.filter((row) => !excluded.has(row.id)).length === 0) {
    pool = await loadPool(false);
  }

  const candidates = pool
    .filter((row) => !excluded.has(row.id) && imageOf(row)?.url && row.content)
    .map((row) => ({
      id: row.id,
      content: row.content ?? "",
      image_id: row.image_id,
      image_url: imageOf(row)?.url ?? "",
      like_count: row.like_count ?? 0,
      created_at: row.created_datetime_utc,
    }));

  // Randomise, then bring the least-judged captions (score closest to zero) to
  // the front. Array.prototype.sort is stable, so the shuffled order survives
  // inside each bucket.
  const ordered = shuffle(candidates).sort(
    (a, b) => Math.abs(a.like_count) - Math.abs(b.like_count)
  );

  return ordered.slice(0, limit);
};

/**
 * Read a caption's current net score as maintained by the database trigger.
 * Used after a vote so the feed shows the real value rather than a local guess.
 */
export const fetchCaptionScoreAction = async (captionId: string): Promise<number | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("captions")
    .select("like_count")
    .eq("id", captionId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching caption score:", error);
    return null;
  }
  return data?.like_count ?? null;
};
