import { redirect } from "next/navigation";

type Search = Record<string, string | string[] | undefined>;

/** The old whole-case check page. The case overview replaced it. */
export default async function LegacyCasePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.case_id) ? sp.case_id[0] : sp.case_id;
  const id = raw?.trim();
  redirect(id ? `/cases/${encodeURIComponent(id)}` : "/cases");
}
