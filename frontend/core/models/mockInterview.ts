export interface MockInterview {
  id: number;
  jd_analysis_id: number | null;
  position: string;
  company: string;
  status: "in_progress" | "completed";
  interview_type: "comprehensive" | "algorithm" | "system_design" | "behavioral";
  difficulty_level: "junior" | "mid" | "senior";
  overall_feedback: Record<string, unknown> | null;
  summary_score: number | null;
  started_at: string;
  completed_at: string | null;
  messages: MockInterviewMessage[];
}

export interface MockInterviewMessage {
  id: number;
  role: "ai" | "user";
  content: string;
  question_type: "opening" | "interview" | "answer" | "feedback" | "closing";
  metadata_json: Record<string, unknown>;
  created_at: string;
}

export interface InterviewListItem {
  id: number;
  jd_analysis_id: number | null;
  position: string;
  company: string;
  status: "in_progress" | "completed";
  interview_type: string;
  difficulty_level: string;
  summary_score: number | null;
  total_questions: number;
  started_at: string;
  completed_at: string | null;
}

export interface StartInterviewRequest {
  jd_analysis_id?: number;
  position?: string;
  company?: string;
  interview_type?: string;
  difficulty_level?: string;
}

export interface AnswerRequest {
  content: string;
}
