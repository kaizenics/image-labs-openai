import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type NoticeVariant = "info" | "warning" | "error" | "success";

interface NoticeProps {
  children: ReactNode;
  variant?: NoticeVariant;
  title?: ReactNode;
  action?: ReactNode;
  className?: string;
}

const styles: Record<NoticeVariant, string> = {
  info: "border-border bg-muted/60 text-foreground [&>svg]:text-muted-foreground",
  warning: "border-warning/30 bg-warning-soft text-foreground [&>svg]:text-warning",
  error: "border-destructive/30 bg-destructive-soft text-foreground [&>svg]:text-destructive",
  success: "border-success/30 bg-success-soft text-foreground [&>svg]:text-success",
};

const icons: Record<NoticeVariant, typeof Info> = {
  info: Info,
  warning: TriangleAlert,
  error: AlertCircle,
  success: CheckCircle2,
};

export function Notice({ children, variant = "info", title, action, className }: NoticeProps) {
  const Icon = icons[variant];
  // Errors interrupt; everything else is announced politely.
  const role = variant === "error" ? "alert" : "status";

  return (
    <div
      role={role}
      className={cn(
        "flex gap-2.5 rounded-md border px-3 py-2.5 text-sm leading-5 [&>svg]:mt-0.5 [&>svg]:size-4 [&>svg]:shrink-0",
        styles[variant],
        className,
      )}
    >
      <Icon aria-hidden="true" />
      <div className="min-w-0 flex-1 space-y-1">
        {title ? <p className="font-medium">{title}</p> : null}
        <div className={cn(title && "text-muted-foreground")}>{children}</div>
        {action ? <div className="pt-1.5">{action}</div> : null}
      </div>
    </div>
  );
}
