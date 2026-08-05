import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  RefreshCw,
  Play,
  FileCode,
  ClipboardList,
  BarChart3,
  Check,
  X,
  Copy,
  Download,
  Loader2,
  Shield,
  ListPlus,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Volume2,
  ImageIcon,
  Video,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  MessageSquarePlus,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { LogViewer } from "@/components/log-viewer";
import { TriageCard, type Triage } from "@/components/triage-card";

function parseExecutionScenarios(log: string | null | undefined): { name: string; status: "passed" | "failed"; errors: number; actions: number }[] {
  if (!log) return [];
  const lines = log.split("\n");
  const scenarios: { name: string; status: "passed" | "failed"; errors: number; actions: number }[] = [];
  let current: { name: string; actions: number } | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^SCENARIO\s+\d+\/\d+:\s+(.+)$/);
    if (headerMatch) {
      current = { name: headerMatch[1].trim(), actions: 0 };
      continue;
    }
    const resultMatch = line.match(/^\s*Result:\s+(PASSED|FAILED)\s+\((\d+)\s+steps?,\s+(\d+)\s+errors?\)/i);
    if (resultMatch && current) {
      scenarios.push({
        name: current.name,
        status: resultMatch[1].toUpperCase() === "PASSED" ? "passed" : "failed",
        actions: parseInt(resultMatch[2], 10),
        errors: parseInt(resultMatch[3], 10),
      });
      current = null;
    }
  }
  return scenarios;
}

interface Props {
  projectId: string;
  storyKey: string;
}

interface StoryTestCase {
  case_id: string;
  test_suite_id: string;
  title: string;
  description: string;
  preconditions: string;
  steps: string;
  expected_result: string;
  priority: string;
  status: string;
  category: string;
  jira_story_key: string;
  gherkin_script: string;
  gherkin_approved: string;
  playwright_code: string;
  execution_result: string;
  execution_log: string;
  self_healing_log: string;
}

interface ExecutionMedia {
  screenshots: string[];
  videos: string[];
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const notes = [523.25, 659.25, 783.99];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 0.3);
      osc.start(ctx.currentTime + i * 0.15);
      osc.stop(ctx.currentTime + i * 0.15 + 0.3);
    });
  } catch {}
}

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "passed":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-red-500" />;
    case "executing":
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case "ready":
      return <Check className="h-4 w-4 text-blue-500" />;
    default:
      return <Clock className="h-4 w-4 text-muted-foreground" />;
  }
}

