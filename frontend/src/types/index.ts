export interface Domain {
  id: string;
  name: string;
  description: string;
  knowledge_docs: string;
  project_count: number;
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  domain_id: string;
  name: string;
  description: string;
  jira_project_key: string;
  jira_url: string;
  jira_connection_id?: string | null;
  app_url: string;
  brd_document: string;
  status: string;
  created_at: string;
  updated_at: string;
  applications?: ApplicationSummary[];
  test_suites?: TestSuiteSummary[];
}

export interface JiraConnection {
  id: string;
  name: string;
  base_url: string;
  email: string;
}

export interface ApplicationSummary {
  id: string;
  name: string;
  app_type: string;
  url: string;
  status: string;
}

export interface Application {
  id: string;
  project_id: string;
  name: string;
  app_type: string;
  url: string;
  description: string;
  documentation_url: string;
  codebase_url: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface TestSuiteSummary {
  id: string;
  name: string;
  suite_type: string;
  status: string;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
}

export interface TestSuite {
  id: string;
  project_id: string;
  name: string;
  suite_type: string;
  description: string;
  status: string;
  total_cases: number;
  passed_cases: number;
  failed_cases: number;
  created_at: string;
  updated_at: string;
  test_cases?: TestCase[];
}

export interface TestCase {
  id: string;
  test_suite_id: string;
  title: string;
  description: string;
  preconditions: string;
  steps: string;
  expected_result: string;
  priority: string;
  status: string;
  category: string;
  gherkin_script: string;
  playwright_code: string;
  execution_result: string;
  execution_log: string;
  created_at: string;
  updated_at?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface SearchResult {
  type: "domain" | "project" | "application" | "test_suite" | "test_case";
  id: string;
  name: string;
  description?: string;
  domain_id?: string;
  project_id?: string;
  test_suite_id?: string;
  suite_type?: string;
}

export interface DashboardAnalytics {
  total_domains: number;
  total_projects: number;
  total_applications: number;
  total_test_suites: number;
  total_test_cases: number;
  passed_cases: number;
  failed_cases: number;
  blocked_cases: number;
  draft_cases: number;
  suite_type_breakdown: Record<string, number>;
  priority_breakdown: Record<string, number>;
}

export interface AnalyticsOverview {
  range: "today" | "7d" | "30d";
  window: { start: string; end: string };
  totals: {
    runs: number;
    passed: number;
    failed: number;
    errors: number;
    pass_rate: number;
    avg_duration_ms: number;
    active_projects: number;
    today_runs: number;
    today_passed: number;
    today_failed: number;
    flaky_tests: number;
    mttr_ms: number;
    mttr_samples: number;
  };
  trend: Array<{ label: string; iso: string; passed: number; failed: number; total: number }>;
  flakiest: AnalyticsCaseEntry[];
  slowest: AnalyticsCaseEntry[];
  recent_runs: RecentRunEntry[];
}

export interface AnalyticsCaseEntry {
  id: string;
  title: string;
  suite_id?: string | null;
  suite_name?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  priority?: string;
  jira_story_key?: string;
  runs: number;
  passed: number;
  failed: number;
  flakiness_pct: number;
  fail_rate_pct?: number;
  avg_duration_ms: number;
  last_run_at: string | null;
}

export interface TriageSummary {
  id: string;
  run_id: string;
  category: string;
  confidence: number;
  hypothesis: string;
  evidence: Array<{ snippet: string; why: string }>;
  suggested_action: string;
  suggested_action_detail: string;
  model: string;
  error: string;
  created_at: string | null;
}

export interface RecentRunEntry {
  run_id: string;
  case_id: string;
  case_title: string;
  project_name: string | null;
  suite_name: string | null;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number;
  total_scenarios: number;
  passed_scenarios: number;
  failed_scenarios: number;
  summary: string;
  triage?: TriageSummary | null;
}

export interface TestRunRecord {
  id: string;
  run_number: number;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  duration_ms: number;
  total_scenarios: number;
  passed_scenarios: number;
  failed_scenarios: number;
  total_steps: number;
  errors: number;
  summary: string;
  video_path: string;
  scenarios: Array<{ name: string; status: string; errors: number; actions: number; order_index: number }>;
}

export interface ProjectAnalytics {
  project_id: string;
  total_suites: number;
  total_cases: number;
  total_passed: number;
  total_failed: number;
  pass_rate: number;
  suite_stats: SuiteStat[];
  total_applications: number;
}

export interface SuiteStat {
  id: string;
  name: string;
  suite_type: string;
  status: string;
  total_cases: number;
  passed: number;
  failed: number;
  blocked: number;
}

export const SUITE_TYPES = [
  { value: "sprint", label: "Sprint Testing" },
  { value: "module", label: "Module Testing" },
  { value: "integration", label: "Integration Testing" },
  { value: "e2e", label: "End-to-End Testing" },
  { value: "smoke", label: "Smoke Testing" },
  { value: "regression", label: "Regression Testing" },
] as const;

export const SUITE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "executing", label: "Executing" },
  { value: "completed", label: "Completed" },
] as const;

