"use server";

import { createClient } from "@/utils/supabase/server";

/**
 * Rank (1-based) of every caption currently in the All Time Top 100.
 * Uses the same filters and ordering as `fetchPopularCaptionsAction(100, "all")`
 * but only reads ids.
 */
export const fetchTop100RanksAction = async (): Promise<Record<string, number>> => {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("captions")
    .select("id, images!inner ( is_public )")
    .eq("images.is_public", true)
    .eq("is_public", true)
    .gt("like_count", 0)
    .order("like_count", { ascending: false })
    .order("created_datetime_utc", { ascending: false })
    .limit(100);

  if (error) {
    console.error("Error fetching Top 100 ranks:", error);
    return {};
  }

  const ranks: Record<string, number> = {};
  (data ?? []).forEach((row, i) => {
    ranks[row.id] = i + 1;
  });
  return ranks;
};
