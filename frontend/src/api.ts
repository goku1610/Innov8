import axios from 'axios';

const AI_BASE_URL = process.env.REACT_APP_AI_BASE_URL || 'http://localhost:8000';

export async function sendFullSnapshot(code: string, sessionId?: string | null): Promise<string> {
  const resp = await axios.post(`${AI_BASE_URL}/api/llm/generate`, {
    mode: 'full',
    code,
    metrics: undefined,
    session_id: sessionId || undefined
  });
  return resp.data?.response || '';
}

export async function sendPatchSnapshot(patch: string, sessionId?: string | null): Promise<string> {
  const resp = await axios.post(`${AI_BASE_URL}/api/llm/generate`, {
    mode: 'patch',
    patch,
    metrics_patch: undefined,
    session_id: sessionId || undefined
  });
  return resp.data?.response || '';
}


