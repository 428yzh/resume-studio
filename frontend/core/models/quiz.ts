export interface Question {
  id: number;
  type: "single_choice" | "multi_choice" | "essay";
  question_text: string;
  options: { key: string; text: string }[] | [];
  correct_answer: string;
  skill_ids: number[];
  jd_analysis_id: number | null;
  created_at: string;
}

export interface QuizSession {
  id: number;
  mode: "practice" | "exam";
  question_ids: number[];
  status: "in_progress" | "completed";
  score: number;
  total_questions: number;
  correct_count: number;
  started_at: string;
  completed_at: string | null;
}

export interface QuizAnswer {
  id: number;
  session_id: number;
  question_id: number;
  user_answer: string;
  is_correct: boolean | null;
  ai_score: number | null;
  ai_feedback: string;
  ai_reference: string;
  answered_at: string;
}

export interface QuizSessionDetail extends QuizSession {
  questions: Question[];
  answers: QuizAnswer[];
}

export interface GenerateRequest {
  mode: "practice" | "exam";
  skill_ids?: number[];
  jd_analysis_id?: number;
  counts?: { single_choice?: number; multi_choice?: number; essay?: number };
}

export interface SessionListItem {
  id: number;
  mode: "practice" | "exam";
  status: "in_progress" | "completed";
  score: number;
  total_questions: number;
  correct_count: number;
  started_at: string;
  completed_at: string | null;
}
