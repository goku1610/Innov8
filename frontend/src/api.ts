import axios from 'axios';

const AI_BASE_URL = process.env.REACT_APP_AI_BASE_URL || 'http://localhost:8000';
const CODE_BASE_URL = process.env.REACT_APP_CODE_BASE_URL || 'http://localhost:3000';

export async function sendFullSnapshot(code: string, sessionId?: string | null, questionJson?: any): Promise<string> {
  const resp = await axios.post(`${AI_BASE_URL}/api/llm/generate`, {
    mode: 'full',
    code,
    metrics: undefined,
    session_id: sessionId || undefined,
    question_json: questionJson || undefined,
  });
  return resp.data?.response || '';
}

export async function sendPatchSnapshot(patch: string, sessionId?: string | null, questionJson?: any): Promise<string> {
  const resp = await axios.post(`${AI_BASE_URL}/api/llm/generate`, {
    mode: 'patch',
    patch,
    metrics_patch: undefined,
    session_id: sessionId || undefined,
    question_json: questionJson || undefined,
  });
  return resp.data?.response || '';
}


export interface QuestionItem {
  id: string;
  title: string;
  Full_question: string;
  short_description: string;
  difficulty: { numeric: number; label: string };
  concepts: string[];
  public_tests: Array<{ input: any; output: any; explanation?: string | null }>;
  constraints?: any;
  canonical_skeleton?: string;
  hint_templates?: Array<{ nudge?: string; guide?: string; direction?: string }>;
  typical_time_stats?: { median_s?: number; p25_s?: number; p75_s?: number };
  prerequisites?: string[];
  reveal_policy?: string;
  scoring_rubric?: any;
  canonical_solution?: string;
  solution_steps?: any[];
  edge_cases?: string[];
  learning_objectives?: string[];
  related_problems?: string[];
}

export async function fetchQuestions(): Promise<{ ok: boolean; total: number; questions: QuestionItem[] }> {
  const res = await axios.get(`${CODE_BASE_URL}/questions`);
  return res.data;
}

export async function fetchQuestionByIndex(index: number): Promise<{ ok: boolean; total: number; question: QuestionItem }> {
  const res = await axios.get(`${CODE_BASE_URL}/questions`, { params: { index } });
  return res.data;
}
