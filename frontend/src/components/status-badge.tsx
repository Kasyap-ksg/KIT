import { Badge } from "@/components/ui/badge";

const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  in_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  approved: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  executing: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  active: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  ready: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  passed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
  failed: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  blocked: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
};

const priorityColors: Record<string, string> = {
  critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  high: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  low: "bg-muted text-muted-foreground",
};

const suiteTypeColors: Record<string, string> = {
  sprint: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
  module: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-300",
  integration: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
  e2e: "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  smoke: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  regression: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300",
};

interface StatusBadgeProps {
  value: string;
  variant?: "status" | "priority" | "suite_type";
}

export function StatusBadge({ value, variant = "status" }: StatusBadgeProps) {
  const colorMap = variant === "priority" ? priorityColors : variant === "suite_type" ? suiteTypeColors : statusColors;
  const colors = colorMap[value] || "bg-muted text-muted-foreground";
  const label = value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <Badge
      variant="outline"
      className={`${colors} border-transparent text-xs no-default-hover-elevate no-default-active-elevate`}
      data-testid={`badge-${variant}-${value}`}
    >
      {label === "E2e" ? "E2E" : label}
    </Badge>
  );
}
