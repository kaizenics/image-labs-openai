import { useId, type ReactNode } from "react";
import { Slot } from "@radix-ui/react-slot";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface FieldProps {
  label: ReactNode;
  /** Single form control; receives id, aria-describedby and aria-invalid. */
  children: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Small control rendered on the label row (e.g. a "Fetch models" button). */
  action?: ReactNode;
  /** Rendered inside the control's right edge (e.g. a show/hide toggle). Pad the control with pr-10. */
  endAdornment?: ReactNode;
  className?: string;
  id?: string;
}

/** Label above, hint and error below, all wired to the control for screen readers. */
export function Field({ label, children, hint, error, action, endAdornment, className, id }: FieldProps) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;

  const control = () => (
    <Slot
      id={controlId}
      aria-describedby={[hintId, errorId].filter(Boolean).join(" ") || undefined}
      aria-invalid={error ? true : undefined}
    >
      {children}
    </Slot>
  );

  return (
    <div className={cn("grid gap-1.5", className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <Label htmlFor={controlId}>{label}</Label>
        {action}
      </div>
      {endAdornment ? <div className="relative">{control()}<div className="absolute inset-y-0 right-0.5 flex items-center">{endAdornment}</div></div> : control()}
      {hint ? (
        <p id={hintId} className="text-xs leading-5 text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs font-medium leading-5 text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