function LiveBrowserView({ caseId, isExecuting, onClose }: { caseId: string; isExecuting: boolean; onClose: () => void }) {
  const [liveScreenshot, setLiveScreenshot] = useState<{ url: string; step: string } | null>(null);
  const [progressSteps, setProgressSteps] = useState<{ step: string; status: string }[]>([]);
  const [status, setStatus] = useState<string>("connecting");
  const [currentScenario, setCurrentScenario] = useState<string>("");
  const eventSourceRef = useRef<EventSource | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isExecuting || !caseId) return;

    setLiveScreenshot(null);
    setProgressSteps([]);
    setStatus("executing");
    setCurrentScenario("");

    const es = new EventSource(`/api/test-execution/${caseId}/live-stream`);
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "screenshot") {
          setLiveScreenshot({ url: data.url, step: data.step });
        } else if (data.type === "progress") {
          setProgressSteps(prev => [...prev, { step: data.step, status: data.status || "running" }]);
          setTimeout(() => logEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        } else if (data.type === "scenario_start") {
          setCurrentScenario(data.scenario || `Scenario ${data.index}`);
          setProgressSteps(prev => [...prev, { step: `Scenario ${data.index}/${data.total}: ${data.scenario}`, status: "scenario" }]);
        } else if (data.type === "done") {
          setStatus(data.result === "passed" ? "passed" : data.result === "timeout" ? "timeout" : "failed");
          es.close();
        }
      } catch {}
    };

    es.onerror = () => {
      setStatus("disconnected");
      es.close();
    };

    return () => {
      es.close();
      eventSourceRef.current = null;
    };
  }, [isExecuting, caseId]);

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col" data-testid="live-browser-view">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <div className="w-3 h-3 rounded-full bg-green-500" />
          </div>
          <span className="text-white text-sm font-mono">KIT Browser — Live Execution</span>
          {status === "executing" && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 animate-pulse">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              REC
            </span>
          )}
          {status === "passed" && <Badge className="bg-emerald-600 text-white text-xs">PASSED</Badge>}
          {status === "failed" && <Badge className="bg-red-600 text-white text-xs">FAILED</Badge>}
          {status === "timeout" && <Badge className="bg-yellow-600 text-white text-xs">TIMEOUT</Badge>}
        </div>
        <div className="flex items-center gap-3">
          {currentScenario && status === "executing" && (
            <span className="text-blue-300 text-xs font-mono bg-blue-900/40 px-2 py-0.5 rounded">{currentScenario}</span>
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-white" data-testid="close-live-view">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex items-center justify-center relative overflow-hidden bg-gray-950">
          {!liveScreenshot && status === "executing" && (
            <div className="flex flex-col items-center gap-4 text-white">
              <Loader2 className="h-12 w-12 animate-spin text-blue-400" />
              <p className="text-lg">Browser is loading the application...</p>
              <p className="text-sm text-gray-400">Live browser view will appear as the bot crawls</p>
            </div>
          )}
          {liveScreenshot && (
            <img
              src={liveScreenshot.url}
              alt={`Live: ${liveScreenshot.step}`}
              className="max-w-full max-h-full object-contain"
              data-testid="live-screenshot"
            />
          )}
          {liveScreenshot && (
            <div className="absolute bottom-3 left-3 bg-black/70 text-white text-xs px-3 py-1.5 rounded-lg font-mono backdrop-blur-sm">
              {liveScreenshot.step}
            </div>
          )}
          {status !== "executing" && !liveScreenshot && (
            <div className="text-gray-400 text-center">
              <p>Execution complete</p>
            </div>
          )}
        </div>

        <div className="w-80 bg-gray-900 border-l border-gray-700 flex flex-col">
          <div className="px-3 py-2 border-b border-gray-700 flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-gray-400" />
            <span className="text-gray-300 text-xs font-medium">Execution Log</span>
            <span className="ml-auto text-gray-500 text-[10px]">{progressSteps.length} steps</span>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5" data-testid="live-progress-log">
            {progressSteps.map((entry, idx) => (
              <div
                key={idx}
                className={`flex items-start gap-1.5 py-0.5 px-1.5 rounded text-[11px] font-mono leading-tight ${
                  entry.status === "scenario" ? "bg-blue-900/30 text-blue-300 font-bold mt-2 mb-0.5 py-1" :
                  entry.status === "passed" ? "text-emerald-400" :
                  entry.status === "failed" ? "text-red-400" :
                  entry.status === "skipped" ? "text-yellow-400" :
                  "text-gray-400"
                }`}
                data-testid={`progress-step-${idx}`}
              >
                {entry.status === "running" && <Loader2 className="h-3 w-3 animate-spin flex-shrink-0 mt-0.5 text-blue-400" />}
                {entry.status === "passed" && <CheckCircle2 className="h-3 w-3 flex-shrink-0 mt-0.5" />}
                {entry.status === "failed" && <XCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />}
                {entry.status === "skipped" && <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />}
                {entry.status === "scenario" && <Play className="h-3 w-3 flex-shrink-0 mt-0.5" />}
                <span className="break-all">{entry.step}</span>
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function StoryTestCase({ projectId, storyKey }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("gherkin");
  const prevStatusRef = useRef<string>("");
  const [showLiveView, setShowLiveView] = useState(false);

  const { data: project } = useQuery<any>({
    queryKey: ["/api/projects", projectId],
  });

  const { data: testCase, isLoading, refetch } = useQuery<StoryTestCase>({
    queryKey: ["/api/test-execution/story", projectId, storyKey],
    queryFn: async () => {
      const res = await fetch(`/api/test-execution/story/${projectId}/${storyKey}`);
      if (!res.ok) throw new Error("Not found");
      return res.json();
    },
  });

  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null);

  const { data: executionMedia } = useQuery<ExecutionMedia>({
    queryKey: ["/api/test-execution", testCase?.case_id, "screenshots"],
    queryFn: async () => {
      const res = await fetch(`/api/test-execution/${testCase!.case_id}/screenshots`);
      if (!res.ok) return { screenshots: [], videos: [] };
      return res.json();
    },
    enabled: !!testCase?.case_id && !!testCase?.execution_result,
  });

  const { data: caseRuns } = useQuery<Array<{ id: string; status: string; triage: Triage | null }>>({
    queryKey: ["/api/analytics/test-case", testCase?.case_id, "runs"],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/test-case/${testCase!.case_id}/runs?limit=5`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!testCase?.case_id && !!testCase?.execution_result,
  });
  const latestFailedRun = caseRuns?.find((r) => r.status === "failed" || r.status === "error");

  useEffect(() => {
    if (testCase && prevStatusRef.current && prevStatusRef.current !== testCase.status) {
      if (testCase.status === "passed" || testCase.status === "failed") {
        playNotificationSound();
      }
    }
    if (testCase) prevStatusRef.current = testCase.status;
  }, [testCase?.status]);

  const [isGeneratingGherkin, setIsGeneratingGherkin] = useState(false);
  const [streamedGherkin, setStreamedGherkin] = useState("");
  const [gherkinStreamStatus, setGherkinStreamStatus] = useState("");
  const [gherkinInputOpen, setGherkinInputOpen] = useState(false);
  const [gherkinInstruction, setGherkinInstruction] = useState("");

  const startGenerateGherkin = useCallback(async (instruction?: string) => {
    if (!testCase?.case_id || isGeneratingGherkin) return;
    setIsGeneratingGherkin(true);
    setStreamedGherkin("");
    setGherkinStreamStatus("Starting...");
    setActiveTab("gherkin");

    let buffered = "";
    let receivedDone = false;

    try {
      const res = await fetch(`/api/test-execution/${testCase.case_id}/generate-gherkin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instruction || null }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let leftover = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        leftover += decoder.decode(value, { stream: true });
        const events = leftover.split("\n\n");
        leftover = events.pop() ?? "";
        for (const evt of events) {
          const line = evt.trim();
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          try {
            const msg = JSON.parse(payload);
            if (msg.type === "token" && typeof msg.content === "string") {
              buffered += msg.content;
              setStreamedGherkin(buffered);
            } else if (msg.type === "status" && typeof msg.message === "string") {
              setGherkinStreamStatus(msg.message);
            } else if (msg.type === "error") {
              toast({ title: "Generation failed", description: msg.message, variant: "destructive" });
            } else if (msg.type === "done") {
              receivedDone = true;
              setGherkinStreamStatus("Complete");
            }
          } catch {
            // ignore malformed events
          }
        }
      }
    } catch (err: any) {
      toast({ title: "Failed to generate Gherkin", description: err?.message, variant: "destructive" });
    } finally {
      setIsGeneratingGherkin(false);
      if (receivedDone) {
        playNotificationSound();
        toast({ title: "Gherkin generated successfully" });
        await refetch();
        setStreamedGherkin("");
      }
    }
  }, [testCase?.case_id, isGeneratingGherkin, refetch, toast, setActiveTab]);

  const generateGherkin = {
    mutate: (instruction?: string) => { void startGenerateGherkin(instruction); },
    isPending: isGeneratingGherkin,
  };

  const openGherkinDialog = () => {
    setGherkinInstruction("");
    setGherkinInputOpen(true);
  };

  const approveGherkin = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/test-execution/${testCase!.case_id}/approve-gherkin`);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Gherkin approved — generating Playwright code..." });
      setTimeout(() => generatePlaywright.mutate(), 500);
    },
  });

  const generatePlaywright = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/test-execution/${testCase!.case_id}/generate-playwright`);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      playNotificationSound();
      toast({ title: "Playwright code generated" });
      setActiveTab("playwright");
    },
    onError: () => toast({ title: "Failed to generate Playwright code", variant: "destructive" }),
  });

  const executeTests = useMutation({
    mutationFn: async () => {
      setShowLiveView(true);
      const res = await apiRequest("POST", `/api/test-execution/${testCase!.case_id}/execute`);
      return res.json();
    },
    onSuccess: (data) => {
      refetch();
      queryClient.invalidateQueries({ queryKey: ["/api/test-execution", testCase!.case_id, "screenshots"] });
      playNotificationSound();
      setActiveTab("reports");
      if (data.result === "passed") {
        toast({ title: "Tests passed!" });
      } else {
        toast({ title: "Tests failed — check reports", variant: "destructive" });
      }
    },
    onError: async (error: any) => {
      if (error?.message?.includes("409") || error?.status === 409) {
        try {
          await apiRequest("POST", `/api/test-execution/${testCase!.case_id}/clear-lock`);
          toast({ title: "Previous execution lock cleared. Please try again." });
        } catch {
          toast({ title: "Execution locked — try again in a moment", variant: "destructive" });
        }
      } else {
        toast({ title: "Execution error", variant: "destructive" });
      }
      setShowLiveView(false);
    },
  });

  const selfHeal = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/test-execution/${testCase!.case_id}/self-heal`);
      return res.json();
    },
    onSuccess: () => {
      refetch();
      playNotificationSound();
      toast({ title: "Self-healing complete — Gherkin & Playwright updated" });
      setActiveTab("gherkin");
    },
    onError: () => toast({ title: "Self-healing failed", variant: "destructive" }),
  });

  const addToRegression = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/test-execution/${testCase!.case_id}/add-to-regression`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: data.status === "added" ? "Added to regression suite" : "Updated in regression suite" });
    },
    onError: () => toast({ title: "Failed to update regression suite", variant: "destructive" }),
  });

  const copyToClipboard = useCallback((text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  }, [toast]);

  const downloadFile = useCallback((content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!testCase) {
    return (
      <div className="p-6 space-y-4 max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => navigate(`/projects/${projectId}`)} className="gap-2">
          <ArrowLeft className="h-4 w-4" /> Back
        </Button>
        <p className="text-muted-foreground">Test case not found for story {storyKey}</p>
      </div>
    );
  }

  const hasGherkin = !!testCase.gherkin_script;
  const gherkinApproved = testCase.gherkin_approved === "yes";
  const hasPlaywright = !!testCase.playwright_code;
  const hasResults = !!testCase.execution_result;
  const isFailed = testCase.status === "failed" || testCase.execution_result === "failed";
  const isPassed = testCase.status === "passed" || testCase.execution_result === "passed";

  const isGenerating = generateGherkin.isPending || generatePlaywright.isPending;
  const isExecuting = executeTests.isPending;
  const isHealing = selfHeal.isPending;

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <Button
        variant="ghost"
        onClick={() => window.history.length > 1 ? window.history.back() : navigate(`/projects/${projectId}`)}
        className="gap-2"
        data-testid="button-back-sprint"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Sprint
      </Button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <Badge variant="outline" className="font-mono text-xs" data-testid="text-story-key">
              {storyKey}
            </Badge>
            <Badge
              variant={isPassed ? "default" : isFailed ? "destructive" : "secondary"}
              className="text-xs capitalize gap-1"
            >
              <StatusIcon status={testCase.status} />
              {testCase.status}
            </Badge>
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-story-title">
            {testCase.title}
          </h1>
          {testCase.description && (
            <p className="text-muted-foreground mt-1 text-sm">{testCase.description}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={openGherkinDialog}
            disabled={isGenerating || isExecuting}
            className="gap-1.5"
            data-testid="button-regenerate-gherkin"
          >
            {generateGherkin.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MessageSquarePlus className="h-3.5 w-3.5" />
            )}
            {hasGherkin ? "Re-generate Gherkin with Inputs" : "Generate Gherkin with Inputs"}
          </Button>

          <Button
            size="sm"
            onClick={() => executeTests.mutate()}
            disabled={!gherkinApproved || isExecuting || isGenerating}
            className="gap-1.5"
            data-testid="button-execute-tests"
          >
            {isExecuting ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Execute Tests
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => generatePlaywright.mutate()}
            disabled={!hasGherkin || isGenerating || isExecuting}
            className="gap-1.5"
            data-testid="button-regenerate-playwright"
          >
            {generatePlaywright.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileCode className="h-3.5 w-3.5" />
            )}
            {hasPlaywright ? "Re-generate Playwright Code" : "Generate Playwright"}
          </Button>
        </div>
      </div>

      {hasGherkin && !gherkinApproved && (
        <Card className="p-4 border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Sparkles className="h-5 w-5 text-amber-500" />
              <div>
                <p className="text-sm font-medium">Gherkin Ready for Review</p>
                <p className="text-xs text-muted-foreground">
                  Review the generated Gherkin below. Approve to auto-generate Playwright code.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => approveGherkin.mutate()}
                disabled={approveGherkin.isPending}
                className="gap-1.5"
                data-testid="button-approve-gherkin"
              >
                {approveGherkin.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Approve & Generate Playwright
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={openGherkinDialog}
                disabled={generateGherkin.isPending}
                className="gap-1.5"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                Regenerate with Inputs
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isFailed && hasResults && latestFailedRun && (
        <TriageCard
          runId={latestFailedRun.id}
          initialTriage={latestFailedRun.triage ?? undefined}
          onAction={(action) => {
            if (action === "self_heal") {
              selfHeal.mutate();
            } else if (action === "retry") {
              executeTests.mutate();
            } else if (action === "file_bug") {
              addToRegression.mutate();
            }
          }}
        />
      )}

      {isFailed && hasResults && (
        <Card className="p-4 border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <p className="text-sm font-medium">Test Failed</p>
                <p className="text-xs text-muted-foreground">
                  Use self-healing to automatically fix the test or add to regression suite for tracking.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => selfHeal.mutate()}
                disabled={isHealing}
                className="gap-1.5"
                data-testid="button-self-heal"
              >
                {isHealing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Shield className="h-3.5 w-3.5" />
                )}
                Self-Heal
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => addToRegression.mutate()}
                disabled={addToRegression.isPending}
                className="gap-1.5"
                data-testid="button-add-regression"
              >
                {addToRegression.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ListPlus className="h-3.5 w-3.5" />
                )}
                Add to Regression Suite
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isPassed && hasResults && (
        <Card className="p-4 border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/20">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">All Tests Passed</p>
                <p className="text-xs text-muted-foreground">
                  Add this test to the regression suite for continuous validation.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => addToRegression.mutate()}
              disabled={addToRegression.isPending}
              className="gap-1.5"
              data-testid="button-add-regression-passed"
            >
              {addToRegression.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ListPlus className="h-3.5 w-3.5" />
              )}
              Add to Regression Suite
            </Button>
          </div>
        </Card>
      )}

      <PipelineProgress
        hasGherkin={hasGherkin}
        gherkinApproved={gherkinApproved}
        hasPlaywright={hasPlaywright}
        hasResults={hasResults}
        isPassed={isPassed}
        isFailed={isFailed}
        isGeneratingGherkin={generateGherkin.isPending}
        isGeneratingPlaywright={generatePlaywright.isPending}
        isExecuting={isExecuting}
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="gherkin" className="gap-1.5" data-testid="tab-gherkin">
            <ClipboardList className="h-3.5 w-3.5" />
            Gherkin
          </TabsTrigger>
          <TabsTrigger value="playwright" className="gap-1.5" data-testid="tab-playwright">
            <FileCode className="h-3.5 w-3.5" />
            Playwright Code
          </TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5" data-testid="tab-reports">
            <BarChart3 className="h-3.5 w-3.5" />
            Reports
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gherkin" className="mt-4">
          {isGeneratingGherkin ? (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-sm font-medium">Generating Feature File</span>
                  {gherkinStreamStatus && (
                    <Badge variant="secondary" className="text-xs">
                      {gherkinStreamStatus}
                    </Badge>
                  )}
                </div>
              </div>
              <pre className="p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto" data-testid="code-gherkin-streaming">
                {streamedGherkin || gherkinStreamStatus || "Waiting for first token..."}
              </pre>
            </Card>
          ) : !hasGherkin ? (
            <Card className="p-12 text-center border-dashed">
              <ClipboardList className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No Gherkin Generated Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Generate enterprise-grade BDD Gherkin scenarios from this JIRA story.
              </p>
              <Button
                onClick={openGherkinDialog}
                disabled={generateGherkin.isPending}
                className="gap-2"
                data-testid="button-generate-gherkin-empty"
              >
                {generateGherkin.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageSquarePlus className="h-4 w-4" />
                )}
                Generate Gherkin with Inputs
              </Button>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                <div className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Feature File</span>
                  {gherkinApproved && (
                    <Badge variant="default" className="text-xs gap-1">
                      <Check className="h-3 w-3" /> Approved
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyToClipboard(testCase.gherkin_script, "Gherkin")}
                    data-testid="button-copy-gherkin"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => downloadFile(testCase.gherkin_script, `${storyKey}.feature`)}
                    data-testid="button-download-gherkin"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <pre className="p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto" data-testid="code-gherkin">
                {testCase.gherkin_script}
              </pre>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="playwright" className="mt-4">
          {!hasPlaywright ? (
            <Card className="p-12 text-center border-dashed">
              <FileCode className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No Playwright Code Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {hasGherkin
                  ? gherkinApproved
                    ? "Generate Playwright test code from the approved Gherkin."
                    : "Approve the Gherkin first to auto-generate Playwright code."
                  : "Generate Gherkin first, then Playwright code will follow."}
              </p>
              {hasGherkin && gherkinApproved && (
                <Button
                  onClick={() => generatePlaywright.mutate()}
                  disabled={generatePlaywright.isPending}
                  className="gap-2"
                >
                  {generatePlaywright.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileCode className="h-4 w-4" />
                  )}
                  Generate Playwright
                </Button>
              )}
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <div className="flex items-center justify-between px-4 py-2.5 bg-muted/50 border-b">
                <div className="flex items-center gap-2">
                  <FileCode className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">test.spec.ts</span>
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyToClipboard(testCase.playwright_code, "Playwright code")}
                    data-testid="button-copy-playwright"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => downloadFile(testCase.playwright_code, `${storyKey}.spec.ts`)}
                    data-testid="button-download-playwright"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <pre className="p-4 text-sm font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[600px] overflow-y-auto" data-testid="code-playwright">
                {testCase.playwright_code}
              </pre>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="reports" className="mt-4 space-y-4">
          {!hasResults ? (
            <Card className="p-12 text-center border-dashed">
              <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="font-semibold mb-2">No Execution Reports Yet</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Execute the Playwright tests to generate reports.
              </p>
              {gherkinApproved && (
                <Button
                  onClick={() => executeTests.mutate()}
                  disabled={isExecuting}
                  className="gap-2"
                >
                  {isExecuting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Execute Tests
                </Button>
              )}
            </Card>
          ) : (
            <>
              {(() => {
                const scenarios = parseExecutionScenarios(testCase.execution_log);
                const total = scenarios.length;
                const passed = scenarios.filter((s) => s.status === "passed").length;
                const failed = total - passed;
                const passRate = total > 0 ? Math.round((passed / total) * 100) : (isPassed ? 100 : 0);
                const majorityPassed = total > 0 ? passed / total >= 0.5 : isPassed;
                const allPassed = total > 0 ? failed === 0 : isPassed;
                const chartData = total > 0
                  ? [
                      { name: "Passed", value: passed, color: "hsl(142, 71%, 45%)" },
                      { name: "Failed", value: failed, color: "hsl(0, 84%, 60%)" },
                    ].filter((d) => d.value > 0)
                  : [{ name: isPassed ? "Passed" : "Failed", value: 1, color: isPassed ? "hsl(142, 71%, 45%)" : "hsl(0, 84%, 60%)" }];

                let headline = "Tests Failed";
                let subline = "Most scenarios did not pass — review the failures below.";
                let toneClass = "from-red-50 to-rose-50 dark:from-red-950/40 dark:to-rose-950/30 border-red-200 dark:border-red-900";
                let iconBg = "bg-red-100 dark:bg-red-900/40";
                let iconColor = "text-red-600 dark:text-red-400";
                let Icon = XCircle;

                if (allPassed) {
                  headline = "All Tests Passed!";
                  subline = total > 0
                    ? `Excellent work — all ${total} scenario${total === 1 ? "" : "s"} executed successfully.`
                    : "Excellent work — your tests executed successfully.";
                  toneClass = "from-emerald-50 to-green-50 dark:from-emerald-950/40 dark:to-green-950/30 border-emerald-200 dark:border-emerald-900";
                  iconBg = "bg-emerald-100 dark:bg-emerald-900/40";
                  iconColor = "text-emerald-600 dark:text-emerald-400";
                  Icon = CheckCircle2;
                } else if (majorityPassed) {
                  headline = "Mostly Passing";
                  subline = `Great progress — ${passed} of ${total} scenarios passed (${passRate}%). Just ${failed} need attention.`;
                  toneClass = "from-emerald-50 to-amber-50 dark:from-emerald-950/40 dark:to-amber-950/30 border-emerald-200 dark:border-emerald-900";
                  iconBg = "bg-emerald-100 dark:bg-emerald-900/40";
                  iconColor = "text-emerald-600 dark:text-emerald-400";
                  Icon = CheckCircle2;
                } else if (total > 0) {
                  headline = "Needs Attention";
                  subline = `${failed} of ${total} scenarios failed (${100 - passRate}%). Review the failures and re-run.`;
                }

                return (
                  <>
                    <Card className={`p-6 bg-gradient-to-br ${toneClass}`} data-testid="card-execution-summary">
                      <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`p-3 rounded-xl ${iconBg}`}>
                            <Icon className={`h-8 w-8 ${iconColor}`} />
                          </div>
                          <div>
                            <h3 className="font-bold text-2xl" data-testid="text-execution-headline">{headline}</h3>
                            <p className="text-sm text-muted-foreground mt-1" data-testid="text-execution-subline">{subline}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-6 w-full md:w-auto">
                          <div className="relative w-32 h-32 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <PieChart>
                                <Pie
                                  data={chartData}
                                  cx="50%"
                                  cy="50%"
                                  innerRadius={42}
                                  outerRadius={60}
                                  paddingAngle={chartData.length > 1 ? 2 : 0}
                                  dataKey="value"
                                  stroke="none"
                                >
                                  {chartData.map((entry, idx) => (
                                    <Cell key={idx} fill={entry.color} />
                                  ))}
                                </Pie>
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                              <span className={`text-2xl font-bold ${allPassed || majorityPassed ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                                {passRate}%
                              </span>
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Pass rate</span>
                            </div>
                          </div>

                          {total > 0 && (
                            <div className="space-y-2">
                              <div className="flex items-center gap-2" data-testid="stat-passed">
                                <div className="w-3 h-3 rounded-sm bg-emerald-500" />
                                <span className="text-sm font-medium">{passed} Passed</span>
                              </div>
                              <div className="flex items-center gap-2" data-testid="stat-failed">
                                <div className="w-3 h-3 rounded-sm bg-red-500" />
                                <span className="text-sm font-medium">{failed} Failed</span>
                              </div>
                              <div className="flex items-center gap-2 pt-1 border-t">
                                <span className="text-xs text-muted-foreground">{total} Total</span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </Card>

                    {scenarios.length > 0 && (
                      <Card className="p-5" data-testid="card-scenario-breakdown">
                        <div className="flex items-center gap-2 mb-4">
                          <ClipboardList className="h-4 w-4 text-muted-foreground" />
                          <h4 className="font-semibold">Scenario Breakdown</h4>
                          <Badge variant="secondary" className="ml-auto text-xs">{scenarios.length} scenario{scenarios.length === 1 ? "" : "s"}</Badge>
                        </div>
                        <div className="space-y-2">
                          {scenarios.map((s, idx) => (
                            <div
                              key={idx}
                              className={`flex items-center gap-3 p-3 rounded-lg border ${
                                s.status === "passed"
                                  ? "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900"
                                  : "bg-red-50/50 dark:bg-red-950/20 border-red-200 dark:border-red-900"
                              }`}
                              data-testid={`scenario-row-${idx}`}
                            >
                              <div className={`p-1.5 rounded-full ${s.status === "passed" ? "bg-emerald-500" : "bg-red-500"}`}>
                                {s.status === "passed" ? (
                                  <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                                ) : (
                                  <X className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate" data-testid={`text-scenario-name-${idx}`}>
                                  {s.name}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {s.actions} step{s.actions === 1 ? "" : "s"}
                                  {s.errors > 0 && ` · ${s.errors} error${s.errors === 1 ? "" : "s"}`}
                                </p>
                              </div>
                              <Badge
                                variant="outline"
                                className={
                                  s.status === "passed"
                                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800"
                                    : "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800"
                                }
                              >
                                {s.status === "passed" ? "PASSED" : "FAILED"}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </Card>
                    )}
                  </>
                );
              })()}

              <LogViewer
                log={testCase.execution_log}
                title="Execution Log"
                maxHeight="540px"
                isStreaming={isExecuting}
                testId="code-execution-log"
                emptyMessage="No execution log yet. Run the test to capture detailed step-by-step output."
              />


              {executionMedia && executionMedia.screenshots.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b">
                    <ImageIcon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Execution Screenshots</span>
                    <Badge variant="secondary" className="ml-auto text-xs">{executionMedia.screenshots.length} captured</Badge>
                  </div>
                  <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                    {executionMedia.screenshots.map((url, idx) => (
                      <div
                        key={idx}
                        className="relative group cursor-pointer rounded-lg overflow-hidden border bg-muted/30 hover:border-primary/50 transition-colors"
                        onClick={() => setLightboxIdx(idx)}
                        data-testid={`screenshot-thumb-${idx}`}
                      >
                        <img
                          src={url}
                          alt={`Screenshot ${idx + 1}`}
                          className="w-full h-auto aspect-video object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <Maximize2 className="h-5 w-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="absolute bottom-1 left-1 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded">
                          Step {idx + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              {executionMedia && executionMedia.videos.length > 0 && (
                <Card className="overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/50 border-b">
                    <Video className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">Execution Recording</span>
                  </div>
                  <div className="p-4 space-y-3">
                    {executionMedia.videos.map((url, idx) => (
                      <video
                        key={idx}
                        src={url}
                        controls
                        className="w-full rounded-lg border max-h-[500px]"
                        data-testid={`video-player-${idx}`}
                      />
                    ))}
                  </div>
                </Card>
              )}

              {testCase.self_healing_log && (
                <LogViewer
                  log={testCase.self_healing_log}
                  title="Self-Healing History"
                  maxHeight="400px"
                  testId="self-healing-log"
                />
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {showLiveView && testCase && (
        <LiveBrowserView
          caseId={testCase.case_id}
          isExecuting={isExecuting}
          onClose={() => setShowLiveView(false)}
        />
      )}

      {lightboxIdx !== null && executionMedia && executionMedia.screenshots.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center"
          onClick={() => setLightboxIdx(null)}
          data-testid="screenshot-lightbox"
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 z-50"
            onClick={() => setLightboxIdx(null)}
            data-testid="lightbox-close"
          >
            <X className="h-8 w-8" />
          </button>

          {lightboxIdx > 0 && (
            <button
              className="absolute left-4 text-white hover:text-gray-300 z-50 p-2"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx - 1); }}
              data-testid="lightbox-prev"
            >
              <ChevronLeft className="h-10 w-10" />
            </button>
          )}

          {lightboxIdx < executionMedia.screenshots.length - 1 && (
            <button
              className="absolute right-4 text-white hover:text-gray-300 z-50 p-2"
              onClick={(e) => { e.stopPropagation(); setLightboxIdx(lightboxIdx + 1); }}
              data-testid="lightbox-next"
            >
              <ChevronRight className="h-10 w-10" />
            </button>
          )}

          <div className="max-w-[90vw] max-h-[85vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={executionMedia.screenshots[lightboxIdx]}
              alt={`Screenshot ${lightboxIdx + 1}`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              data-testid="lightbox-image"
            />
            <div className="mt-3 text-white text-sm font-medium">
              Screenshot {lightboxIdx + 1} of {executionMedia.screenshots.length}
            </div>
          </div>
        </div>
      )}

      <Dialog open={gherkinInputOpen} onOpenChange={setGherkinInputOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{hasGherkin ? "Re-generate Gherkin" : "Generate Gherkin"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-1">
            <Label className="text-sm text-muted-foreground">
              Optionally add instructions to guide the AI — leave blank to generate from story context only.
            </Label>
            <Textarea
              placeholder="e.g. Focus on the error state for missing email. Include a scenario for expired session."
              value={gherkinInstruction}
              onChange={(e) => setGherkinInstruction(e.target.value)}
              rows={4}
              className="resize-none"
            />
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setGherkinInputOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                setGherkinInputOpen(false);
                generateGherkin.mutate(gherkinInstruction.trim() || undefined);
              }}
              className="gap-2"
            >
              <MessageSquarePlus className="h-4 w-4" />
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PipelineProgress({
  hasGherkin,
  gherkinApproved,
  hasPlaywright,
  hasResults,
  isPassed,
  isFailed,
  isGeneratingGherkin,
  isGeneratingPlaywright,
  isExecuting,
}: {
  hasGherkin: boolean;
  gherkinApproved: boolean;
  hasPlaywright: boolean;
  hasResults: boolean;
  isPassed: boolean;
  isFailed: boolean;
  isGeneratingGherkin: boolean;
  isGeneratingPlaywright: boolean;
  isExecuting: boolean;
}) {
  const steps = [
    {
      label: "Gherkin",
      done: hasGherkin,
      active: isGeneratingGherkin,
      icon: <ClipboardList className="h-3.5 w-3.5" />,
    },
    {
      label: "Approved",
      done: gherkinApproved,
      active: false,
      icon: <Check className="h-3.5 w-3.5" />,
    },
    {
      label: "Playwright",
      done: hasPlaywright,
      active: isGeneratingPlaywright,
      icon: <FileCode className="h-3.5 w-3.5" />,
    },
    {
      label: "Executed",
      done: hasResults,
      active: isExecuting,
      icon: <Play className="h-3.5 w-3.5" />,
    },
    {
      label: isPassed ? "Passed" : isFailed ? "Failed" : "Result",
      done: isPassed,
      failed: isFailed && hasResults,
      active: false,
      icon: isPassed ? <CheckCircle2 className="h-3.5 w-3.5" /> : isFailed ? <XCircle className="h-3.5 w-3.5" /> : <BarChart3 className="h-3.5 w-3.5" />,
    },
  ];

  return (
    <div className="flex items-center gap-1 overflow-x-auto py-2">
      {steps.map((step, i) => (
        <div key={step.label} className="flex items-center">
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              step.active
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 animate-pulse"
                : step.done
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                : (step as any).failed
                ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {step.active ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : step.icon}
            {step.label}
          </div>
          {i < steps.length - 1 && (
            <div className={`w-6 h-0.5 mx-0.5 ${steps[i + 1].done || steps[i + 1].active ? "bg-emerald-300 dark:bg-emerald-700" : "bg-muted"}`} />
          )}
        </div>
      ))}
    </div>
  );
}
