import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft,
  Download,
  RefreshCw,
  Bug,
  Wand2,
  TestTube2,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Area,
  AreaChart,
  ReferenceLine,
} from "recharts";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  RiskGauge,
  bandColor,
  bandTextClass,
  bandBgClass,
  BandIcon,
} from "@/components/risk-gauge";

interface Reason {
  factor: string;
  label: string;
  weight: number;
  raw: string;
  sub_score: number;
  contribution: number;
  band: "LOW" | "MEDIUM" | "HIGH";
  detail: string;
}

interface RiskSnapshot {
  id?: string;
  project_id: string;
  project_name?: string;
  score: number;
  band: "LOW" | "MEDIUM" | "HIGH";
  recommendation: string;
  reasons: Reason[];
  computed_at: string;
  trigger?: string;
}

interface HistoryResponse {
  project_id: string;
  project_name: string;
  snapshots: RiskSnapshot[];
}

interface Driver {
  kind: "defect" | "healing" | "test";
  title: string;
  subtitle: string;
  severity: string;
  href: string;
  at: string | null;
}

function formatWhen(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface Props {
  id: string;
}

export default function ReleaseReadiness({ id }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const { data: snap, isLoading, error: snapError } = useQuery<RiskSnapshot>({
    queryKey: ["/api/projects", id, "risk"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}/risk`);
      if (!res.ok) throw new Error(res.status === 404 ? "Project not found" : `Failed to load risk (${res.status})`);
      return res.json();
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  const { data: history } = useQuery<HistoryResponse>({
    queryKey: ["/api/projects", id, "risk", "history"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}/risk/history?days=30`);
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
  });

  const { data: driversData } = useQuery<{ drivers: Driver[] }>({
    queryKey: ["/api/projects", id, "risk", "drivers"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${id}/risk/drivers`);
      if (!res.ok) throw new Error("Failed to load drivers");
      return res.json();
    },
  });

  const recompute = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/projects/${id}/risk/recompute`, {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "risk"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "risk", "history"] });
      queryClient.invalidateQueries({ queryKey: ["/api/projects", id, "risk", "drivers"] });
      toast({ title: "Risk score recomputed" });
    },
    onError: (e: unknown) => {
      const msg = e instanceof Error ? e.message : "Try again";
      toast({ title: "Recompute failed", description: msg, variant: "destructive" });
    },
  });

  if (snapError) {
    return (
      <div className="p-6 max-w-3xl mx-auto" data-testid="region-readiness-error">
        <Button variant="ghost" onClick={() => navigate(`/projects/${id}`)} className="gap-2 mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to project
        </Button>
        <Card className="p-6 border-red-200 bg-red-50/40 dark:bg-red-950/20 dark:border-red-900/60">
          <h2 className="text-lg font-semibold text-red-700 dark:text-red-400">Readiness unavailable</h2>
          <p className="text-sm text-muted-foreground mt-1">{(snapError as Error).message}</p>
          <Button size="sm" className="mt-4" onClick={() => recompute.mutate()} disabled={recompute.isPending}>
            <RefreshCw className={`h-4 w-4 mr-2 ${recompute.isPending ? "animate-spin" : ""}`} />
            Try recompute
          </Button>
        </Card>
      </div>
    );
  }
  if (isLoading || !snap) {
    return (
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-48 w-full" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const trend = (history?.snapshots ?? []).map((s) => ({
    iso: s.computed_at,
    label: formatWhen(s.computed_at),
    score: s.score,
    band: s.band,
  }));

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => navigate(`/projects/${id}`)} className="gap-2" data-testid="button-back-project">
          <ArrowLeft className="h-4 w-4" />
          Back to project
        </Button>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => recompute.mutate()}
            disabled={recompute.isPending}
            data-testid="button-recompute"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${recompute.isPending ? "animate-spin" : ""}`} />
            Recompute
          </Button>
          <a
            href={`/api/projects/${id}/risk/report`}
            target="_blank"
            rel="noreferrer"
            data-testid="link-export-report"
          >
            <Button size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export report
            </Button>
          </a>
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
          Release Readiness
        </div>
        <h1 className="text-3xl font-semibold tracking-tight mt-1" data-testid="text-page-title">
          {snap.project_name ?? "Project"} · Go / No-Go
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          One number, one reason. Computed from execution, defect, and healing signals — refreshed
          automatically after every run, defect, and healing event.
        </p>
      </div>

      {/* Hero card */}
      <Card className={`p-7 border ${bandBgClass(snap.band)}`} data-testid="card-risk-hero">
        <div className="flex items-center gap-8 flex-wrap">
          <RiskGauge score={snap.score} band={snap.band} size={180} />
          <div className="flex-1 min-w-[260px]">
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`text-[10px] font-bold tracking-wider border-current ${bandTextClass(snap.band)}`}
                data-testid="badge-risk-band"
              >
                <BandIcon band={snap.band} className="h-3 w-3 mr-1" />
                {snap.band}
              </Badge>
              <span className="text-[11px] text-muted-foreground">
                Computed {formatWhen(snap.computed_at)}
              </span>
            </div>
            <div className="text-2xl font-semibold mt-2 text-foreground" data-testid="text-recommendation">
              {snap.recommendation}
            </div>
            <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
              Score reflects {snap.reasons.length} weighted signals across critical-test pass rate,
              flakiness, fresh production defects, self-healing churn, and failure recency.
            </p>
          </div>
        </div>
      </Card>

      {/* Trend chart */}
      <Card className="p-5" data-testid="card-risk-trend">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Risk Score Over Time
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Last {trend.length} snapshot{trend.length === 1 ? "" : "s"} · 30-day window
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-600" /> LOW</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-600" /> MEDIUM</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-600" /> HIGH</span>
          </div>
        </div>
        {trend.length > 1 ? (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend} margin={{ top: 5, right: 16, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={bandColor(snap.band)} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={bandColor(snap.band)} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
              <ReferenceLine y={30} stroke="hsl(150 55% 38%)" strokeDasharray="3 3" strokeOpacity={0.4} />
              <ReferenceLine y={60} stroke="hsl(0 60% 50%)" strokeDasharray="3 3" strokeOpacity={0.4} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                formatter={(v: number) => [`${v}`, "Risk"]}
              />
              <Area type="monotone" dataKey="score" stroke={bandColor(snap.band)} strokeWidth={2.5} fill="url(#riskGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-sm text-muted-foreground border border-dashed rounded-md">
            Only one snapshot so far. The trend line will fill in as runs and events trigger recomputes.
          </div>
        )}
      </Card>

      {/* Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2" data-testid="card-breakdown">
          <h3 className="text-sm font-semibold mb-4">Why this score</h3>
          <div className="space-y-4">
            {snap.reasons.map((r) => (
              <div key={r.factor} className="space-y-1.5" data-testid={`reason-${r.factor}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm truncate">{r.label}</span>
                    <Badge variant="outline" className={`text-[9px] font-semibold ${bandTextClass(r.band)} border-current`}>
                      {r.band}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground shrink-0">
                    weight {r.weight} · contribution {r.contribution}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${r.sub_score}%`,
                      background: bandColor(r.band),
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{r.raw}</span>
                  <span className="tabular-nums">{r.sub_score}/100</span>
                </div>
                <p className="text-[11px] text-muted-foreground">{r.detail}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5" data-testid="card-drivers">
          <h3 className="text-sm font-semibold mb-3">Top risk drivers</h3>
          {(driversData?.drivers ?? []).length === 0 ? (
            <div className="text-[12px] text-muted-foreground italic py-6 text-center border border-dashed rounded-md">
              No active drivers. Every signal is calm.
            </div>
          ) : (
            <div className="space-y-2">
              {driversData!.drivers.map((d, i) => (
                <Link key={i} href={d.href} data-testid={`driver-${d.kind}-${i}`}>
                  <div className="flex items-start gap-2 p-2 rounded-md border border-border hover:bg-muted/40 cursor-pointer transition-colors">
                    <div className={`h-7 w-7 rounded-md flex items-center justify-center shrink-0 ${
                      d.kind === "defect"
                        ? "bg-red-50 text-red-700"
                        : d.kind === "test"
                          ? "bg-amber-50 text-amber-700"
                          : "bg-blue-50 text-blue-700"
                    }`}>
                      {d.kind === "defect" ? (
                        <Bug className="h-3.5 w-3.5" />
                      ) : d.kind === "test" ? (
                        <TestTube2 className="h-3.5 w-3.5" />
                      ) : (
                        <Wand2 className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-medium truncate">{d.title}</div>
                      <div className="text-[10px] text-muted-foreground truncate">{d.subtitle}</div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-1" />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
