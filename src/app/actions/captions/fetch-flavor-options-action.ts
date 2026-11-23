"use server";

import { createClient } from "@/utils/supabase/server";

export type FlavorOption = {
  id: number;
  /** Display name made from the flavor's slug, e.g. "Inside My Head". */
  name: string;
};

/** Rows read per page, and the most pages read, when counting captions per flavor. */
const PAGE = 1000;
const MAX_PAGES = 8;

/**
 * Slugs that look like internal pipeline runs rather than a style a user would
 * pick: tests, experiments, copies, versions, step counts and dated runs.
 */
const INTERNAL_SLUG = /test|prod|experiment|copy|lifecycle|step|v\d|\d{2}/i;

const nameFromSlug = (slug: string) =>
  slug
    .replace(/^flavor-/i, "")
    .split(/[-_]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");

/**
 * Humor flavors to offer as Fresh feed filters: the user-facing ones with the
 * most public captions, so a filter is likely to have something left to rate.
 * PostgREST cannot group, so this counts caption rows page by page.
 */
export const fetchFlavorOptionsAction = async (limit = 6): Promise<FlavorOption[]> => {
  const supabase = await createClient();

  const counts = new Map<number, number>();
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const { data, error } = await supabase
      .from("captions")
      .select("humor_flavor_id, images!inner ( is_public )")
      .eq("is_public", true)
      .eq("images.is_public", true)
      .not("humor_flavor_id", "is", null)
      .order("id")
      .range(page * PAGE, page * PAGE + PAGE - 1);

    if (error) {
      console.error("Error counting caption flavors:", error);
      return [];
    }
    data?.forEach((row) => {
      if (row.humor_flavor_id !== null) {
        counts.set(row.humor_flavor_id, (counts.get(row.humor_flavor_id) ?? 0) + 1);
      }
    });
    if (!data || data.length < PAGE) break;
  }
  if (counts.size === 0) return [];

  const { data: flavors, error: flavorError } = await supabase
    .from("humor_flavors")
    .select("id, slug")
    .in("id", Array.from(counts.keys()));

  if (flavorError) {
    console.error("Error fetching humor flavors:", flavorError);
    return [];
  }

  return (flavors ?? [])
    .filter((f) => !INTERNAL_SLUG.test(f.slug))
    .sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0))
    .slice(0, limit)
    .map((f) => ({ id: f.id, name: nameFromSlug(f.slug) }));
};
