import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Brain,
  RefreshCw,
  Loader2,
  Wand2,
  Bug,
  RotateCw,
  PencilLine,
  Search,
  Wifi,
  Clock,
  Target,
  Shuffle,
  Cog,
  HelpCircle,
} from "lucide-react";

export type TriageEvidence = { snippet: string; why: string };
export type TriageCategory =
  | "selector_drift" | "timing" | "assertion" | "network"
  | "app_bug" | "env" | "flake" | "unknown";
export type TriageAction =
  | "self_heal" | "retry" | "file_bug" | "update_test" | "investigate";

export interface Triage {
  id: string;
  run_id: string;
  category: TriageCategory;
  confidence: number;
  hypothesis: string;
  evidence: TriageEvidence[];
  suggested_action: TriageAction;
  suggested_action_detail: string;
  model: string;
  error: string;
  created_at: string | null;
}

const CATEGORY_META: Record<TriageCategory, { label: string; icon: any; tone: string }> = {
  selector_drift: { label: "Selector Drift", icon: Target, tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border-amber-300 dark:border-amber-800" },
  timing: { label: "Timing / Timeout", icon: Clock, tone: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-blue-300 dark:border-blue-800" },
  assertion: { label: "Assertion Mismatch", icon: PencilLine, tone: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border-rose-300 dark:border-rose-800" },
  network: { label: "Network / API", icon: Wifi, tone: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 border-purple-300 dark:border-purple-800" },
  app_bug: { label: "App Bug", icon: Bug, tone: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-red-300 dark:border-red-800" },
  env: { label: "Environment", icon: Cog, tone: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-300 border-slate-300 dark:border-slate-700" },
  flake: { label: "Flake", icon: Shuffle, tone: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300 border-yellow-300 dark:border-yellow-800" },
  unknown: { label: "Unknown", icon: HelpCircle, tone: "bg-muted text-muted-foreground border-border" },
};

const ACTION_META: Record<TriageAction, { label: string; icon: any }> = {
  self_heal: { label: "Self-Heal", icon: Wand2 },
  retry: { label: "Retry", icon: RotateCw },
  file_bug: { label: "File a Bug", icon: Bug },
  update_test: { label: "Update Test", icon: PencilLine },
  investigate: { label: "Investigate", icon: Search },
};

interface TriageCardProps {
  runId: string;
  initialTriage?: Triage | null;
  onAction?: (action: TriageAction) => void;
  compact?: boolean;
}

export function TriageCard({ runId, initialTriage, onAction, compact = false }: TriageCardProps) {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery<{ triage: Triage | null; available: boolean }>({
    queryKey: ["/api/triage/run", runId],
    initialData: initialTriage
      ? { triage: initialTriage, available: true }
      : undefined,
  });

  const reTriage = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/triage/run/${runId}`, {});
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/triage/run", runId] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/test-case"] });
      qc.invalidateQueries({ queryKey: ["/api/analytics/overview"] });
      toast({ title: "AI triage updated" });
    },
    onError: () => toast({ title: "Triage failed", variant: "destructive" }),
  });

  const triage = data?.triage ?? null;

  if (isLoading && !triage) {
    return (
      <Card className="p-4 border-purple-200 dark:border-purple-900 bg-purple-50/40 dark:bg-purple-950/20">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Analyzing failure with AI...
        </div>
      </Card>
    );
  }

  if (!triage) {
    return (
      <Card className="p-4 border-purple-200 dark:border-purple-900 bg-purple-50/40 dark:bg-purple-950/20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 text-purple-600" />
            <span className="text-sm font-medium">AI Failure Triage</span>
            <span className="text-xs text-muted-foreground">— no analysis yet</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => reTriage.mutate()}
            disabled={reTriage.isPending}
            className="gap-1.5"
            data-testid="button-run-triage"
          >
            {reTriage.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Brain className="h-3.5 w-3.5" />}
            Run Triage
          </Button>
        </div>
      </Card>
    );
  }

  const meta = CATEGORY_META[triage.category] ?? CATEGORY_META.unknown;
  const CatIcon = meta.icon;
  const action = ACTION_META[triage.suggested_action] ?? ACTION_META.investigate;
  const ActionIcon = action.icon;

  const confidenceTone =
    triage.confidence >= 75
      ? "text-emerald-600 dark:text-emerald-400"
      : triage.confidence >= 45
      ? "text-amber-600 dark:text-amber-400"
      : "text-muted-foreground";

  return (
    <Card
      className="p-4 border-purple-200 dark:border-purple-900 bg-gradient-to-br from-purple-50/60 to-transparent dark:from-purple-950/20 dark:to-transparent"
      data-testid={`triage-card-${runId}`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Brain className="h-4 w-4 text-purple-600 flex-shrink-0" />
          <span className="text-sm font-semibold">AI Failure Triage</span>
          <Badge variant="outline" className={`gap-1 ${meta.tone}`} data-testid={`triage-category-${triage.category}`}>
            <CatIcon className="h-3 w-3" />
            {meta.label}
          </Badge>
          {triage.model && (
            <span className="text-[10px] text-muted-foreground">via {triage.model}</span>
          )}
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => reTriage.mutate()}
          disabled={reTriage.isPending}
          className="h-7 gap-1.5"
          data-testid="button-rerun-triage"
        >
          {reTriage.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          <span className="text-xs">Re-run</span>
        </Button>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Confidence</span>
          <span className={`text-xs font-mono font-semibold ${confidenceTone}`} data-testid="triage-confidence">
            {triage.confidence}%
          </span>
        </div>
        <Progress value={triage.confidence} className="h-1.5" />
      </div>

      <p className="text-sm leading-relaxed mb-3" data-testid="triage-hypothesis">
        {triage.hypothesis || "No hypothesis available."}
      </p>

      {triage.evidence.length > 0 && !compact && (
        <div className="mb-3 space-y-1.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Evidence</div>
          {triage.evidence.slice(0, 4).map((e, i) => (
            <div key={i} className="rounded-md border bg-card/50 p-2" data-testid={`triage-evidence-${i}`}>
              {e.snippet && (
                <pre className="text-[11px] font-mono text-foreground/80 whitespace-pre-wrap break-words mb-0.5">
                  {e.snippet}
                </pre>
              )}
              {e.why && <p className="text-[11px] text-muted-foreground italic">→ {e.why}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 pt-2 border-t">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Suggested:</span>
          <span data-testid="triage-action-detail">{triage.suggested_action_detail || action.label}</span>
        </div>
        {onAction && (
          <Button
            size="sm"
            variant="default"
            onClick={() => onAction(triage.suggested_action)}
            className="gap-1.5"
            data-testid={`button-triage-action-${triage.suggested_action}`}
          >
            <ActionIcon className="h-3.5 w-3.5" />
            {action.label}
          </Button>
        )}
      </div>

      {triage.error && (
        <p className="mt-2 text-[11px] text-red-600 dark:text-red-400">
          Triage error: {triage.error}
        </p>
      )}
    </Card>
  );
}

export function TriageBadge({ triage }: { triage: Triage | null | undefined }) {
  if (!triage) return null;
  const meta = CATEGORY_META[triage.category] ?? CATEGORY_META.unknown;
  const Icon = meta.icon;
  return (
    <Badge
      variant="outline"
      className={`gap-1 text-[10px] h-5 px-1.5 ${meta.tone}`}
      data-testid={`triage-badge-${triage.category}`}
      title={triage.hypothesis}
    >
      <Icon className="h-2.5 w-2.5" />
      {meta.label}
      <span className="opacity-70">· {triage.confidence}%</span>
    </Badge>
  );
}
