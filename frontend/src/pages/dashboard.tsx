import { useQuery } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Globe,
  FolderKanban,
  AppWindow,
  TestTubes,
  CheckCircle2,
  XCircle,
  Activity,
  TrendingUp,
  Clock,
  Shield,
  Sparkles,
  ArrowRight,
  Flame,
  Timer,
  Target,
  Palette,
  Wand2,
  Zap,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  ScatterChart,
  Scatter,
  ZAxis,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  ReferenceArea,
  ReferenceLine,
  LabelList,
  ComposedChart,
  Line,
} from "recharts";
import type { DashboardAnalytics, AnalyticsOverview, Project } from "@/types";
import { LogViewer } from "@/components/log-viewer";
import { ChevronDown, ChevronRight } from "lucide-react";
import { TriageBadge, TriageCard, type Triage } from "@/components/triage-card";
import { RiskGauge, bandTextClass, BandIcon, type RiskBand as RiskBandType } from "@/components/risk-gauge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RangeKey = "today" | "7d" | "30d";

function formatDuration(ms: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  const sec = ms / 1000;
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function formatRelative(iso: string | null) {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

export default function Dashboard() {
  const [range, setRange] = useState<RangeKey>("7d");

  const { data: dash, isLoading: dashLoading } = useQuery<DashboardAnalytics>({
    queryKey: ["/api/analytics/dashboard"],
  });

  const { data: overview, isLoading: ovLoading } = useQuery<AnalyticsOverview>({
    queryKey: ["/api/analytics/overview", range],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/overview?range=${range}`);
      if (!res.ok) throw new Error("Failed to load overview");
      return res.json();
    },
  });

  if (dashLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Skeleton className="h-72 lg:col-span-2" />
          <Skeleton className="h-72" />
        </div>
      </div>
    );
  }

  const t = overview?.totals;
  const passRate = t?.pass_rate ?? 0;
  const isHealthy = passRate >= 80;

  const passRatePieData = [
    { name: "Passed", value: t?.passed ?? 0 },
    { name: "Failed", value: (t?.failed ?? 0) + (t?.errors ?? 0) },
  ];
  // Brand-aligned: deep blues for passed, soft red for failed
  const passRateColors = ["hsl(228 71% 12%)", "hsl(0 70% 55%)"];
  const BRAND_ROYAL = "hsl(228 71% 12%)";  // #091235
  const BRAND_MIDNIGHT = "hsl(209 34% 25%)"; // #2B4257
  const BRAND_BLUEGRAY = "hsl(207 32% 65%)"; // #88A9C3
  const BRAND_RED = "hsl(0 70% 55%)";

  return (
    <div className="p-6 space-y-6">
      {/* Editorial header — no gradient, no glass; just title + controls */}
      <div className="flex items-end justify-between gap-4 flex-wrap pb-1">
        <div>
          <div className="flex items-center gap-3 text-[11px] mb-1.5">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 live-dot" />
              Live
            </span>
            <span className="text-muted-foreground">·</span>
            <Badge variant="outline" className="text-[10px] gap-1 h-5 border-primary/20 text-primary bg-primary/5">
              <Sparkles className="h-3 w-3" /> KIT
            </Badge>
          </div>
          <h1 className="text-[28px] leading-none font-semibold tracking-tight text-foreground" data-testid="text-dashboard-title">
            Mission Control
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl">
            Real-time visibility into test execution, design fidelity, and self-healing — every quality signal in one place.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <TabsList className="h-9 bg-muted">
              <TabsTrigger value="today" className="text-xs px-3 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm" data-testid="range-today">Today</TabsTrigger>
              <TabsTrigger value="7d" className="text-xs px-3 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm" data-testid="range-7d">7 days</TabsTrigger>
              <TabsTrigger value="30d" className="text-xs px-3 data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm" data-testid="range-30d">30 days</TabsTrigger>
            </TabsList>
          </Tabs>
          <ReleaseReadinessHeader />
        </div>
      </div>

      {/* Hero release readiness card — full breakdown at a glance */}
      <ReleaseReadinessHero />

      {/* Impact strip — what KIT delivers to the QE team & business */}
      <ImpactStrip
        runs={t?.runs ?? 0}
        passed={t?.passed ?? 0}
        avgDurationMs={t?.avg_duration_ms ?? 0}
      />

      {/* Learning From Production — small stat on regression tests born from real defects */}
      <DefectsLearnedTile />

      {/* Predictive Analytics — production readiness, stability index, defect forecast */}
      <PredictiveAnalytics overview={overview} />

      {/* KPI tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiTile
          label="Total Runs"
          value={t?.runs ?? 0}
          icon={Activity}
          tone="info"
          testId="kpi-runs"
          loading={ovLoading}
        />
        <KpiTile
          label="Pass Rate"
          value={`${passRate.toFixed(1)}%`}
          icon={Target}
          tone={isHealthy ? "success" : passRate >= 50 ? "warn" : "danger"}
          testId="kpi-pass-rate"
          loading={ovLoading}
        />
        <KpiTile
          label="Failed Runs"
          value={(t?.failed ?? 0) + (t?.errors ?? 0)}
          icon={XCircle}
          tone={(t?.failed ?? 0) + (t?.errors ?? 0) > 0 ? "danger" : "neutral"}
          testId="kpi-failed"
          loading={ovLoading}
        />
        <KpiTile
          label="Flaky Tests"
          value={t?.flaky_tests ?? 0}
          subtitle={(t?.flaky_tests ?? 0) === 0 ? "all stable" : "intermittent"}
          icon={Flame}
          tone={(t?.flaky_tests ?? 0) > 0 ? "warn" : "success"}
          testId="kpi-flaky"
          loading={ovLoading}
        />
        <KpiTile
          label="Avg Duration"
          value={formatDuration(t?.avg_duration_ms ?? 0)}
          icon={Timer}
          tone="info"
          testId="kpi-duration"
          loading={ovLoading}
        />
        <KpiTile
          label="MTTR"
          value={t?.mttr_ms ? formatDuration(t.mttr_ms) : "—"}
          subtitle={t?.mttr_samples ? `${t.mttr_samples} recovery${t.mttr_samples === 1 ? "" : "ies"}` : "no failures"}
          icon={Shield}
          tone={t?.mttr_ms && t.mttr_ms > 3600_000 ? "warn" : "success"}
          testId="kpi-mttr"
          loading={ovLoading}
        />
      </div>

      {/* Trend + Pass Rate donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <TrendingUp className="h-4 w-4 text-primary" />
                Execution Trend
              </h3>
              <p className="text-[11px] text-muted-foreground mt-1">
                {range === "today" ? "Hourly" : "Daily"} runs · passed vs failed
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: BRAND_ROYAL }} /> Passed</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: BRAND_RED }} /> Failed</span>
            </div>
          </div>
          {overview && overview.trend.some((d) => d.total > 0) ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={overview.trend} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                <defs>
                  <linearGradient id="trendPassed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND_ROYAL} stopOpacity={0.55} />
                    <stop offset="100%" stopColor={BRAND_ROYAL} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="trendFailed" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={BRAND_RED} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={BRAND_RED} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))", boxShadow: "0 4px 12px rgba(9,18,53,0.08)" }}
                  labelStyle={{ fontWeight: 600, color: "hsl(var(--foreground))" }}
                  cursor={{ stroke: BRAND_ROYAL, strokeWidth: 1, strokeDasharray: "3 3" }}
                />
                <Area type="monotone" dataKey="passed" stroke={BRAND_ROYAL} strokeWidth={2.5} fill="url(#trendPassed)" name="Passed" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: BRAND_ROYAL }} />
                <Area type="monotone" dataKey="failed" stroke={BRAND_RED} strokeWidth={2} fill="url(#trendFailed)" name="Failed" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fff", fill: BRAND_RED }} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="No executions yet in this window. Run a test case to see the trend." />
          )}
        </Card>

        <Card className="p-5 flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Target className="h-4 w-4 text-primary" />
                Pass Rate
              </h3>
              <p className="text-[11px] text-muted-foreground mt-1">Overall execution health</p>
            </div>
            <Badge
              variant="outline"
              className={
                isHealthy
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200/80 text-[10px] font-semibold"
                  : passRate >= 50
                    ? "bg-amber-50 text-amber-700 border-amber-200/80 text-[10px] font-semibold"
                    : "bg-red-50 text-red-700 border-red-200/80 text-[10px] font-semibold"
              }
            >
              {isHealthy ? "Healthy" : passRate >= 50 ? "Watch" : "At Risk"}
            </Badge>
          </div>
          {(t?.runs ?? 0) > 0 ? (
            <div className="relative flex-1 flex items-center justify-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <defs>
                    <linearGradient id="passedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(209 34% 35%)" />
                      <stop offset="100%" stopColor="hsl(228 71% 12%)" />
                    </linearGradient>
                  </defs>
                  <Pie
                    data={passRatePieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={64}
                    outerRadius={92}
                    paddingAngle={2}
                    dataKey="value"
                    startAngle={90}
                    endAngle={-270}
                    stroke="none"
                  >
                    <Cell fill="url(#passedGrad)" />
                    <Cell fill="hsl(207 32% 88%)" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-[32px] leading-none font-bold tabular-nums text-foreground" data-testid="text-pass-rate">{passRate.toFixed(1)}%</div>
                <div className="text-[11px] text-muted-foreground mt-1.5">{t?.passed ?? 0} of {t?.runs ?? 0} runs</div>
              </div>
            </div>
          ) : (
            <EmptyChart message="No runs in this window." />
          )}
        </Card>
      </div>

      {/* Pass Rate Trend Line */}
      <Card className="p-4" data-testid="card-pass-rate-trend">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-1.5">
              <Target className="h-4 w-4 text-emerald-500" />
              Pass Rate Trend
            </h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {range === "today" ? "Hourly" : "Daily"} pass rate over the {range === "today" ? "day" : range === "30d" ? "30-day" : "7-day"} window
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {passRate.toFixed(1)}% overall
          </Badge>
        </div>
        {overview && overview.trend.some((d) => d.total > 0) ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart
              data={overview.trend.map((d) => ({
                ...d,
                pass_rate: d.total > 0 ? Math.round((d.passed / d.total) * 1000) / 10 : null,
              }))}
              margin={{ top: 5, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id="passRateGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8 }}
                labelStyle={{ fontWeight: 600 }}
                formatter={(value: number) => `${value}%`}
              />
              <Area
                type="monotone"
                dataKey="pass_rate"
                stroke="#10b981"
                strokeWidth={2.5}
                fill="url(#passRateGrad)"
                connectNulls
                name="Pass rate"
                dot={{ r: 3, fill: "#10b981" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="No executions yet — pass rate trend will appear here once runs start coming in." />
        )}
      </Card>

      {/* Flakiest + Slowest */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ListCard
          title="Flakiest Tests"
          icon={Flame}
          iconColor="text-orange-500"
          empty="No flaky tests detected — execution is stable."
          loading={ovLoading}
          items={(overview?.flakiest ?? []).map((c) => ({
            id: c.id,
            href: c.suite_id ? `/test-suites/${c.suite_id}` : "#",
            title: c.title,
            subtitle: [c.project_name, c.suite_name].filter(Boolean).join(" · "),
            metric: `${c.flakiness_pct}%`,
            metricLabel: `${c.failed}/${c.runs} failed`,
            tone: "danger" as const,
          }))}
        />
        <ListCard
          title="Slowest Tests"
          icon={Clock}
          iconColor="text-sky-500"
          empty="No execution timing data yet."
          loading={ovLoading}
          items={(overview?.slowest ?? []).map((c) => ({
            id: c.id,
            href: c.suite_id ? `/test-suites/${c.suite_id}` : "#",
            title: c.title,
            subtitle: [c.project_name, c.suite_name].filter(Boolean).join(" · "),
            metric: formatDuration(c.avg_duration_ms),
            metricLabel: `${c.runs} runs`,
            tone: "info" as const,
          }))}
        />
      </div>

      {/* Recent runs feed */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Activity className="h-4 w-4 text-violet-500" />
            {range === "today" ? "Today's Executions" : "Recent Executions"}
            {range !== "today" && (
              <span className="ml-1 text-[10px] font-normal text-muted-foreground">
                ({range === "30d" ? "last 30 days" : "last 7 days"})
              </span>
            )}
          </h3>
          <Badge variant="outline" className="text-[10px]">
            Last {overview?.recent_runs?.length ?? 0}
          </Badge>
        </div>
        {ovLoading ? (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}
          </div>
        ) : overview?.recent_runs?.length ? (
          <div className="space-y-1">
            {overview.recent_runs.map((r) => (
              <RecentRunRow key={r.run_id} run={r} />
            ))}
          </div>
        ) : (
          <EmptyChart message="No executions in this window. Run a test to populate the feed." />
        )}
      </Card>

      {/* Cross-feature live quality signals (Test runs + Design QA + Self-Healing) */}
      <QualitySignalsRow />
    </div>
  );
}

function DefectsLearnedTile() {
  const { data } = useQuery<{ total_defects: number; defects_learned: number; defects_learned_30d: number; regression_tests_generated: number }>({
    queryKey: ["/api/defects/stats"],
  });
  const learned30 = data?.defects_learned_30d ?? 0;
  const tests = data?.regression_tests_generated ?? 0;
  const total = data?.total_defects ?? 0;
  return (
    <Card className="px-5 py-3 flex items-center justify-between gap-4 flex-wrap" data-testid="card-defects-learned">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
          <Sparkles className="h-4 w-4 text-amber-600" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Learning From Production</div>
          <div className="text-sm font-semibold">
            <span className="text-amber-700 dark:text-amber-400 tabular-nums">{learned30}</span> defects converted into permanent regression tests this month
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {tests} regression test{tests === 1 ? "" : "s"} born · {total} total defect{total === 1 ? "" : "s"} captured
          </div>
        </div>
      </div>
      <Link href="/projects" data-testid="link-defects-cta">
        <span className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1">
          Open a project's defects <ArrowRight className="h-3 w-3" />
        </span>
      </Link>
    </Card>
  );
}

function QualitySignalsRow() {
  const { data: healing } = useQuery<{ proposals: Array<{ id: string; status: string; test_case_title: string; application_name: string; risk_level: string; confidence: number; test_suite_id: string | null }>; counts: { pending: number; applied: number; rejected: number; total: number } }>({
    queryKey: ["/api/healing/proposals"],
  });
  const { data: validations } = useQuery<Array<{ id: string; name: string; status: string; overall_score: number | null; pages: unknown[] }>>({
    queryKey: ["/api/design-validations"],
  });

  const pendingHealing = healing?.counts?.pending ?? 0;
  const appliedHealing = healing?.counts?.applied ?? 0;
  const recentProposals = (healing?.proposals ?? []).slice(0, 4);

  const validationCount = validations?.length ?? 0;
  const avgScore = validations?.length
    ? Math.round(validations.filter((v) => v.overall_score !== null).reduce((a, b) => a + (b.overall_score ?? 0), 0) / Math.max(1, validations.filter((v) => v.overall_score !== null).length))
    : null;
  const recentValidations = (validations ?? []).slice(0, 4);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" data-testid="card-quality-signals">
      {/* Self-Healing signal */}
      <Card className="p-5">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center module-chip-healing">
                <Wand2 className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Self-Healing</h3>
                <p className="text-[11px] text-muted-foreground">AI-proposed selector fixes</p>
              </div>
            </div>
            <Link href="/self-healing">
              <span className="text-[11px] font-medium text-primary hover:underline cursor-pointer flex items-center gap-1" data-testid="link-signal-healing">
                Open <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <SignalStat label="Pending" value={pendingHealing} tone="warn" />
            <SignalStat label="Applied" value={appliedHealing} tone="success" />
            <SignalStat label="Total" value={healing?.counts?.total ?? 0} tone="neutral" />
          </div>
          {recentProposals.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic py-3 text-center border border-dashed rounded-md">
              No healing proposals yet — they appear when a test breaks.
            </div>
          ) : (
            <div className="space-y-1">
              {recentProposals.map((p) => (
                <Link
                  key={p.id}
                  href={p.test_suite_id ? `/self-healing` : `/self-healing`}
                  className="block"
                >
                  <div className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/40 transition-colors" data-testid={`signal-healing-${p.id}`}>
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${p.status === "pending" ? "bg-amber-500 live-dot" : p.status === "applied" ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span className="text-xs flex-1 truncate font-medium">{p.test_case_title}</span>
                    <Badge variant="outline" className="text-[10px] capitalize h-5">{p.status}</Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>

      {/* Design Validation signal */}
      <Card className="p-5">
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-lg flex items-center justify-center module-chip-design">
                <Palette className="h-4 w-4" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Design Validation</h3>
                <p className="text-[11px] text-muted-foreground">Pixel & intent fidelity vs. spec</p>
              </div>
            </div>
            <Link href="/design-validation">
              <span className="text-[11px] font-medium text-primary hover:underline cursor-pointer flex items-center gap-1" data-testid="link-signal-design">
                Open <ArrowRight className="h-3 w-3" />
              </span>
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            <SignalStat label="Validations" value={validationCount} tone="info" />
            <SignalStat label="Avg Score" value={avgScore !== null ? `${avgScore}%` : "—"} tone={avgScore === null ? "neutral" : avgScore >= 80 ? "success" : avgScore >= 60 ? "warn" : "danger"} />
            <SignalStat label="Pages" value={(validations ?? []).reduce((a, b) => a + (b.pages?.length ?? 0), 0)} tone="neutral" />
          </div>
          {recentValidations.length === 0 ? (
            <div className="text-[11px] text-muted-foreground italic py-3 text-center border border-dashed rounded-md">
              No design validations yet — create one to compare design vs. live UI.
            </div>
          ) : (
            <div className="space-y-1">
              {recentValidations.map((v) => (
                <Link key={v.id} href={`/design-validation/${v.id}`} className="block">
                  <div className="flex items-center gap-2 p-1.5 rounded-md hover:bg-muted/40 transition-colors" data-testid={`signal-design-${v.id}`}>
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${v.status === "completed" ? "bg-emerald-500" : v.status === "running" ? "bg-amber-500 live-dot" : "bg-slate-400"}`} />
                    <span className="text-xs flex-1 truncate font-medium">{v.name}</span>
                    {v.overall_score !== null && (
                      <Badge variant="outline" className="text-[10px] h-5 tabular-nums">{Math.round(v.overall_score)}%</Badge>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function SignalStat({ label, value, tone }: { label: string; value: number | string; tone: "success" | "danger" | "warn" | "info" | "neutral" }) {
  const toneClasses: Record<string, string> = {
    success: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 border-emerald-200/60 dark:border-emerald-900/60",
    danger: "bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 border-red-200/60 dark:border-red-900/60",
    warn: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-900/60",
    info: "bg-sky-50 dark:bg-sky-950/30 text-sky-700 dark:text-sky-300 border-sky-200/60 dark:border-sky-900/60",
    neutral: "bg-muted text-foreground border-border",
  };
  return (
    <div className={`rounded-md border px-2 py-1.5 ${toneClasses[tone]}`}>
      <div className="text-[9px] uppercase tracking-wider opacity-80">{label}</div>
      <div className="text-base font-bold tabular-nums leading-tight">{value}</div>
    </div>
  );
}

function ImpactStrip({ runs, passed, avgDurationMs }: { runs: number; passed: number; avgDurationMs: number }) {
  // Conservative estimates that translate raw activity into business value
  const manualMinPerTest = 6; // a manual QE would spend ~6 min on the same scenario
  const automatedMin = Math.max(0.5, avgDurationMs / 60000); // never zero, in minutes
  const minutesSavedPerRun = Math.max(0, manualMinPerTest - automatedMin);
  const totalHoursSaved = (runs * minutesSavedPerRun) / 60;
  const bugsCaught = runs - passed; // failed runs == defects KIT surfaced before release
  const coverageRatio = runs > 0 ? Math.min(100, Math.round((runs / Math.max(runs, 20)) * 100)) : 0;

  const items = [
    {
      label: "Hours Saved",
      value: totalHoursSaved >= 10 ? `${totalHoursSaved.toFixed(0)}h` : `${totalHoursSaved.toFixed(1)}h`,
      caption: "vs. manual regression",
      icon: Timer,
      bgClass: "bg-[hsl(228_71%_12%)] text-white",
      sub: "text-white/70",
      accent: "text-white",
    },
    {
      label: "Defects Surfaced",
      value: bugsCaught,
      caption: bugsCaught > 0 ? "before reaching production" : "release-ready quality",
      icon: Shield,
      bgClass: "bg-[hsl(217_39%_13%)] text-white",
      sub: "text-white/70",
      accent: "text-white",
    },
    {
      label: "Automated Coverage",
      value: `${coverageRatio}%`,
      caption: `${runs} run${runs === 1 ? "" : "s"} executed`,
      icon: CheckCircle2,
      bgClass: "bg-[hsl(209_34%_25%)] text-white",
      sub: "text-white/70",
      accent: "text-white",
    },
    {
      label: "Confidence Index",
      value: passed > 0 ? "High" : runs > 0 ? "Watch" : "—",
      caption: "from execution + healing signals",
      icon: Sparkles,
      bgClass: "bg-[hsl(207_32%_45%)] text-white",
      sub: "text-white/75",
      accent: "text-white",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="card-impact-strip">
      {items.map((it) => (
        <div
          key={it.label}
          className={`relative overflow-hidden rounded-xl px-4 py-4 ${it.bgClass} shadow-sm`}
        >
          <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-white/5" aria-hidden />
          <div className="relative flex items-start justify-between gap-2">
            <div>
              <div className={`text-[10px] uppercase tracking-wider font-semibold ${it.sub}`}>{it.label}</div>
              <div className={`text-[26px] leading-none font-bold tabular-nums mt-2 ${it.accent}`}>{it.value}</div>
              <div className={`text-[11px] mt-2 ${it.sub}`}>{it.caption}</div>
            </div>
            <div className="h-8 w-8 rounded-md bg-white/10 flex items-center justify-center">
              <it.icon className="h-4 w-4 text-white" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function PredictiveAnalytics({ overview }: { overview: AnalyticsOverview | undefined }) {
  const ROYAL = "hsl(228 71% 12%)";
  const NAVY = "hsl(217 39% 13%)";
  const MID = "hsl(209 34% 25%)";
  const BG = "hsl(207 32% 65%)";
  const RED = "hsl(0 70% 55%)";
  const AMBER = "hsl(38 92% 50%)";
  const EMERALD = "hsl(160 84% 39%)";

  // Build dot-plot dataset: pass rate (Y) vs avg duration in seconds (X), bubble size = runs.
  // Combine slowest + flakiest, dedupe by id, only keep tests with at least one run.
  const cases = (() => {
    const map = new Map<string, any>();
    for (const c of overview?.slowest ?? []) map.set(c.id, c);
    for (const c of overview?.flakiest ?? []) if (!map.has(c.id)) map.set(c.id, c);
    return Array.from(map.values()).filter((c: any) => (c.runs ?? 0) > 0);
  })();

  const dots = cases.map((c: any) => {
    const passRate = c.runs > 0 ? Math.round((c.passed / c.runs) * 1000) / 10 : 0;
    const durSec = Math.max(0.1, Math.round((c.avg_duration_ms ?? 0) / 100) / 10);
    return {
      x: durSec,
      y: passRate,
      z: Math.max(40, c.runs * 30),
      title: c.title,
      project: c.project_name,
      runs: c.runs,
      failed: c.failed,
      passed: c.passed,
      flakiness: c.flakiness_pct,
      ready: passRate >= 90,
      watch: passRate >= 60 && passRate < 90,
      risk: passRate < 60,
    };
  });

  // ── Stability Index (a veteran QE director's view) ──────────────────────────
  // Stability ≠ pass rate. It's *consistency / predictability* of the suite over time.
  // We score 4 dimensions on a 0–25 scale each, then sum to a 0–100 stability index.
  //   · Consistency  → low std-dev of daily pass-rate  (volatility hurts release planning)
  //   · Streak       → consecutive green days (≥90% pass)  (predictability)
  //   · Flake rate   → % of tests that flip pass↔fail        (signal noise)
  //   · Recovery     → MTTR speed when things break          (resilience)
  const t = overview?.totals;
  const passRate = t?.pass_rate ?? 0;
  const trend = overview?.trend ?? [];
  const last7 = trend.slice(-7);

  // Per-day pass rates (skip days with zero runs)
  const dailyPassRates = last7
    .filter((d) => (d.total ?? 0) > 0)
    .map((d) => (d.passed / d.total) * 100);
  const meanPR = dailyPassRates.length > 0 ? dailyPassRates.reduce((a, b) => a + b, 0) / dailyPassRates.length : 0;
  const variance = dailyPassRates.length > 0
    ? dailyPassRates.reduce((a, b) => a + (b - meanPR) ** 2, 0) / dailyPassRates.length
    : 0;
  const stdDev = Math.sqrt(variance); // 0 = perfectly consistent, ~50 = chaotic
  const consistencyScore = Math.max(0, 25 - Math.round(stdDev / 2));

  // Green-day streak from the most recent day backwards
  let streak = 0;
  for (let i = last7.length - 1; i >= 0; i--) {
    const d = last7[i];
    if ((d.total ?? 0) === 0) continue;
    const pr = (d.passed / d.total) * 100;
    if (pr >= 90) streak++;
    else break;
  }
  const streakScore = Math.min(25, streak * 5); // 5 days = full marks

  // Flake rate (signal noise) — tests that have flipped at least once
  const totalTests = (overview?.slowest?.length ?? 0) + (overview?.flakiest?.length ?? 0);
  const flakeCount = t?.flaky_tests ?? 0;
  const flakePct = totalTests > 0 ? (flakeCount / Math.max(totalTests, 1)) * 100 : 0;
  const flakeScore = Math.max(0, 25 - Math.round(flakePct));

  // Recovery (MTTR) — anything under 15 min = great, > 2h = poor
  const mttrMin = t?.mttr_ms ? t.mttr_ms / 60000 : null;
  const recoveryScore = mttrMin === null
    ? 25 // no failures yet → don't penalize
    : mttrMin <= 15 ? 25
    : mttrMin <= 30 ? 22
    : mttrMin <= 60 ? 18
    : mttrMin <= 120 ? 12
    : 5;

  const stability = Math.max(0, Math.min(100, consistencyScore + streakScore + flakeScore + recoveryScore));
  const stabilityData = [{ name: "stability", value: stability, fill: stability >= 80 ? EMERALD : stability >= 60 ? AMBER : RED }];
  const stabilityVerdict = stability >= 90 ? "Ship-Ready" : stability >= 75 ? "Strong" : stability >= 60 ? "Caution" : "Hold Release";

  // ── Defect Forecast — Holt's linear-trend exponential smoothing + 80% PI ────
  // Double exponential smoothing (Holt 1957). Suitable for short series with trend
  // but no seasonality. We fit on the in-sample window, compute one-step-ahead
  // residuals, then build an 80% prediction interval ŷ_h ± 1.28·σ·√h.
  const series = last7.map((d) => d.failed ?? 0);
  const holt = (() => {
    const HORIZON = 3;
    const alpha = 0.5; // level smoothing (more weight to recent obs)
    const beta = 0.3; // trend smoothing
    if (series.length < 2) {
      const flat = series[0] ?? 0;
      return { fitted: series, forecast: Array(HORIZON).fill(flat), sigma: 0, slope: 0 };
    }
    let level = series[0];
    let trend = series[1] - series[0];
    const fitted: number[] = [level];
    for (let i = 1; i < series.length; i++) {
      const prevLevel = level;
      level = alpha * series[i] + (1 - alpha) * (level + trend);
      trend = beta * (level - prevLevel) + (1 - beta) * trend;
      fitted.push(level);
    }
    // residual std-dev (Bessel correction)
    const residuals = series.map((y, i) => y - fitted[i]);
    const meanRes = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const variance = residuals.reduce((a, b) => a + (b - meanRes) ** 2, 0) / Math.max(1, residuals.length - 1);
    const sigma = Math.sqrt(variance);
    const fc: number[] = [];
    for (let h = 1; h <= HORIZON; h++) fc.push(level + h * trend);
    return { fitted, forecast: fc, sigma, slope: trend };
  })();
  const Z80 = 1.282; // 80% normal quantile
  const slope = holt.slope;
  const forecast = [
    ...last7.map((d, i) => ({
      label: d.label,
      actual: d.failed,
      forecast: null as number | null,
      lower: null as number | null,
      upper: null as number | null,
      total: d.total,
    })),
    ...holt.forecast.map((yhat, idx) => {
      const h = idx + 1;
      const band = Z80 * holt.sigma * Math.sqrt(h);
      return {
        label: `+${h}d`,
        actual: null as number | null,
        forecast: Math.max(0, Math.round(yhat * 10) / 10),
        lower: Math.max(0, Math.round((yhat - band) * 10) / 10),
        upper: Math.max(0, Math.round((yhat + band) * 10) / 10),
        total: 0,
      };
    }),
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4" data-testid="card-predictive">
      {/* Production Readiness Dot Plot */}
      <Card className="p-5 lg:col-span-2" data-testid="card-readiness-plot">
        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Target className="h-4 w-4 text-primary" /> Production Readiness Map
            </h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              Pass rate vs. execution time · bubble size = run volume · zones = release confidence
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: EMERALD }} /> Ready</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: AMBER }} /> Watch</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: RED }} /> At Risk</span>
          </div>
        </div>
        {dots.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ top: 10, right: 16, bottom: 24, left: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" />
              <XAxis
                type="number"
                dataKey="x"
                name="Avg duration"
                unit="s"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                label={{ value: "Avg execution time (s)", position: "insideBottom", offset: -10, style: { fontSize: 11, fill: "hsl(var(--muted-foreground))" } }}
              />
              <YAxis
                type="number"
                dataKey="y"
                domain={[0, 100]}
                unit="%"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
                label={{ value: "Pass rate", angle: -90, position: "insideLeft", style: { fontSize: 11, fill: "hsl(var(--muted-foreground))", textAnchor: "middle" } }}
              />
              <ZAxis type="number" dataKey="z" range={[80, 480]} />
              <ReferenceArea y1={90} y2={100} fill={EMERALD} fillOpacity={0.06} />
              <ReferenceArea y1={60} y2={90} fill={AMBER} fillOpacity={0.05} />
              <ReferenceArea y1={0} y2={60} fill={RED} fillOpacity={0.05} />
              <ReferenceLine y={90} stroke={EMERALD} strokeDasharray="4 4" strokeOpacity={0.5} />
              <ReferenceLine y={60} stroke={RED} strokeDasharray="4 4" strokeOpacity={0.5} />
              <Tooltip
                cursor={{ strokeDasharray: "3 3", stroke: ROYAL }}
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const p: any = payload[0].payload;
                  const tone = p.ready ? "text-emerald-600" : p.watch ? "text-amber-600" : "text-red-600";
                  return (
                    <div className="rounded-lg border bg-card p-3 shadow-md text-xs max-w-[260px]">
                      <div className="font-semibold text-foreground truncate">{p.title}</div>
                      {p.project && <div className="text-[10px] text-muted-foreground mt-0.5">{p.project}</div>}
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                        <div><span className="text-muted-foreground">Pass rate:</span> <span className={`font-semibold ${tone}`}>{p.y}%</span></div>
                        <div><span className="text-muted-foreground">Runs:</span> <span className="font-semibold">{p.runs}</span></div>
                        <div><span className="text-muted-foreground">Avg time:</span> <span className="font-semibold">{p.x}s</span></div>
                        <div><span className="text-muted-foreground">Failed:</span> <span className="font-semibold">{p.failed}</span></div>
                      </div>
                    </div>
                  );
                }}
              />
              <Scatter data={dots.filter((d) => d.ready)} fill={EMERALD} fillOpacity={0.85} stroke="white" strokeWidth={1.5} />
              <Scatter data={dots.filter((d) => d.watch)} fill={AMBER} fillOpacity={0.85} stroke="white" strokeWidth={1.5} />
              <Scatter data={dots.filter((d) => d.risk)} fill={RED} fillOpacity={0.85} stroke="white" strokeWidth={1.5} />
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="Run a few tests to populate the readiness map — each test will appear as a dot." />
        )}
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
          <div className="rounded-md border border-emerald-200/60 bg-emerald-50/50 px-3 py-2">
            <div className="font-semibold text-emerald-700">{dots.filter((d) => d.ready).length} Ready</div>
            <div className="text-muted-foreground text-[10px]">≥90% pass · safe to release</div>
          </div>
          <div className="rounded-md border border-amber-200/60 bg-amber-50/50 px-3 py-2">
            <div className="font-semibold text-amber-700">{dots.filter((d) => d.watch).length} Watch</div>
            <div className="text-muted-foreground text-[10px]">60–89% · review failures</div>
          </div>
          <div className="rounded-md border border-red-200/60 bg-red-50/50 px-3 py-2">
            <div className="font-semibold text-red-700">{dots.filter((d) => d.risk).length} At Risk</div>
            <div className="text-muted-foreground text-[10px]">{"<60%"} · block release</div>
          </div>
        </div>
      </Card>

      {/* Stability Index — consistency, not just pass rate */}
      <Card className="p-5 flex flex-col" data-testid="card-stability-index">
        <div className="flex items-start justify-between mb-2">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" /> Stability Index
            </h3>
            <p className="text-[11px] text-muted-foreground mt-1">Predictability over time, not just today's pass rate</p>
          </div>
          <Badge
            variant="outline"
            className={
              stability >= 80
                ? "bg-emerald-50 text-emerald-700 border-emerald-200/80 text-[10px] font-semibold"
                : stability >= 60
                  ? "bg-amber-50 text-amber-700 border-amber-200/80 text-[10px] font-semibold"
                  : "bg-red-50 text-red-700 border-red-200/80 text-[10px] font-semibold"
            }
          >
            {stabilityVerdict}
          </Badge>
        </div>
        <div className="relative flex items-center justify-center min-h-[180px]">
          <ResponsiveContainer width="100%" height={200}>
            <RadialBarChart innerRadius="70%" outerRadius="100%" data={stabilityData} startAngle={210} endAngle={-30}>
              <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
              <RadialBar dataKey="value" cornerRadius={12} background={{ fill: "hsl(207 32% 92%)" }} />
            </RadialBarChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-[36px] leading-none font-bold tabular-nums text-foreground" data-testid="text-stability-score">{stability}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1.5">out of 100</div>
          </div>
        </div>
        <div className="mt-3 space-y-1.5 text-[11px]">
          <StabilityDimRow
            label="Consistency"
            hint={`σ ${stdDev.toFixed(1)}% day-to-day`}
            score={consistencyScore}
            max={25}
          />
          <StabilityDimRow
            label="Green streak"
            hint={`${streak} consecutive day${streak === 1 ? "" : "s"} ≥ 90%`}
            score={streakScore}
            max={25}
          />
          <StabilityDimRow
            label="Flake noise"
            hint={`${flakeCount} flaky · ${flakePct.toFixed(0)}% of tests`}
            score={flakeScore}
            max={25}
          />
          <StabilityDimRow
            label="Recovery (MTTR)"
            hint={mttrMin === null ? "no failures" : mttrMin <= 60 ? `${Math.round(mttrMin)}m to fix` : `${(mttrMin / 60).toFixed(1)}h to fix`}
            score={recoveryScore}
            max={25}
          />
        </div>
      </Card>

      {/* Defect Forecast — Holt linear-trend exponential smoothing + 80% PI */}
      <Card className="p-5 lg:col-span-2" data-testid="card-defect-forecast">
        <div className="flex items-start justify-between mb-3 flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" /> Defect Forecast
              <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-wider h-4 px-1.5 ml-1 bg-primary/5 border-primary/20 text-primary">Holt · α=0.5 β=0.3</Badge>
            </h3>
            <p className="text-[11px] text-muted-foreground mt-1">
              Double exponential smoothing · 80% prediction interval · {slope > 0.1 ? "trending up — investigate" : slope < -0.1 ? "trending down — improving" : "stable"}
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: ROYAL }} /> Actual</span>
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-3" style={{ background: BG }} /> Forecast</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: BG, opacity: 0.25 }} /> 80% PI</span>
          </div>
        </div>
        {forecast.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <ComposedChart
              data={forecast.map((d) => ({
                ...d,
                band: d.lower != null && d.upper != null ? [d.lower, d.upper] : null,
              }))}
              margin={{ top: 8, right: 16, left: -16, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                labelStyle={{ fontWeight: 600 }}
                formatter={(v: any, name: string) => {
                  if (name === "band") return [Array.isArray(v) ? `${v[0]} – ${v[1]}` : v, "80% PI"];
                  if (name === "actual") return [v, "Actual"];
                  if (name === "forecast") return [v, "Forecast (Holt)"];
                  return [v, name];
                }}
              />
              <Area type="monotone" dataKey="band" stroke="none" fill={BG} fillOpacity={0.2} connectNulls />
              <Bar dataKey="actual" fill={ROYAL} radius={[6, 6, 0, 0]} maxBarSize={28}>
                <LabelList dataKey="actual" position="top" style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
              </Bar>
              <Line
                type="monotone"
                dataKey="forecast"
                stroke={MID}
                strokeWidth={2.5}
                strokeDasharray="5 4"
                dot={{ r: 4, fill: BG, stroke: MID, strokeWidth: 2 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <EmptyChart message="No execution history yet — forecast appears once tests run." />
        )}
        <div className="mt-2 text-[10px] text-muted-foreground/80">
          Residual σ = {holt.sigma.toFixed(2)} · trend = {slope >= 0 ? "+" : ""}{slope.toFixed(2)} fail/day
        </div>
      </Card>

      {/* Risk Hotspots — Bayesian failure probability per test */}
      <Card className="p-5" data-testid="card-risk-hotspots">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Flame className="h-4 w-4 text-red-500" /> Failure Probability
              <Badge variant="outline" className="text-[9px] font-mono uppercase tracking-wider h-4 px-1.5 ml-1 bg-primary/5 border-primary/20 text-primary">Beta-Bin</Badge>
            </h3>
            <p className="text-[11px] text-muted-foreground mt-1">P(fail next run) · Beta(1+f, 1+p) posterior + flake adj.</p>
          </div>
          <Badge variant="outline" className="text-[10px]">Top 5</Badge>
        </div>
        {(() => {
          // Bayesian posterior mean of failure probability with a uniform Beta(1,1) prior.
          // E[p|data] = (1 + failed) / (2 + failed + passed)
          // Adds a small bonus for measured flakiness — a flaky test is more likely to fail next run.
          const hotspots = [...dots]
            .map((d) => {
              const baseProb = (1 + d.failed) / (2 + d.failed + d.passed);
              const flakeBoost = Math.min(0.15, (d.flakiness ?? 0) / 200);
              const prob = Math.min(0.99, baseProb + flakeBoost);
              return {
                ...d,
                name: d.title.length > 24 ? d.title.slice(0, 24) + "…" : d.title,
                fullName: d.title,
                prob: Math.round(prob * 1000) / 10, // %
                probRaw: prob,
              };
            })
            .sort((a, b) => b.probRaw - a.probRaw)
            .slice(0, 5);
          if (hotspots.length === 0) {
            return <EmptyChart message="No execution data yet — run tests to compute failure probabilities." />;
          }
          return (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={hotspots} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" horizontal={false} />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  unit="%"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={130}
                  tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
                  axisLine={false}
                  tickLine={false}
                />
                <ReferenceLine x={50} stroke={AMBER} strokeDasharray="3 3" strokeOpacity={0.6} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid hsl(var(--border))" }}
                  content={({ active, payload }) => {
                    if (!active || !payload || !payload.length) return null;
                    const p: any = payload[0].payload;
                    return (
                      <div className="rounded-lg border bg-card p-3 shadow-md text-xs max-w-[260px]">
                        <div className="font-semibold text-foreground truncate">{p.fullName}</div>
                        {p.project && <div className="text-[10px] text-muted-foreground mt-0.5">{p.project}</div>}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
                          <div><span className="text-muted-foreground">P(fail):</span> <span className="font-semibold tabular-nums">{p.prob}%</span></div>
                          <div><span className="text-muted-foreground">Sample:</span> <span className="font-semibold">{p.runs} runs</span></div>
                          <div><span className="text-muted-foreground">Failed:</span> <span className="font-semibold">{p.failed}</span></div>
                          <div><span className="text-muted-foreground">Flake:</span> <span className="font-semibold">{(p.flakiness ?? 0).toFixed(0)}%</span></div>
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="prob" radius={[0, 6, 6, 0]} maxBarSize={22}>
                  {hotspots.map((h, i) => (
                    <Cell key={i} fill={h.probRaw >= 0.5 ? RED : h.probRaw >= 0.25 ? AMBER : EMERALD} />
                  ))}
                  <LabelList
                    dataKey="prob"
                    position="right"
                    formatter={(v: any) => `${v}%`}
                    style={{ fontSize: 11, fill: "hsl(var(--foreground))", fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          );
        })()}
      </Card>
    </div>
  );
}

function StabilityDimRow({ label, hint, score, max }: { label: string; hint: string; score: number; max: number }) {
  const pct = Math.round((score / max) * 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground/80 tabular-nums">{score}/{max}</span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground/80">{hint}</div>
    </div>
  );
}

function PipelineNode({
  icon: Icon,
  label,
  value,
  href,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | string;
  href: string;
  accent: "domains" | "projects" | "applications" | "test-suites" | "design" | "healing";
}) {
  // Subtle accent stripe/tint per node — classy not noisy
  const tints: Record<string, string> = {
    domains: "before:bg-[hsl(228_71%_12%)]",
    projects: "before:bg-[hsl(217_39%_13%)]",
    applications: "before:bg-[hsl(209_34%_25%)]",
    "test-suites": "before:bg-[hsl(209_34%_35%)]",
    design: "before:bg-[hsl(207_32%_45%)]",
    healing: "before:bg-[hsl(207_32%_55%)]",
  };
  return (
    <Link href={href} className="flex-1 min-w-[140px]">
      <div className={`group relative rounded-xl border border-border bg-card p-4 text-left cursor-pointer transition-all hover:border-primary/40 hover:shadow-md hover-elevate before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r ${tints[accent]}`}>
        <div className="flex items-start justify-between mb-3">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{label}</div>
          <div className={`h-7 w-7 rounded-md flex items-center justify-center module-chip-${accent}`}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        </div>
        <div className="text-[28px] font-bold tabular-nums text-foreground leading-none">{value}</div>
        <div className="flex items-center gap-1 mt-3 text-[11px] font-medium text-primary/80 group-hover:text-primary transition-colors">
          <span>View</span>
          <ArrowRight className="h-3 w-3" />
        </div>
      </div>
    </Link>
  );
}

function PipelineArrow() {
  return null;
}

function KpiTile({
  label,
  value,
  subtitle,
  icon: Icon,
  tone,
  testId,
  loading,
}: {
  label: string;
  value: string | number;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "success" | "danger" | "warn" | "info" | "neutral";
  testId?: string;
  loading?: boolean;
}) {
  const toneClasses: Record<string, string> = {
    success: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40",
    danger: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40",
    warn: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40",
    info: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40",
    neutral: "text-muted-foreground bg-muted",
  };
  return (
    <Card className="p-3 hover-elevate">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className={"h-7 w-7 rounded-md flex items-center justify-center " + toneClasses[tone]}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      {loading ? (
        <Skeleton className="h-6 w-16 mt-2" />
      ) : (
        <div className="mt-1.5 text-xl font-bold tabular-nums" data-testid={testId}>
          {value}
        </div>
      )}
      {subtitle && <div className="text-[10px] text-muted-foreground mt-0.5">{subtitle}</div>}
    </Card>
  );
}

function InventoryItem({
  label,
  value,
  icon: Icon,
  href,
  testId,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  href: string;
  testId?: string;
}) {
  return (
    <Link href={href}>
      <div className="rounded-md border border-border/60 bg-muted/20 hover:bg-muted/40 hover-elevate cursor-pointer p-3 transition-colors" data-testid={testId}>
        <div className="flex items-center justify-between">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40" />
        </div>
        <div className="mt-1.5 text-xl font-bold tabular-nums">{value}</div>
        <div className="text-[11px] text-muted-foreground">{label}</div>
      </div>
    </Link>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-56 text-center px-6">
      <Activity className="h-8 w-8 text-muted-foreground/40 mb-2" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

function ListCard({
  title,
  icon: Icon,
  iconColor,
  items,
  empty,
  loading,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
  empty: string;
  loading?: boolean;
  items: Array<{
    id: string;
    href: string;
    title: string;
    subtitle?: string;
    metric: string;
    metricLabel?: string;
    tone: "danger" | "info" | "warn";
  }>;
}) {
  const toneCls: Record<string, string> = {
    danger: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/30",
    info: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/30",
    warn: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30",
  };
  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
        <Icon className={"h-4 w-4 " + iconColor} />
        {title}
      </h3>
      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : items.length === 0 ? (
        <div className="text-xs text-muted-foreground italic py-6 text-center">
          <CheckCircle2 className="h-5 w-5 mx-auto mb-1.5 text-emerald-500/60" />
          {empty}
        </div>
      ) : (
        <div className="space-y-1">
          {items.map((it) => (
            <Link key={it.id} href={it.href} className="block">
              <div className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 transition-colors" data-testid={`list-item-${it.id}`}>
                <div className={"h-9 px-2.5 min-w-[3.5rem] rounded-md flex items-center justify-center font-bold text-sm tabular-nums " + toneCls[it.tone]}>
                  {it.metric}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{it.title}</div>
                  {it.subtitle && <div className="text-[11px] text-muted-foreground truncate">{it.subtitle}</div>}
                </div>
                {it.metricLabel && (
                  <div className="text-[11px] text-muted-foreground hidden sm:block">{it.metricLabel}</div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}

interface RunDetail {
  id: string;
  case_title: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number;
  total_scenarios: number;
  passed_scenarios: number;
  failed_scenarios: number;
  errors: number;
  summary: string;
  log?: string;
  log_excerpt?: string;
  full_log?: string;
  scenarios: Array<{ name: string; status: string; errors: number; actions: number; order_index: number }>;
}

function RecentRunRow({ run }: { run: import("@/types").RecentRunEntry }) {
  const [expanded, setExpanded] = useState(false);
  const isPass = run.status === "passed";
  const isRunning = run.status === "running";

  const { data: detail, isLoading: detailLoading } = useQuery<RunDetail>({
    queryKey: ["/api/analytics/run", run.run_id],
    enabled: expanded,
    queryFn: async () => {
      const res = await fetch(`/api/analytics/run/${run.run_id}`);
      if (!res.ok) throw new Error("Failed to load run");
      return res.json();
    },
  });

  return (
    <div className="rounded-md border border-transparent hover:border-border bg-transparent hover:bg-muted/30 transition-colors" data-testid={`recent-run-${run.run_id}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 p-2.5 text-left"
        data-testid={`button-toggle-run-${run.run_id}`}
      >
        <div className="text-muted-foreground shrink-0">
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </div>
        <div
          className={
            "h-8 w-8 rounded-full flex items-center justify-center shrink-0 " +
            (isRunning
              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 animate-pulse"
              : isPass
              ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400"
              : "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400")
          }
        >
          {isRunning ? <Activity className="h-4 w-4" /> : isPass ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate flex items-center gap-2">
            <span className="truncate">{run.case_title}</span>
            {run.triage && <TriageBadge triage={run.triage as unknown as Triage} />}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">
            {[run.project_name, run.suite_name].filter(Boolean).join(" · ") || "—"}
            {run.summary ? ` — ${run.summary}` : ""}
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-[11px] text-muted-foreground">
          <Badge variant="outline" className="h-5 text-[10px]">
            {isRunning ? "running…" : `${run.passed_scenarios}/${run.total_scenarios} scenarios`}
          </Badge>
          {!isRunning && <span className="tabular-nums">{formatDuration(run.duration_ms)}</span>}
          <span>·</span>
          <span>{formatRelative(run.started_at)}</span>
        </div>
        <span className="text-[11px] text-violet-600 dark:text-violet-400 font-medium hidden md:inline">
          {expanded ? "Hide log" : "View log"}
        </span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 space-y-3" data-testid={`logviewer-run-${run.run_id}`}>
          {(run.status === "failed" || run.status === "error") && (
            <TriageCard
              runId={run.run_id}
              initialTriage={(run.triage as unknown as Triage) ?? undefined}
            />
          )}
          {detailLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (detail?.full_log || detail?.log_excerpt || detail?.log) ? (
            <LogViewer
              log={detail.full_log || detail.log_excerpt || detail.log || ""}
              maxHeight="320px"
              defaultExpanded
              testId={`logviewer-${run.run_id}`}
            />
          ) : (
            <div className="text-xs text-muted-foreground italic py-4 text-center border border-dashed rounded-md">
              No log captured for this run.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface RiskSnapshotLite {
  project_id: string;
  project_name?: string;
  score: number;
  band: "LOW" | "MEDIUM" | "HIGH";
  recommendation: string;
  reasons: Array<{ label: string; raw: string; band: string; sub_score: number; weight: number; contribution: number; detail: string; factor: string }>;
  computed_at: string;
}

// Shared module-level store so Header and Hero stay synchronized.
let _riskProjectId: string | null = (() => {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem("kit:risk:project"); } catch { return null; }
})();
const _riskProjectListeners = new Set<(id: string | null) => void>();
function _setRiskProject(id: string | null) {
  _riskProjectId = id;
  try { if (id) localStorage.setItem("kit:risk:project", id); } catch {}
  _riskProjectListeners.forEach((fn) => fn(id));
}

function useProjectRiskState() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(_riskProjectId);
  useEffect(() => {
    const fn = (id: string | null) => setSelectedProjectId(id);
    _riskProjectListeners.add(fn);
    return () => { _riskProjectListeners.delete(fn); };
  }, []);

  const { data: projects } = useQuery<Project[]>({ queryKey: ["/api/projects"] });
  const projectIds = (projects ?? []).map((p) => p.id);
  const validSelected = selectedProjectId && projectIds.includes(selectedProjectId) ? selectedProjectId : null;
  const effectiveId = validSelected || projects?.[0]?.id || null;

  const setAndPersist = (id: string) => _setRiskProject(id);

  const { data: snap, isLoading: snapLoading } = useQuery<RiskSnapshotLite>({
    queryKey: ["/api/projects", effectiveId, "risk"],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${effectiveId}/risk`);
      if (!res.ok) throw new Error("Failed to load risk");
      return res.json();
    },
    enabled: !!effectiveId,
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  return { projects: projects ?? [], effectiveId, setAndPersist, snap, snapLoading };
}

function ReleaseReadinessHeader() {
  const { snap, effectiveId, snapLoading } = useProjectRiskState();
  if (!effectiveId || !snap) {
    const label = !effectiveId
      ? "No projects yet"
      : snapLoading
        ? "Computing…"
        : "Awaiting data";
    return (
      <div className="rounded-lg border border-border bg-card px-3.5 py-1.5 flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-md flex items-center justify-center bg-primary/10 text-primary">
          <Shield className="h-4 w-4" />
        </div>
        <div className="text-left">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Release Readiness</div>
          <div className="text-xs font-semibold text-foreground">{label}</div>
        </div>
      </div>
    );
  }
  return (
    <Link href={`/projects/${effectiveId}/readiness`} data-testid="link-readiness-header">
      <div className="rounded-lg border border-border bg-card px-3.5 py-1.5 flex items-center gap-2.5 hover-elevate cursor-pointer">
        <RiskGauge score={snap.score} band={snap.band} size={36} showLabel={false} />
        <div className="text-left">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Release Readiness</div>
          <div className={`text-xs font-semibold ${bandTextClass(snap.band)}`}>{snap.band} · {snap.recommendation}</div>
        </div>
      </div>
    </Link>
  );
}

function ReleaseReadinessHero() {
  const { projects, effectiveId, setAndPersist, snap } = useProjectRiskState();
  const [showWhy, setShowWhy] = useState(false);

  if (projects.length === 0) {
    return null;
  }
  if (!snap) {
    return (
      <Card className="p-5">
        <Skeleton className="h-32 w-full" />
      </Card>
    );
  }

  const top3 = (snap.reasons ?? []).slice(0, 3);

  return (
    <Card className="p-5" data-testid="card-release-readiness-hero">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-primary/10 text-primary">
            <Shield className="h-4 w-4" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">Wow Capability · Executive Go/No-Go</div>
            <h3 className="text-sm font-semibold">Release Readiness</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {projects.length > 1 && (
            <Select value={effectiveId ?? undefined} onValueChange={setAndPersist}>
              <SelectTrigger className="h-8 text-xs w-[200px]" data-testid="select-risk-project">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Link href={`/projects/${effectiveId}/readiness`}>
            <span className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-1" data-testid="link-readiness-detail">
              Open <ArrowRight className="h-3 w-3" />
            </span>
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-6 flex-wrap">
        <RiskGauge score={snap.score} band={snap.band} size={140} />
        <div className="flex-1 min-w-[240px]">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`text-[10px] font-bold tracking-wider border-current ${bandTextClass(snap.band)}`} data-testid="badge-hero-band">
              <BandIcon band={snap.band} className="h-3 w-3 mr-1" />
              {snap.band}
            </Badge>
            <span className="text-[11px] text-muted-foreground">{snap.project_name}</span>
          </div>
          <div className="text-xl font-semibold mt-2 text-foreground">{snap.recommendation}</div>
          <button
            type="button"
            className="text-[11px] text-primary hover:underline mt-1.5 inline-flex items-center gap-1"
            onClick={() => setShowWhy((s) => !s)}
            data-testid="button-toggle-why"
          >
            {showWhy ? "Hide" : "Why?"}
            {showWhy ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {showWhy && (
        <div className="mt-4 pt-4 border-t border-border space-y-2.5" data-testid="region-why-breakdown">
          {snap.reasons.map((r) => (
            <div key={r.factor} className="text-[12px]">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">
                  {r.label}: <span className="font-normal">{r.raw}</span>
                </span>
                <Badge variant="outline" className={`text-[9px] font-semibold ${bandTextClass(r.band as RiskBandType)} border-current`}>
                  {r.band}
                </Badge>
              </div>
              <div className="h-1.5 mt-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${r.sub_score}%`,
                    background: r.band === "HIGH" ? "hsl(0 60% 50%)" : r.band === "MEDIUM" ? "hsl(36 80% 45%)" : "hsl(150 55% 38%)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {!showWhy && top3.length > 0 && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2" data-testid="region-top-drivers">
          {top3.map((r) => (
            <div key={r.factor} className="rounded-md border border-border px-2.5 py-1.5">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{r.label}</div>
              <div className="text-[11px] font-medium truncate">{r.raw}</div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
