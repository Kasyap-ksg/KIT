import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Shield,
  ShieldCheck,
  ShieldX,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  ArrowRight,
  Wand2,
  FileCode2,
  Clock,
  Beaker,
  ExternalLink,
  TestTubes,
} from "lucide-react";

type Alternate = { selector: string; reason: string; confidence: number };

type Proposal = {
  id: string;
  test_case_id: string | null;
  test_suite_id: string | null;
  test_run_id: string | null;
  test_case_title: string;
  scenario_name: string;
  application_name: string;
  broken_action: string;
  broken_selector: string;
  broken_value: string;
  error_message: string;
  dom_snippet: string;
  page_url: string;
  proposed_selector: string;
  proposed_action: string;
  proposed_value: string;
  ai_reasoning: string;
  ai_confidence: number;
  risk_level: string;
  model: string;
  alternates: Alternate[];
  status: "pending" | "approved" | "rejected" | "applied" | "failed";
  reviewer: string;
  review_notes: string;
  reviewed_at: string | null;
  applied_at: string | null;
  application_diff: string;
  source: string;
  created_at: string | null;
};

type ListResp = {
  proposals: Proposal[];
  counts: { pending: number; approved: number; applied: number; rejected: number; failed: number; total: number };
};

const RISK_COLORS: Record<string, string> = {
  low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  high: "bg-red-50 text-red-700 border-red-200",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-[hsl(207_40%_93%)] text-[hsl(228_71%_12%)] border-[hsl(207_32%_75%)]",
  applied: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-red-50 text-red-700 border-red-200",
  failed: "bg-muted text-muted-foreground border-border",
};

