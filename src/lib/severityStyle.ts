import type { IssueSeverity } from "../types";

/** Shared badge styling for severity, used by both ResultsTable and PageDetailModal. */
export function severityBadgeClass(severity: IssueSeverity): string {
  switch (severity) {
    case "error":
      return "bg-destructive/10 text-destructive";
    case "warning":
      return "bg-warning/20 text-foreground";
    case "info":
      return "bg-muted text-muted-foreground";
  }
}
