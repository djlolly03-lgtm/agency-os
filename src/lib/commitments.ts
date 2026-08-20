/**
 * Commitment rows — shared shape + parser for the review's forward plan.
 * Lives outside the "use client" component module because the review page
 * (a server component) also needs to parse stored commitments, and this
 * Next version refuses server calls into client-module exports.
 * Stored as a JSON array in review_notes under section "commitments".
 */
export interface Commitment {
  text: string;
  owner: string;
  due: string;      // free text: "5 Aug"
  proof: string;    // "proves itself when …"
  status: "" | "done" | "partial" | "missed";
}

export function parseCommitments(body: string | undefined | null): Commitment[] {
  if (!body) return [];
  try {
    const arr = JSON.parse(body) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr.map((c) => ({
      text: String((c as Commitment).text ?? ""),
      owner: String((c as Commitment).owner ?? ""),
      due: String((c as Commitment).due ?? ""),
      proof: String((c as Commitment).proof ?? ""),
      status: (["done", "partial", "missed"].includes(String((c as Commitment).status))
        ? (c as Commitment).status : "") as Commitment["status"],
    }));
  } catch {
    return [];
  }
}
