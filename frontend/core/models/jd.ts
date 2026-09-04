export interface TechStackItem {
  name: string;
  category: string;
  required_level: string;
  priority: number;
}

export interface JDAnalysis {
  id: number;
  company: string;
  position: string;
  title: string;
  jd_text: string;
  tech_stack: TechStackItem[];
  analysis_result: Record<string, unknown>;
  resume_id: number | null;
  job_url?: string;
  created_at: string;
}

export interface JDAnalysisListItem {
  id: number;
  company: string;
  position: string;
  title: string;
  resume_id: number | null;
  created_at: string;
}

export interface GapAnalysis {
  matched_skills: { name: string; category: string; level: string }[];
  missing_skills: { name: string; category: string; required_level: string; priority: number }[];
  total_required: number;
  match_count: number;
  match_percentage: number;
  suggestions: string[];
}
