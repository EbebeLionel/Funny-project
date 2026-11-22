"use server";

import { createClient } from "@/utils/supabase/server";

export type FunniestSet = {
  imageId: string;
  imageUrl: string;
  captions: { id: string; content: string }[];
};

const POOL_SIZE = 600;
const ATTEMPTS = 3;

type ImageRelation = { url: string | null; is_public: boolean | null };
type Row = {
  id: string;
  content: string | null;
  image_id: string;
  images: ImageRelation | ImageRelation[] | null;
};

const imageOf = (row: Row): ImageRelation | null =>
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
 * Prototype for the "which is funniest?" experiment (Iteration 3, item 7).
 * Picks `count` public images that each have at least two public captions and
 * returns up to `perSet` of those captions per image. Read only.
 */
export const fetchFunniestSetsAction = async (
  count = 5,
  perSet = 3
): Promise<FunniestSet[]> => {
  const supabase = await createClient();

  const baseQuery = () =>
    supabase
      .from("captions")
      .select("id, content, image_id, images!inner ( url, is_public )", { count: "exact" })
      .eq("is_public", true)
      .eq("images.is_public", true)
      .not("images.url", "is", null)
      .not("content", "is", null);

  const { count: total, error: countError } = await baseQuery().limit(0).range(0, 0);
  if (countError) {
    console.error("Error counting captions for experiment:", countError);
    throw new Error("Failed to load the experiment");
  }
  const pages = Math.max(1, Math.ceil((total ?? 0) / POOL_SIZE));

  const sets = new Map<string, FunniestSet>();
  for (let attempt = 0; attempt < ATTEMPTS && sets.size < count; attempt += 1) {
    const from = Math.floor(Math.random() * pages) * POOL_SIZE;
    const { data, error } = await baseQuery()
      .order("created_datetime_utc", { ascending: false })
      .range(from, from + POOL_SIZE - 1);
    if (error) {
      console.error("Error loading captions for experiment:", error);
      throw new Error("Failed to load the experiment");
    }

    const byImage = new Map<string, Row[]>();
    for (const row of (data ?? []) as unknown as Row[]) {
      if (!row.content?.trim() || !imageOf(row)?.url) continue;
      const list = byImage.get(row.image_id) ?? [];
      list.push(row);
      byImage.set(row.image_id, list);
    }

    const candidates = shuffle(
      Array.from(byImage.entries()).filter(
        ([imageId, rows]) => rows.length >= 2 && !sets.has(imageId)
      )
    );
    // Prefer images with a full set of captions.
    candidates.sort((a, b) => Math.min(b[1].length, perSet) - Math.min(a[1].length, perSet));

    for (const [imageId, rows] of candidates) {
      if (sets.size >= count) break;
      sets.set(imageId, {
        imageId,
        imageUrl: imageOf(rows[0])?.url ?? "",
        captions: shuffle(rows)
          .slice(0, perSet)
          .map((r) => ({ id: r.id, content: r.content ?? "" })),
      });
    }
  }

  return Array.from(sets.values());
};
