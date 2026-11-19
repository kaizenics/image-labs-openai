import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface DisclosureProps {
  title: ReactNode;
  /** Short value shown next to the title while collapsed (e.g. current size). */
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

/** Collapsible group for secondary options, so the primary form stays short. */
export function Disclosure({ title, summary, defaultOpen = false, children, className }: DisclosureProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className={cn("rounded-md border", className)}>
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span>{title}</span>
        <span className="flex min-w-0 items-center gap-2">
          {summary && !open ? (
            <span className="truncate font-mono text-xs font-normal text-muted-foreground">{summary}</span>
          ) : null}
          <ChevronDown
            aria-hidden="true"
            className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")}
          />
        </span>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-4 border-t px-3 pb-3 pt-3">{children}</CollapsibleContent>
    </Collapsible>
  );
}
