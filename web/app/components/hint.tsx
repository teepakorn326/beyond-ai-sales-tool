"use client";

import { Info } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The one place for "why": rationale that used to be a sentence on the
 * screen now sits behind an info glyph. The screen shows what to do; the
 * tooltip says why the system asks.
 */
export function Hint({ text, className }: { text: string; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger aria-label={text} className={cn("inline-flex cursor-help align-middle text-muted-foreground hover:text-foreground", className)}>
        <Info className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-pretty">{text}</TooltipContent>
    </Tooltip>
  );
}
