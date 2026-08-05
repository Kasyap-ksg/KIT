import { useState, useMemo, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Info,
  Maximize2,
  Minimize2,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface LogViewerProps {
  log: string | null | undefined;
  title?: string;
  /**
   * Visual density variant.
   * - "default": full controls including the inline search input.
   * - "compact": header is denser and the inline search input is hidden
   *   (search can still be invoked from the parent if desired). Useful
   *   inside tight cards / expandable rows.
   */
  variant?: "default" | "compact";
  defaultExpanded?: boolean;
  showSearch?: boolean;
  showCopy?: boolean;
  isStreaming?: boolean;
  maxHeight?: string;
  emptyMessage?: string;
  testId?: string;
}

interface ParsedLine {
  text: string;
  raw: string;
  kind: "success" | "error" | "warn" | "info" | "step" | "header" | "neutral";
  indent: number;
}

interface ScenarioGroup {
  name: string;
  status: "passed" | "failed" | "running";
  startIdx: number;
  endIdx: number;
  lines: ParsedLine[];
  errors: number;
  steps: number;
}

interface ParsedLog {
  preamble: ParsedLine[];
  scenarios: ScenarioGroup[];
  summary: ParsedLine[];
}

function classifyLine(raw: string): ParsedLine {
  const trimmed = raw.trimEnd();
  const leading = raw.length - raw.trimStart().length;
  const lower = trimmed.toLowerCase();

  let kind: ParsedLine["kind"] = "neutral";

  if (/^={3,}/.test(trimmed.trim()) || /^EXECUTION SUMMARY/i.test(trimmed.trim())) {
    kind = "header";
  } else if (/^\s*✓/.test(trimmed) || /\bpassed\b/i.test(trimmed) && !/failed/i.test(trimmed)) {
    kind = "success";
  } else if (/^\s*✗/.test(trimmed) || /\bfailed\b/i.test(trimmed) || /\berror\b/i.test(lower) || /not found/i.test(lower) || /fatal/i.test(lower)) {
    kind = "error";
  } else if (/^\s*⚠/.test(trimmed) || /warn/i.test(lower) || /timeout/i.test(lower)) {
    kind = "warn";
  } else if (/^\s*→/.test(trimmed) || /^\s*Resolved/.test(trimmed) || /^\s*Filled/.test(trimmed)) {
    kind = "info";
  } else if (/^\s*Step\s+\d+\/\d+/i.test(trimmed)) {
    kind = "step";
  }

  return { text: trimmed, raw, kind, indent: leading };
}

function parseLog(log: string): ParsedLog {
  const lines = log.split("\n").map(classifyLine);
  const scenarios: ScenarioGroup[] = [];
  const preamble: ParsedLine[] = [];
  const summary: ParsedLine[] = [];

  let mode: "preamble" | "scenario" | "summary" = "preamble";
  let current: ScenarioGroup | null = null;

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    const t = ln.text.trim();

    const headerMatch = t.match(/^SCENARIO\s+\d+\/\d+:\s*(.+)$/i);
    if (headerMatch) {
      if (current) {
        current.endIdx = i - 1;
        scenarios.push(current);
      }
      current = {
        name: headerMatch[1].trim(),
        status: "running",
        startIdx: i,
        endIdx: i,
        lines: [],
        errors: 0,
        steps: 0,
      };
      mode = "scenario";
      continue;
    }

    if (mode === "scenario" && /^EXECUTION SUMMARY/i.test(t)) {
      if (current) {
        current.endIdx = i - 1;
        scenarios.push(current);
        current = null;
      }
      mode = "summary";
      summary.push(ln);
      continue;
    }

    if (mode === "scenario" && current) {
      const resultMatch = t.match(/^Result:\s+(PASSED|FAILED)\s+\((\d+)\s+steps?,\s+(\d+)\s+errors?\)/i);
      if (resultMatch) {
        current.status = resultMatch[1].toUpperCase() === "PASSED" ? "passed" : "failed";
        current.steps = parseInt(resultMatch[2], 10);
        current.errors = parseInt(resultMatch[3], 10);
      }
      current.lines.push(ln);
      continue;
    }

    if (mode === "summary") {
      summary.push(ln);
      continue;
    }

    preamble.push(ln);
  }

  if (current) {
    current.endIdx = lines.length - 1;
    scenarios.push(current);
  }

  return { preamble, scenarios, summary };
}

