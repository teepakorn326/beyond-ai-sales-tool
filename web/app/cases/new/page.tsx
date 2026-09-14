import type { Metadata } from "next";

import { PageHeader, TopBar } from "../../components/shell";
import { ProgressStepper } from "../../components/ui";
import { NewCaseForm } from "./new-case-form";

export const metadata: Metadata = { title: "New case" };

type Search = Record<string, string | string[] | undefined>;

export default async function NewCasePage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const raw = Array.isArray(sp.case_id) ? sp.case_id[0] : sp.case_id;
  const initialCaseId = raw && /^[A-Za-z0-9-]{1,40}$/.test(raw) ? raw : "";
  return (
    <>
      <TopBar crumbs={[{ label: "Cases", href: "/cases" }, { label: initialCaseId ? "Add documents" : "New case" }]} />
      <main className="content">
        <PageHeader
          title={initialCaseId ? "Add documents" : "New student case"}
          subtitle="Upload everything you have. Documents can arrive in any order; the system sorts them and a person confirms every field."
          actions={<ProgressStepper current={1} caseId={initialCaseId || null} />}
        />
        <NewCaseForm initialCaseId={initialCaseId} />
      </main>
    </>
  );
}
