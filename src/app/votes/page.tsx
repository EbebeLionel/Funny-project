import { redirect } from "next/navigation";

/**
 * The separate Votes page was replaced by "Your recent votes" on Top 100
 * (Past Week / Past Month). Keep old links working.
 */
export default function VotesPage() {
  redirect("/top-100/past-week");
}
