import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft,
  Plus,
  Send,
  List,
  Sparkles,
  Trash2,
  Code2,
  Play,
  FileCode,
  Loader2,
  CheckCircle2,
  XCircle,
  Copy,
  Download,
  Zap,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { StatusBadge } from "@/components/status-badge";
import { EmptyState } from "@/components/empty-state";
import { LogViewer } from "@/components/log-viewer";
import { BornFromBadge } from "@/components/born-from-badge";
import { PRIORITIES, TEST_CASE_STATUSES } from "@/types";
import type { TestSuite, TestCase, ChatMessage } from "@/types";

interface Props {
  id: string;
}

export default function TestSuiteDetail({ id }: Props) {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [chatInput, setChatInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [caseOpen, setCaseOpen] = useState(false);
  const [caseTitle, setCaseTitle] = useState("");
  const [caseDesc, setCaseDesc] = useState("");
  const [casePriority, setCasePriority] = useState("medium");
  const [caseSteps, setCaseSteps] = useState("");
  const [caseExpected, setCaseExpected] = useState("");
  const [expandedCase, setExpandedCase] = useState<string | null>(null);
  const [generatingGherkin, setGeneratingGherkin] = useState<string | null>(null);
  const [generatingPlaywright, setGeneratingPlaywright] = useState<string | null>(null);
  const [executingTest, setExecutingTest] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>("cases");
  const [focusedCaseId, setFocusedCaseId] = useState<string | null>(null);

  const { data: suite, isLoading } = useQuery<TestSuite>({
    queryKey: ["/api/test-suites", id],
  });

  useEffect(() => {
    if (!suite?.test_cases) return;
    const params = new URLSearchParams(window.location.search);
    const focus = params.get("focus");
    if (!focus) return;
    const target = suite.test_cases.find((c) => c.id === focus);
    if (!target) return;
    setActiveTab(target.playwright_code ? "automation" : "cases");
    if (target.playwright_code) setExpandedCase(target.id);
    setFocusedCaseId(target.id);
    const t = window.setTimeout(() => {
      const el =
        document.querySelector(`[data-testid="automation-case-${target.id}"]`) ||
        document.querySelector(`[data-testid="row-case-${target.id}"]`);
      if (el && "scrollIntoView" in el) {
        (el as HTMLElement).scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 250);
    const clear = window.setTimeout(() => setFocusedCaseId(null), 4500);
    return () => { window.clearTimeout(t); window.clearTimeout(clear); };
  }, [suite?.id, suite?.test_cases?.length]);

  const { data: messages, refetch: refetchMessages } = useQuery<ChatMessage[]>({
    queryKey: [`/api/chat/${id}/messages`],
  });

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamContent, scrollToBottom]);

  const sendMessage = async () => {
    if (!chatInput.trim() || streaming) return;
    const msg = chatInput;
    setChatInput("");
    setStreaming(true);
    setStreamContent("");

    try {
      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, test_suite_id: id }),
      });

      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              accumulated += data.content;
              setStreamContent(accumulated);
            }
            if (data.done) {
              setStreaming(false);
              setStreamContent("");
              refetchMessages();
              queryClient.invalidateQueries({ queryKey: ["/api/test-suites", id] });
            }
            if (data.error) {
              toast({ title: "AI Error", description: data.error, variant: "destructive" });
              setStreaming(false);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
      setStreaming(false);
    }
  };

  const saveTestCases = async (testCases: any[]) => {
    try {
      const res = await apiRequest("POST", "/api/chat/parse-test-cases", {
        test_suite_id: id,
        test_cases: testCases,
      });
      const data = await res.json();
      toast({ title: `${data.created} test cases saved` });
      queryClient.invalidateQueries({ queryKey: ["/api/test-suites", id] });
    } catch (err: any) {
      toast({ title: "Error saving test cases", description: err.message, variant: "destructive" });
    }
  };

  const createCase = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/test-cases", {
        test_suite_id: id,
        title: caseTitle,
        description: caseDesc,
        priority: casePriority,
        steps: caseSteps,
        expected_result: caseExpected,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-suites", id] });
      setCaseOpen(false);
      setCaseTitle("");
      setCaseDesc("");
      setCaseSteps("");
      setCaseExpected("");
      toast({ title: "Test case created" });
    },
  });

  const updateCaseStatus = useMutation({
    mutationFn: async ({ caseId, status }: { caseId: string; status: string }) => {
      await apiRequest("PUT", `/api/test-cases/${caseId}`, { status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-suites", id] });
    },
  });

  const deleteCase = useMutation({
    mutationFn: async (caseId: string) => {
      await apiRequest("DELETE", `/api/test-cases/${caseId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/test-suites", id] });
      toast({ title: "Test case deleted" });
    },
  });

  const generateGherkin = async (caseId: string) => {
    setGeneratingGherkin(caseId);
    try {
      const res = await apiRequest("POST", `/api/test-execution/${caseId}/generate-gherkin`);
      await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/test-suites", id] });
      toast({ title: "Gherkin generated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingGherkin(null);
    }
  };

  const generatePlaywright = async (caseId: string) => {
    setGeneratingPlaywright(caseId);
    try {
      const res = await apiRequest("POST", `/api/test-execution/${caseId}/generate-playwright`);
      await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/test-suites", id] });
      toast({ title: "Playwright code generated" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setGeneratingPlaywright(null);
    }
  };

  const executeTest = async (caseId: string) => {
    setExecutingTest(caseId);
    try {
      const res = await apiRequest("POST", `/api/test-execution/${caseId}/execute`);
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/test-suites", id] });
      toast({
        title: data.result === "passed" ? "Test Passed" : "Test Failed",
        description: data.summary || data.result,
        variant: data.result === "passed" ? "default" : "destructive",
      });
    } catch (err: any) {
      toast({ title: "Execution Error", description: err.message, variant: "destructive" });
    } finally {
      setExecutingTest(null);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} copied to clipboard` });
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseJsonFromContent = (content: string) => {
    const match = content.match(/```json\s*([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {}
    }
    return null;
  };

  const renderMessageContent = (content: string, role: string) => {
    if (role === "assistant") {
      const jsonData = parseJsonFromContent(content);
      const parts = content.split(/```json[\s\S]*?```/);

      return (
        <div className="space-y-3">
          {parts[0] && <p className="whitespace-pre-wrap text-sm">{parts[0].trim()}</p>}
          {jsonData && Array.isArray(jsonData) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs text-muted-foreground font-medium">{jsonData.length} test cases generated</p>
                <Button
                  size="sm"
                  onClick={() => saveTestCases(jsonData)}
                  data-testid="button-save-generated-cases"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Save All to Suite
                </Button>
              </div>
              <div className="rounded-md border overflow-auto max-h-64">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Title</TableHead>
                      <TableHead className="text-xs">Priority</TableHead>
                      <TableHead className="text-xs">Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {jsonData.map((tc: any, i: number) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs">{tc.title}</TableCell>
                        <TableCell><StatusBadge value={tc.priority || "medium"} variant="priority" /></TableCell>
                        <TableCell className="text-xs">{tc.category || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          {parts[1] && <p className="whitespace-pre-wrap text-sm">{parts[1].trim()}</p>}
        </div>
      );
    }
    return <p className="whitespace-pre-wrap text-sm">{content}</p>;
  };

  const renderExecutionBadge = (tc: TestCase) => {
    if (!tc.execution_result) return null;
    if (tc.execution_result === "passed") {
      return (
        <Badge variant="default" className="bg-emerald-500/10 text-emerald-600 border-emerald-200 gap-1">
          <CheckCircle2 className="h-3 w-3" />
          Passed
        </Badge>
      );
    }
    return (
      <Badge variant="destructive" className="gap-1">
        <XCircle className="h-3 w-3" />
        {tc.execution_result === "timeout" ? "Timeout" : "Failed"}
      </Badge>
    );
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <Button variant="ghost" onClick={() => navigate("/test-suites")} className="gap-2" data-testid="button-back-suites">
        <ArrowLeft className="h-4 w-4" />
        Back to Test Suites
      </Button>

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold" data-testid="text-suite-name">{suite?.name}</h1>
            <StatusBadge value={suite?.suite_type || ""} variant="suite_type" />
            <StatusBadge value={suite?.status || ""} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">{suite?.description}</p>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span>{suite?.total_cases || 0} cases</span>
            <span className="text-emerald-600 dark:text-emerald-400">{suite?.passed_cases || 0} passed</span>
            <span className="text-red-600 dark:text-red-400">{suite?.failed_cases || 0} failed</span>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="cases" data-testid="tab-cases">
            <List className="h-4 w-4 mr-1.5" />
            Test Cases
          </TabsTrigger>
          <TabsTrigger value="automation" data-testid="tab-automation">
            <Code2 className="h-4 w-4 mr-1.5" />
            Automation
          </TabsTrigger>
          <TabsTrigger value="chat" data-testid="tab-chat">
            <Sparkles className="h-4 w-4 mr-1.5" />
            AI Assistant
          </TabsTrigger>
        </TabsList>

        <TabsContent value="cases" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <Dialog open={caseOpen} onOpenChange={setCaseOpen}>
              <DialogTrigger asChild>
                <Button data-testid="button-add-case">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Test Case
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Add Test Case</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input value={caseTitle} onChange={(e) => setCaseTitle(e.target.value)} placeholder="Test case title" data-testid="input-case-title" />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea value={caseDesc} onChange={(e) => setCaseDesc(e.target.value)} placeholder="What is being tested" data-testid="input-case-desc" />
                  </div>
                  <div className="space-y-2">
                    <Label>Steps</Label>
                    <Textarea value={caseSteps} onChange={(e) => setCaseSteps(e.target.value)} placeholder="1. Step one&#10;2. Step two" data-testid="input-case-steps" />
                  </div>
                  <div className="space-y-2">
                    <Label>Expected Result</Label>
                    <Textarea value={caseExpected} onChange={(e) => setCaseExpected(e.target.value)} placeholder="What should happen" data-testid="input-case-expected" />
                  </div>
                  <div className="space-y-2">
                    <Label>Priority</Label>
                    <Select value={casePriority} onValueChange={setCasePriority}>
                      <SelectTrigger data-testid="select-case-priority"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={() => createCase.mutate()} disabled={!caseTitle.trim() || createCase.isPending} className="w-full" data-testid="button-submit-case">
                    {createCase.isPending ? "Creating..." : "Add Test Case"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          {!suite?.test_cases || suite.test_cases.length === 0 ? (
            <EmptyState
              icon={<List className="h-12 w-12" />}
              title="No test cases yet"
              description="Add test cases manually or use the AI Assistant to generate them."
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-[250px]">Title</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suite.test_cases.map((tc) => (
                      <TableRow key={tc.id} data-testid={`row-case-${tc.id}`} className={focusedCaseId === tc.id ? "ring-2 ring-blue-500 bg-blue-50/50 dark:bg-blue-950/20 transition-all" : ""}>
                        <TableCell>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{tc.title}</p>
                              <BornFromBadge testCaseId={tc.id} projectId={suite.project_id} />
                            </div>
                            {tc.description && (
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{tc.description}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell><StatusBadge value={tc.priority} variant="priority" /></TableCell>
                        <TableCell>
                          <Select
                            value={tc.status}
                            onValueChange={(status) => updateCaseStatus.mutate({ caseId: tc.id, status })}
                          >
                            <SelectTrigger className="w-[120px]" data-testid={`select-status-${tc.id}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {TEST_CASE_STATUSES.map((s) => (
                                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{tc.category || "-"}</TableCell>
                        <TableCell>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => deleteCase.mutate(tc.id)}
                            data-testid={`button-delete-case-${tc.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="automation" className="mt-4 space-y-4">
          {!suite?.test_cases || suite.test_cases.length === 0 ? (
            <EmptyState
              icon={<Code2 className="h-12 w-12" />}
              title="No test cases to automate"
              description="Create test cases first, then generate Gherkin and Playwright code."
            />
          ) : (
            <div className="space-y-3">
              <Card className="p-4 border-dashed bg-muted/30">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Zap className="h-4 w-4 text-amber-500" />
                    Automation Pipeline
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Test Case → Gherkin BDD → Playwright Code → Execute
                  </span>
                </div>
              </Card>

              {suite.test_cases.map((tc) => (
                <Card key={tc.id} className={`overflow-hidden ${focusedCaseId === tc.id ? "ring-2 ring-blue-500 shadow-lg transition-all" : ""}`} data-testid={`automation-case-${tc.id}`}>
                  <div
                    className="p-4 flex items-center justify-between gap-3 cursor-pointer hover:bg-accent/50 transition-colors"
                    onClick={() => setExpandedCase(expandedCase === tc.id ? null : tc.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {expandedCase === tc.id ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-sm truncate">{tc.title}</p>
                          <BornFromBadge testCaseId={tc.id} projectId={suite.project_id} />
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <StatusBadge value={tc.priority} variant="priority" />
                          {tc.gherkin_script && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <FileCode className="h-2.5 w-2.5" />
                              Gherkin
                            </Badge>
                          )}
                          {tc.playwright_code && (
                            <Badge variant="outline" className="text-xs gap-1">
                              <Code2 className="h-2.5 w-2.5" />
                              Playwright
                            </Badge>
                          )}
                          {renderExecutionBadge(tc)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={generatingGherkin === tc.id}
                        onClick={(e) => { e.stopPropagation(); generateGherkin(tc.id); }}
                        data-testid={`button-gen-gherkin-${tc.id}`}
                      >
                        {generatingGherkin === tc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCode className="h-3 w-3" />}
                        Gherkin
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs gap-1"
                        disabled={!tc.gherkin_script || generatingPlaywright === tc.id}
                        onClick={(e) => { e.stopPropagation(); generatePlaywright(tc.id); }}
                        data-testid={`button-gen-playwright-${tc.id}`}
                      >
                        {generatingPlaywright === tc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Code2 className="h-3 w-3" />}
                        Playwright
                      </Button>
                      <Button
                        size="sm"
                        variant={tc.playwright_code ? "default" : "outline"}
                        className="h-7 text-xs gap-1"
                        disabled={!tc.playwright_code || executingTest === tc.id}
                        onClick={(e) => { e.stopPropagation(); executeTest(tc.id); }}
                        data-testid={`button-execute-${tc.id}`}
                      >
                        {executingTest === tc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                        Run
                      </Button>
                    </div>
                  </div>

                  {expandedCase === tc.id && (
                    <div className="border-t">
                      <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x">
                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                              <FileCode className="h-3.5 w-3.5" />
                              Gherkin BDD
                            </h4>
                            {tc.gherkin_script && (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(tc.gherkin_script, "Gherkin")} data-testid={`copy-gherkin-${tc.id}`}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => downloadFile(tc.gherkin_script, `${tc.title.replace(/\s+/g, '_')}.feature`)} data-testid={`download-gherkin-${tc.id}`}>
                                  <Download className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                          {tc.gherkin_script ? (
                            <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-auto max-h-64 whitespace-pre-wrap font-mono" data-testid={`gherkin-content-${tc.id}`}>
                              {tc.gherkin_script}
                            </pre>
                          ) : (
                            <p className="text-xs text-muted-foreground italic py-8 text-center">
                              Click "Gherkin" to generate BDD script from this test case
                            </p>
                          )}
                        </div>

                        <div className="p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                              <Code2 className="h-3.5 w-3.5" />
                              Playwright Code
                            </h4>
                            {tc.playwright_code && (
                              <div className="flex gap-1">
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyToClipboard(tc.playwright_code, "Playwright")} data-testid={`copy-playwright-${tc.id}`}>
                                  <Copy className="h-3 w-3" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => downloadFile(tc.playwright_code, `${tc.title.replace(/\s+/g, '_')}.spec.ts`)} data-testid={`download-playwright-${tc.id}`}>
                                  <Download className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>
                          {tc.playwright_code ? (
                            <pre className="text-xs bg-muted/50 rounded-md p-3 overflow-auto max-h-64 whitespace-pre-wrap font-mono" data-testid={`playwright-content-${tc.id}`}>
                              {tc.playwright_code}
                            </pre>
                          ) : (
                            <p className="text-xs text-muted-foreground italic py-8 text-center">
                              Generate Gherkin first, then click "Playwright" to create test code
                            </p>
                          )}
                        </div>
                      </div>

                      {tc.execution_log && (
                        <div className="border-t p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                              <Play className="h-3.5 w-3.5" />
                              Execution Log
                            </h4>
                            {renderExecutionBadge(tc)}
                          </div>
                          <LogViewer
                            log={tc.execution_log}
                            title="Execution log"
                            maxHeight="320px"
                            defaultExpanded={false}
                            testId={`execution-log-${tc.id}`}
                          />
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="chat" className="mt-4">
          <Card className="flex flex-col h-[600px]">
            <div className="p-4 border-b flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">KIT AI Assistant</h3>
              <span className="text-xs text-muted-foreground ml-auto">
                Ask me to generate test cases for this suite
              </span>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {(!messages || messages.length === 0) && !streaming && (
                  <div className="text-center py-12">
                    <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground mb-1">Start a conversation with KIT AI</p>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                      Try: "Generate test cases for user login functionality" or "Create regression test scenarios for payment processing"
                    </p>
                  </div>
                )}

                {messages?.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-lg p-3 ${
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-card border"
                      }`}
                      data-testid={`chat-message-${msg.id}`}
                    >
                      {renderMessageContent(msg.content, msg.role)}
                    </div>
                  </div>
                ))}

                {streaming && streamContent && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-lg p-3 bg-card border">
                      {renderMessageContent(streamContent, "assistant")}
                    </div>
                  </div>
                )}

                {streaming && !streamContent && (
                  <div className="flex justify-start">
                    <div className="rounded-lg p-3 bg-card border">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <div className="animate-pulse">Thinking...</div>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={chatEndRef} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && sendMessage()}
                  placeholder="Ask KIT to generate test cases..."
                  disabled={streaming}
                  data-testid="input-chat-message"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!chatInput.trim() || streaming}
                  data-testid="button-send-chat"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
