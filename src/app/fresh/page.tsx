import type { Metadata } from "next";
import { fetchFreshCaptionsAction } from "@/app/actions/captions/fetch-fresh-captions-action";
import { checkAuthStatusAction } from "@/app/actions/auth/check-auth-status";
import FreshFeedClient from "@/components/fresh-feed-client";

export const metadata: Metadata = {
  title: "Fresh captions",
  description: "Rate captions nobody has voted on yet.",
};

export const dynamic = "force-dynamic";

export default async function FreshPage() {
  const [captions, auth] = await Promise.all([
    fetchFreshCaptionsAction(20),
    checkAuthStatusAction(),
  ]);

  return (
    <FreshFeedClient
      initialCaptions={captions}
      initialIsAuthenticated={auth.isAuthenticated && !auth.isAnonymous}
    />
  );
}
