// Turns per-file classifications into document groups. Pure, so the rules
// are readable in one place and testable without a store or a model.
//
// The model says what each page is and whether it continues the previous
// one. Code decides how pages become documents:
//
//   - a continuation page joins the group before it, whatever the model
//     called the page on its own (page 2 of a transcript has no title, and
//     is the page most likely to be misread);
//   - a passport is always one page, one document;
//   - "other" and low-confidence pages are held for a person, one per page;
//   - everything else starts a new document.

import type { Classification, ClassifiedType } from "../types";

export interface PageGroup {
  /** Indices into the input, in order. */
  pages: number[];
  type: ClassifiedType;
  status: "extract" | "held";
  held_reason: string | null;
}

export function groupPages(classifications: readonly Classification[]): PageGroup[] {
  const groups: PageGroup[] = [];
  let open: PageGroup | null = null;

  classifications.forEach((c, i) => {
    if (c.is_continuation && open && open.status === "extract" && open.type !== "passport") {
      open.pages.push(i);
      return;
    }
    open = null;

    if (c.doc_type === "other") {
      groups.push({ pages: [i], type: "other", status: "held", held_reason: "The system could not tell what this page is" });
      return;
    }
    if (c.confidence === "low") {
      groups.push({
        pages: [i],
        type: c.doc_type,
        status: "held",
        held_reason: `The system guessed ${c.doc_type} but with low confidence`,
      });
      return;
    }
    const g: PageGroup = { pages: [i], type: c.doc_type, status: "extract", held_reason: null };
    groups.push(g);
    if (c.doc_type !== "passport") open = g;
  });

  return groups;
}
