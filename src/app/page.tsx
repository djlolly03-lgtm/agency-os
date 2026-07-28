import { redirect } from "next/navigation";

export default function Home() {
  // Single-client for now; the agency picker lands here later.
  redirect("/organik-truck");
}
