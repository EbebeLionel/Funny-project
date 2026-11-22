import type { Metadata } from "next";
import { fetchFunniestSetsAction } from "@/app/actions/captions/fetch-funniest-sets-action";
import FunniestExperimentClient from "@/components/funniest-experiment-client";

export const metadata: Metadata = {
  title: "Which is funniest? (experiment)",
  description: "Prototype: pick the funniest of a few captions for the same image.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Number of images in one experiment run. */
const SET_COUNT = 5;

export default async function FunniestExperimentPage() {
  const sets = await fetchFunniestSetsAction(SET_COUNT, 3);
  return <FunniestExperimentClient initialSets={sets} setCount={SET_COUNT} />;
}
