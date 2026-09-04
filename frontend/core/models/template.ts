export interface TemplateSection {
  key: string;
  title: string;
  required: boolean;
  max_length: number;
  hint: string;
}

export interface TemplateStructure {
  sections: TemplateSection[];
  style: Record<string, string>;
}

export interface ResumeTemplate {
  id: number;
  name: string;
  description: string;
  structure: TemplateStructure;
  is_default: boolean;
  created_at: string;
}