export default function SelfHealingPage() {
  const [tab, setTab] = useState<string>("pending");
  const [reviewing, setReviewing] = useState<{ proposal: Proposal; mode: "approve" | "reject" } | null>(null);
  const [reviewer, setReviewer] = useState("qa-reviewer");
  const [notes, setNotes] = useState("");
  const { toast } = useToast();

  const { data, isLoading } = useQuery<ListResp>({
    queryKey: ["/api/healing/proposals", tab],
    queryFn: async () => {
      const res = await fetch(`/api/healing/proposals?status=${tab}`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  });

  const seedDemo = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/healing/seed-demo?count=3", {});
      return res.json();
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["/api/healing/proposals"] });
      toast({ title: "Demo proposals created", description: `Added ${r?.count ?? 3} pending proposals to review.` });
    },
    onError: (e: any) => toast({ title: "Failed to seed demo", description: String(e), variant: "destructive" }),
  });

  const review = useMutation({
    mutationFn: async ({ id, mode, payload }: { id: string; mode: "approve" | "reject"; payload: any }) => {
      const res = await apiRequest("POST", `/api/healing/proposals/${id}/${mode}`, payload);
      return res.json();
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ["/api/healing/proposals"] });
      setReviewing(null);
      setNotes("");
      toast({
        title: vars.mode === "approve" ? "Healing applied" : "Healing rejected",
        description: vars.mode === "approve" ? "The fix has been merged into the test case and audit-logged." : "Marked as rejected with your notes.",
      });
    },
    onError: (e: any) => toast({ title: "Review failed", description: String(e), variant: "destructive" }),
  });

  const counts = data?.counts ?? { pending: 0, approved: 0, applied: 0, rejected: 0, failed: 0, total: 0 };
  const proposals = data?.proposals ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6" data-testid="page-self-healing">
      {/* Header — editorial, brand-aligned */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Badge variant="outline" className="text-[10px] gap-1 h-5 border-primary/20 text-primary bg-primary/5">
              <Sparkles className="h-3 w-3" /> Governed AI
            </Badge>
            <span className="text-[11px] text-muted-foreground">·</span>
            <span className="text-[11px] text-muted-foreground">Human-in-the-loop</span>
          </div>
          <h1 className="text-[28px] leading-none font-semibold tracking-tight text-foreground" data-testid="text-page-title">
            Self-Healing
          </h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            When a selector breaks, KIT proposes a precise fix backed by AI reasoning and a DOM snapshot. Every change ships only after a QE engineer approves — fully audit-logged.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => seedDemo.mutate()}
          disabled={seedDemo.isPending}
          data-testid="button-seed-demo"
          className="gap-2"
        >
          {seedDemo.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Beaker className="h-4 w-4" />}
          Generate Demo Proposals
        </Button>
      </div>

      {/* Impact strip — value of governed self-healing to the QE team */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ImpactCard
          label="Tests Auto-Recovered"
          value={counts.applied}
          caption="brought back online without code rewrites"
          icon={ShieldCheck}
          variant="royal"
          testid="impact-applied"
        />
        <ImpactCard
          label="Awaiting Approval"
          value={counts.pending}
          caption={counts.pending === 0 ? "queue is clean" : "ready for QE review"}
          icon={Clock}
          variant="navy"
          testid="impact-pending"
        />
        <ImpactCard
          label="Audit Decisions"
          value={counts.applied + counts.rejected}
          caption="every change traceable"
          icon={Shield}
          variant="midnight"
          testid="impact-decisions"
        />
        <ImpactCard
          label="Governance"
          value="100%"
          caption="zero auto-apply · human-in-loop"
          icon={Sparkles}
          variant="bluegray"
          testid="impact-governance"
        />
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList data-testid="tabs-status">
          <TabsTrigger value="pending" data-testid="tab-pending">Pending ({counts.pending})</TabsTrigger>
          <TabsTrigger value="applied" data-testid="tab-applied">Applied ({counts.applied})</TabsTrigger>
          <TabsTrigger value="rejected" data-testid="tab-rejected">Rejected ({counts.rejected})</TabsTrigger>
          <TabsTrigger value="all" data-testid="tab-all">All ({counts.total})</TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-4 space-y-3">
          {isLoading && (
            <Card className="p-12 flex flex-col items-center justify-center text-center" data-testid="state-loading">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground mt-3">Loading proposals…</p>
            </Card>
          )}

          {!isLoading && proposals.length === 0 && (
            <Card className="p-12 flex flex-col items-center justify-center text-center" data-testid="state-empty">
              <Shield className="h-10 w-10 text-muted-foreground" />
              <h3 className="text-lg font-semibold mt-3">No proposals in this view</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">
                When a test fails because a selector no longer matches the live DOM, an AI-proposed fix will land here for your review.
                Try the demo button above to see the full review flow.
              </p>
            </Card>
          )}

          {proposals.map((p) => (
            <ProposalCard
              key={p.id}
              proposal={p}
              onApprove={() => { setReviewer("qa-reviewer"); setNotes(""); setReviewing({ proposal: p, mode: "approve" }); }}
              onReject={() => { setReviewer("qa-reviewer"); setNotes(""); setReviewing({ proposal: p, mode: "reject" }); }}
            />
          ))}
        </TabsContent>
      </Tabs>

      {/* Review dialog */}
      <Dialog open={!!reviewing} onOpenChange={(o) => !o && setReviewing(null)}>
        <DialogContent data-testid="dialog-review">
          <DialogHeader>
            <DialogTitle>
              {reviewing?.mode === "approve" ? "Approve & Apply Healing" : "Reject Proposal"}
            </DialogTitle>
            <DialogDescription>
              {reviewing?.mode === "approve"
                ? "The proposed selector will replace the broken one in the test case and be appended to the self-healing audit log."
                : "Mark this proposal as rejected. The test case is left unchanged."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="reviewer-name">Reviewer</Label>
              <Input id="reviewer-name" value={reviewer} onChange={(e) => setReviewer(e.target.value)} data-testid="input-reviewer" />
            </div>
            <div>
              <Label htmlFor="review-notes">Notes (optional)</Label>
              <Textarea
                id="review-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={reviewing?.mode === "approve" ? "Why is this safe to apply?" : "Why are you rejecting?"}
                rows={3}
                data-testid="textarea-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewing(null)} data-testid="button-cancel-review">Cancel</Button>
            <Button
              onClick={() => reviewing && review.mutate({
                id: reviewing.proposal.id,
                mode: reviewing.mode,
                payload: { reviewer, notes },
              })}
              disabled={review.isPending}
              variant={reviewing?.mode === "approve" ? "default" : "destructive"}
              data-testid="button-confirm-review"
              className="gap-2"
            >
              {review.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {reviewing?.mode === "approve" ? <ShieldCheck className="h-4 w-4" /> : <ShieldX className="h-4 w-4" />}
              {reviewing?.mode === "approve" ? "Approve & Apply" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ImpactCard({
  label,
  value,
  caption,
  icon: Icon,
  variant,
  testid,
}: {
  label: string;
  value: number | string;
  caption: string;
  icon: any;
  variant: "royal" | "navy" | "midnight" | "bluegray";
  testid: string;
}) {
  const bg: Record<string, string> = {
    royal: "bg-[hsl(228_71%_12%)]",
    navy: "bg-[hsl(217_39%_13%)]",
    midnight: "bg-[hsl(209_34%_25%)]",
    bluegray: "bg-[hsl(207_32%_45%)]",
  };
  return (
    <div className={`relative overflow-hidden rounded-xl px-4 py-4 text-white shadow-sm ${bg[variant]}`} data-testid={testid}>
      <div className="absolute -top-8 -right-8 h-28 w-28 rounded-full bg-white/5" aria-hidden />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-semibold text-white/70">{label}</div>
          <div className="text-[26px] leading-none font-bold tabular-nums mt-2">{value}</div>
          <div className="text-[11px] mt-2 text-white/75">{caption}</div>
        </div>
        <div className="h-8 w-8 rounded-md bg-white/10 flex items-center justify-center">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  testid,
  subtitle,
}: {
  label: string;
  value: number | string;
  icon: any;
  accent: "amber" | "emerald" | "rose" | "blue" | "violet";
  testid: string;
  subtitle?: string;
}) {
  const ringMap = {
    amber: "ring-amber-500/20 text-amber-600 dark:text-amber-400",
    emerald: "ring-emerald-500/20 text-emerald-600 dark:text-emerald-400",
    rose: "ring-rose-500/20 text-rose-600 dark:text-rose-400",
    blue: "ring-blue-500/20 text-blue-600 dark:text-blue-400",
    violet: "ring-violet-500/20 text-violet-600 dark:text-violet-400",
  } as const;
  return (
    <Card className="p-4" data-testid={testid}>
      <div className="flex items-center gap-3">
        <div className={`h-9 w-9 rounded-md ring-1 ${ringMap[accent]} flex items-center justify-center bg-background`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-bold leading-none">{value}</div>
          <div className="text-xs text-muted-foreground mt-1 truncate">{label}</div>
          {subtitle && <div className="text-[10px] text-muted-foreground/70">{subtitle}</div>}
        </div>
      </div>
    </Card>
  );
}

function ProposalCard({
  proposal: p,
  onApprove,
  onReject,
}: {
  proposal: Proposal;
  onApprove: () => void;
  onReject: () => void;
}) {
  const isPending = p.status === "pending";
  return (
    <Card className="p-5 space-y-4" data-testid={`card-proposal-${p.id}`}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <Badge variant="outline" className={`${STATUS_COLORS[p.status] || ""} text-[10px] font-semibold uppercase tracking-wide`} data-testid={`badge-status-${p.id}`}>
              {p.status}
            </Badge>
            <Badge variant="outline" className={`${RISK_COLORS[p.risk_level] || RISK_COLORS.medium} text-[10px] font-semibold`} data-testid={`badge-risk-${p.id}`}>
              {p.risk_level} risk
            </Badge>
            <Badge variant="outline" className="text-[10px] font-semibold tabular-nums" data-testid={`badge-confidence-${p.id}`}>
              {p.ai_confidence}% confidence
            </Badge>
            {p.source === "demo" && (
              <Badge variant="outline" className="text-[10px] font-semibold bg-muted text-muted-foreground border-border">
                demo
              </Badge>
            )}
          </div>
          <h3 className="text-base font-semibold tracking-tight text-foreground" data-testid={`text-title-${p.id}`}>
            {p.test_case_title || "Untitled Test Case"}
          </h3>
          <div className="text-[11px] text-muted-foreground mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5">
            {p.scenario_name && <span>Scenario · <span className="text-foreground font-medium">{p.scenario_name}</span></span>}
            {p.application_name && <span>App · <span className="text-foreground font-medium">{p.application_name}</span></span>}
            {p.page_url && <span className="truncate max-w-[420px]">URL · <span className="text-foreground font-mono">{p.page_url}</span></span>}
          </div>
          {p.test_suite_id && p.test_case_id && (
            <Link
              href={`/test-suites/${p.test_suite_id}?focus=${p.test_case_id}`}
              className="inline-flex items-center gap-1.5 mt-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              data-testid={`link-test-case-${p.id}`}
            >
              <TestTubes className="h-3.5 w-3.5" />
              {p.status === "applied" ? "View patched test case in suite" : "Open test case in suite"}
              <ExternalLink className="h-3 w-3 opacity-70" />
            </Link>
          )}
        </div>
        {isPending && (
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" variant="outline" onClick={onReject} className="gap-1.5" data-testid={`button-reject-${p.id}`}>
              <ShieldX className="h-3.5 w-3.5" />
              Reject
            </Button>
            <Button size="sm" onClick={onApprove} className="gap-1.5" data-testid={`button-approve-${p.id}`}>
              <ShieldCheck className="h-3.5 w-3.5" />
              Approve & Apply
            </Button>
          </div>
        )}
      </div>

      {/* Failure summary */}
      {p.error_message && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-rose-500/5 border border-rose-500/20">
          <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="text-xs text-rose-700 dark:text-rose-300 break-words" data-testid={`text-error-${p.id}`}>
            {p.error_message}
          </div>
        </div>
      )}

      {/* Selector diff */}
      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-md border border-rose-500/30 bg-rose-500/5 p-3">
          <div className="text-[10px] uppercase tracking-wide text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-1">
            <XCircle className="h-3 w-3" /> Broken Selector
          </div>
          <div className="font-mono text-xs mt-1.5 break-all" data-testid={`text-broken-${p.id}`}>
            {p.broken_selector || <span className="italic text-muted-foreground">(none)</span>}
          </div>
          <div className="text-[10px] text-muted-foreground mt-2">action: <span className="font-mono text-foreground">{p.broken_action}</span>{p.broken_value && <> · value: <span className="font-mono text-foreground">{p.broken_value}</span></>}</div>
        </div>
        <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3">
          <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300 font-semibold flex items-center gap-1">
            <Wand2 className="h-3 w-3" /> Proposed Selector
            <ArrowRight className="h-3 w-3 mx-1 opacity-60" />
            <span className="font-normal normal-case opacity-80">{p.model}</span>
          </div>
          <div className="font-mono text-xs mt-1.5 break-all" data-testid={`text-proposed-${p.id}`}>
            {p.proposed_selector || <span className="italic text-muted-foreground">(none)</span>}
          </div>
          <div className="text-[10px] text-muted-foreground mt-2">action: <span className="font-mono text-foreground">{p.proposed_action}</span>{p.proposed_value && <> · value: <span className="font-mono text-foreground">{p.proposed_value}</span></>}</div>
        </div>
      </div>

      {/* AI reasoning */}
      {p.ai_reasoning && (
        <div className="text-xs text-muted-foreground" data-testid={`text-reasoning-${p.id}`}>
          <span className="font-semibold text-foreground">Why: </span>
          {p.ai_reasoning}
        </div>
      )}

      {/* Alternates */}
      {p.alternates && p.alternates.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">Fallback alternates</div>
          {p.alternates.map((a, i) => (
            <div key={i} className="flex items-start gap-2 text-xs" data-testid={`alternate-${p.id}-${i}`}>
              <Badge variant="outline" className="text-[10px]">{a.confidence ?? 0}%</Badge>
              <code className="font-mono text-foreground break-all">{a.selector}</code>
              <span className="text-muted-foreground">— {a.reason}</span>
            </div>
          ))}
        </div>
      )}

      {/* DOM snippet collapsible */}
      {p.dom_snippet && (
        <details className="group">
          <summary className="text-xs cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1.5 list-none">
            <FileCode2 className="h-3.5 w-3.5" />
            <span className="select-none">View DOM snippet captured at failure</span>
          </summary>
          <pre className="text-[11px] font-mono bg-muted/40 p-3 rounded-md mt-2 overflow-auto max-h-72 whitespace-pre-wrap" data-testid={`text-dom-${p.id}`}>
            {p.dom_snippet}
          </pre>
        </details>
      )}

      {/* Review trail */}
      {!isPending && (
        <div className="border-t pt-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xs">
            {p.status === "applied" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
            {p.status === "rejected" && <XCircle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />}
            <span className="text-muted-foreground">Reviewed by</span>
            <span className="font-medium" data-testid={`text-reviewer-${p.id}`}>{p.reviewer || "—"}</span>
            {p.reviewed_at && (
              <span className="text-muted-foreground">· {new Date(p.reviewed_at).toLocaleString()}</span>
            )}
          </div>
          {p.review_notes && (
            <div className="text-xs text-muted-foreground italic">"{p.review_notes}"</div>
          )}
          {p.application_diff && (
            <pre className="text-[11px] font-mono bg-muted/40 p-3 rounded-md overflow-auto max-h-40 whitespace-pre-wrap" data-testid={`text-diff-${p.id}`}>
              {p.application_diff}
            </pre>
          )}
        </div>
      )}
    </Card>
  );
}
