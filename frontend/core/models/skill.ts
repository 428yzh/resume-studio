export interface Skill {
  id: number;
  name: string;
  category: string;
  proficiency: number;
  source: string;
  notes: string;
  learned_at: string | null;
  created_at: string;
}

export interface SkillCreate {
  name: string;
  category?: string;
  proficiency?: number;
  source?: string;
  notes?: string;
}

export interface LearningResource {
  id: number;
  skill_id: number;
  title: string;
  url: string;
  type: string;
  completed: boolean;
}

export interface LearningResourceCreate {
  title: string;
  url?: string;
  type?: string;
  completed?: boolean;
}

export interface InterviewQuestion {
  id: number;
  skill_id: number;
  question: string;
  answer: string;
  difficulty: string;
}

export interface InterviewQuestionCreate {
  question: string;
  answer?: string;
  difficulty?: string;
}
