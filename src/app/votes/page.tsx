import type { Metadata } from "next";
import Link from "next/link";
import { checkAuthStatusAction } from "@/app/actions/auth/check-auth-status";
import { fetchMyVotesAction } from "@/app/actions/captions/fetch-my-votes-action";
import VotesListClient from "@/components/votes-list-client";

export const metadata: Metadata = {
  title: "Your votes",
  description: "Every caption you have voted on, most recent first.",
};

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function VotesPage() {
  const auth = await checkAuthStatusAction();

  if (!auth.isAuthenticated || auth.isAnonymous) {
    return (
      <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-white">
        <div className="container mx-auto px-4 py-10 max-w-2xl text-center space-y-4">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Your votes</h1>
          <p className="text-muted-foreground">Log in to see the captions you&apos;ve voted on.</p>
          <Link
            href="/login"
            className="inline-block px-4 py-2 rounded-full bg-primary text-white text-sm font-medium
                       hover:bg-primary/90 transition-colors"
          >
            Log in
          </Link>
        </div>
      </div>
    );
  }

  const initial = await fetchMyVotesAction(0, PAGE_SIZE);

  return <VotesListClient initial={initial} pageSize={PAGE_SIZE} />;
}
