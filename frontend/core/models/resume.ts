import type { Sections } from "./section";

export interface Resume {
  id: number;
  title: string;
  template_id: number;
  sections: Sections;
  target_company: string;
  target_position: string;
  created_at: string;
  updated_at: string;
}

export interface ResumeCreate {
  title?: string;
  template_id?: number;
  sections?: Sections;
  target_company?: string;
  target_position?: string;
}

export interface ResumeUpdate {
  title?: string;
  template_id?: number;
  sections?: Sections;
  target_company?: string;
  target_position?: string;
}
