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