export const TEST_CASE_STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "executing", label: "Executing" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
  { value: "blocked", label: "Blocked" },
] as const;

export const PRIORITIES = [
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
] as const;

export interface DesignValidation {
  id: string;
  application_id: string | null;
  application_name: string | null;
  name: string;
  figma_url: string;
  app_url: string;
  status: string;
  overall_score: number | null;
  summary: string;
  figma_video_path: string;
  app_video_path: string;
  journey_mode: string;
  journey_steps: Array<{
    action: string;
    target: string;
    value: string;
    description: string;
    capture_after: boolean;
    capture_name: string;
  }>;
  created_at: string;
  updated_at: string;
  pages: ValidationPage[];
}

export interface ValidationPage {
  id: string;
  validation_id: string;
  page_name: string;
  figma_image_path: string;
  app_image_path: string;
  compliance_score: number | null;
  findings: string;
  status: string;
  created_at: string;
}

export interface ColorComparison {
  element: string;
  figma_hex: string;
  app_hex: string;
  match: boolean;
}

export interface DimensionComparison {
  component: string;
  figma_dims: string;
  app_dims: string;
  diff_px: string;
}

export interface TypographyComparison {
  element: string;
  figma_font: string;
  app_font: string;
  match: boolean;
}

export interface SpacingComparison {
  element: string;
  property: string;
  figma_value: string;
  app_value: string;
}

export interface ComparisonResult {
  overall_score: number;
  design_fidelity_score?: number;
  ux_score?: number;
  fidelity_scores?: {
    visual?: number;
    layout?: number;
    component?: number;
    token_theme?: number;
    ux_flow?: number;
  };
  categories: ComparisonCategory[];
  critical_issues: string[];
  minor_issues: string[];
  ux_findings?: string[];
  recommendations: string[];
  component_analysis?: ComponentAnalysis[];
  color_comparisons?: ColorComparison[];
  dimension_comparisons?: DimensionComparison[];
  typography_comparisons?: TypographyComparison[];
  spacing_comparisons?: SpacingComparison[];
  summary: string;
  structural_analysis?: StructuralAnalysis;
  extracted_dom_evidence?: Record<string, unknown>;
  figma_design_tokens?: Record<string, unknown>;
}

export interface StructuralDiffItem {
  [key: string]: string | boolean | undefined;
  element?: string;
  component?: string;
  location?: string;
  property?: string;
  figma_value?: string;
  app_value?: string;
  figma_icon?: string;
  app_icon?: string;
  figma_image?: string;
  app_image?: string;
  match?: boolean;
  severity?: string;
}

export interface StructuralAnalysis {
  structural_score?: number;
  critical_count?: number;
  major_count?: number;
  minor_count?: number;
  color_diffs?: StructuralDiffItem[];
  typography_diffs?: StructuralDiffItem[];
  spacing_diffs?: StructuralDiffItem[];
  layout_diffs?: StructuralDiffItem[];
  icon_diffs?: StructuralDiffItem[];
  image_diffs?: StructuralDiffItem[];
  component_diffs?: StructuralDiffItem[];
}

export interface ComponentAnalysis {
  component: string;
  design_match: string;
  notes: string;
}

export interface ComparisonCategory {
  name: string;
  score: number;
  findings: string;
}

export const VALIDATION_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
] as const;
