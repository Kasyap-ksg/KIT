import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Shield } from "lucide-react";
import { Link } from "wouter";

type BadgeData = {
  has_badge: boolean;
  defect_id?: string;
  label?: string;
  title?: string;
  severity?: string;
  scenario_kind?: string;
};

export function BornFromBadge({
  testCaseId,
  projectId,
  className = "",
}: {
  testCaseId: string;
  projectId?: string;
  className?: string;
}) {
  const { data } = useQuery<BadgeData>({
    queryKey: ["/api/defects/badge/by-test-case", testCaseId],
  });

  if (!data?.has_badge) return null;

  const inner = (
    <Badge
      variant="outline"
      className={`gap-1 border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-700 text-[10px] font-semibold ${className}`}
      data-testid={`badge-born-from-${testCaseId}`}
    >
      <Shield className="h-3 w-3" />
      Born from {data.label}
    </Badge>
  );

  const wrapped = projectId && data.defect_id ? (
    <Link
      href={`/projects/${projectId}/defects?defect=${data.defect_id}`}
      onClick={(e) => e.stopPropagation()}
    >
      {inner}
    </Link>
  ) : (
    inner
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{wrapped}</span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs">
        <p className="font-semibold">{data.label} — {data.title}</p>
        <p className="text-xs text-muted-foreground mt-1">
          This regression test was auto-generated from a real production defect. It permanently protects against the same bug returning.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