const KIND_CLASSES: Record<ParsedLine["kind"], string> = {
  success: "text-emerald-700 dark:text-emerald-400",
  error: "text-red-700 dark:text-red-400 font-medium",
  warn: "text-amber-700 dark:text-amber-400",
  info: "text-sky-700 dark:text-sky-400",
  step: "text-foreground font-semibold",
  header: "text-foreground font-bold border-l-2 border-primary pl-2",
  neutral: "text-muted-foreground",
};

const KIND_ICONS: Partial<Record<ParsedLine["kind"], React.ReactNode>> = {
  success: <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />,
  error: <XCircle className="h-3 w-3 text-red-500 shrink-0" />,
  warn: <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" />,
  info: <ArrowRight className="h-3 w-3 text-sky-500 shrink-0" />,
};

function renderLine(line: ParsedLine, idx: number, lineNum: number, highlight: string | null) {
  const cls = KIND_CLASSES[line.kind];
  const icon = KIND_ICONS[line.kind];
  let content: React.ReactNode = line.text || " ";

  if (highlight && line.text.toLowerCase().includes(highlight.toLowerCase())) {
    const re = new RegExp(`(${highlight.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    const parts = line.text.split(re);
    content = parts.map((p, i) =>
      p.toLowerCase() === highlight.toLowerCase() ? (
        <mark key={i} className="bg-yellow-200 dark:bg-yellow-900/60 text-foreground rounded px-0.5">
          {p}
        </mark>
      ) : (
        <span key={i}>{p}</span>
      ),
    );
  }

  return (
    <div key={idx} className={cn("flex items-start gap-2 px-3 py-0.5 hover:bg-muted/40 group", cls)}>
      <span className="text-[10px] text-muted-foreground/50 select-none w-8 text-right pt-0.5 shrink-0 tabular-nums">
        {lineNum}
      </span>
      <span className="pt-0.5">{icon ?? <span className="inline-block w-3" />}</span>
      <span className="flex-1 whitespace-pre-wrap break-words font-mono text-[12px] leading-relaxed">{content}</span>
    </div>
  );
}

export function LogViewer({
  log,
  title = "Execution Log",
  variant = "default",
  defaultExpanded = true,
  showSearch = true,
  showCopy = true,
  isStreaming = false,
  maxHeight = "500px",
  emptyMessage = "No log available yet.",
  testId,
}: LogViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [search, setSearch] = useState("");
  const [copied, setCopied] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [fullScreen, setFullScreen] = useState(false);
  const [openScenarios, setOpenScenarios] = useState<Record<number, boolean>>({});
  const scrollRef = useRef<HTMLDivElement>(null);

  const parsed = useMemo(() => (log ? parseLog(log) : null), [log]);

  useEffect(() => {
    if (isStreaming && autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [log, isStreaming, autoScroll]);

  useEffect(() => {
    if (parsed) {
      const initial: Record<number, boolean> = {};
      parsed.scenarios.forEach((s, i) => {
        initial[i] = s.status === "failed" || s.status === "running" || parsed.scenarios.length <= 2;
      });
      setOpenScenarios(initial);
    }
  }, [parsed?.scenarios.length]);

  const handleCopy = () => {
    if (log) {
      navigator.clipboard.writeText(log);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  if (!log || !parsed) {
    return (
      <div className="rounded-lg border bg-muted/20 p-6 text-center" data-testid={testId}>
        <ScrollText className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">{emptyMessage}</p>
      </div>
    );
  }

  const totalLines = parsed.preamble.length + parsed.summary.length + parsed.scenarios.reduce((s, sc) => s + 1 + sc.lines.length, 0);
  const totalScenarios = parsed.scenarios.length;
  const passedScenarios = parsed.scenarios.filter((s) => s.status === "passed").length;
  const failedScenarios = parsed.scenarios.filter((s) => s.status === "failed").length;

  let runningLineNum = 0;

  const containerCls = cn(
    "rounded-lg border bg-card overflow-hidden flex flex-col",
    fullScreen && "fixed inset-4 z-50 shadow-2xl",
  );

  return (
    <div className={containerCls} data-testid={testId}>
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
        <button
          onClick={() => setExpanded((e) => !e)}
          className="flex items-center gap-1.5 text-sm font-medium hover:text-primary transition-colors"
          data-testid={testId ? `${testId}-toggle` : undefined}
        >
          {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <ScrollText className="h-4 w-4 text-muted-foreground" />
          {title}
        </button>

        {totalScenarios > 0 && (
          <div className="flex items-center gap-1.5 ml-2">
            <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900">
              <CheckCircle2 className="h-2.5 w-2.5" /> {passedScenarios}
            </Badge>
            {failedScenarios > 0 && (
              <Badge variant="outline" className="h-5 px-1.5 text-[10px] gap-1 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 border-red-200 dark:border-red-900">
                <XCircle className="h-2.5 w-2.5" /> {failedScenarios}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">{totalLines} lines</span>
          </div>
        )}

        <div className="ml-auto flex items-center gap-1">
          {showSearch && expanded && variant !== "compact" && (
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="h-7 w-40 pl-7 text-xs"
                data-testid={testId ? `${testId}-search` : undefined}
              />
            </div>
          )}
          {isStreaming && (
            <Button
              variant={autoScroll ? "default" : "outline"}
              size="sm"
              className="h-7 px-2 text-[11px] gap-1"
              onClick={() => setAutoScroll((a) => !a)}
            >
              <ChevronDown className="h-3 w-3" /> Auto-scroll
            </Button>
          )}
          {showCopy && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleCopy} data-testid={testId ? `${testId}-copy` : undefined}>
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setFullScreen((f) => !f)}>
            {fullScreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {expanded && (
        <div
          ref={scrollRef}
          className="overflow-auto bg-background/40 flex-1"
          style={{ maxHeight: fullScreen ? "calc(100vh - 8rem)" : maxHeight }}
        >
          {parsed.preamble.length > 0 && (
            <div className="py-1 border-b border-dashed">
              {parsed.preamble.map((ln, i) => {
                runningLineNum += 1;
                return renderLine(ln, i, runningLineNum, search || null);
              })}
            </div>
          )}

          {parsed.scenarios.map((sc, sIdx) => {
            const isOpen = openScenarios[sIdx] ?? true;
            const matchesSearch =
              !search ||
              sc.name.toLowerCase().includes(search.toLowerCase()) ||
              sc.lines.some((l) => l.text.toLowerCase().includes(search.toLowerCase()));
            if (search && !matchesSearch) return null;

            const headerLineNum = ++runningLineNum;
            const statusColor =
              sc.status === "passed"
                ? "bg-emerald-500"
                : sc.status === "failed"
                ? "bg-red-500"
                : "bg-amber-500 animate-pulse";

            return (
              <div key={sIdx} className="border-b last:border-b-0">
                <button
                  onClick={() => setOpenScenarios((s) => ({ ...s, [sIdx]: !isOpen }))}
                  className={cn(
                    "w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 text-left",
                    sc.status === "failed" && "bg-red-50/40 dark:bg-red-950/20",
                    sc.status === "passed" && "bg-emerald-50/30 dark:bg-emerald-950/15",
                  )}
                  data-testid={testId ? `${testId}-scenario-${sIdx}` : undefined}
                >
                  {isOpen ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                  <span className={cn("h-2 w-2 rounded-full", statusColor)} />
                  {sc.status === "passed" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  ) : sc.status === "failed" ? (
                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                  ) : (
                    <Info className="h-3.5 w-3.5 text-amber-500" />
                  )}
                  <span className="text-sm font-medium flex-1 truncate">
                    Scenario {sIdx + 1}: {sc.name}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] h-5",
                      sc.status === "passed" && "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
                      sc.status === "failed" && "bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 border-red-300 dark:border-red-800",
                      sc.status === "running" && "bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800",
                    )}
                  >
                    {sc.steps > 0 && `${sc.steps} steps · `}
                    {sc.errors > 0 && `${sc.errors} err · `}
                    {sc.status.toUpperCase()}
                  </Badge>
                </button>
                {isOpen && (
                  <div className="py-1 bg-card">
                    {sc.lines.map((ln, i) => {
                      runningLineNum += 1;
                      return renderLine(ln, i, runningLineNum, search || null);
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {parsed.summary.length > 0 && (
            <div className="py-2 border-t bg-muted/20">
              {parsed.summary.map((ln, i) => {
                runningLineNum += 1;
                return renderLine(ln, i, runningLineNum, search || null);
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
