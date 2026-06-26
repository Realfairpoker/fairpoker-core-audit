import {TranscriptSnapshot} from "./transcript";

const TRANSCRIPT_DEMO_STORAGE_KEY = 'fairpoker:transcript-demo-v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function isTranscriptSnapshot(value: unknown): value is TranscriptSnapshot<unknown> {
  return isRecord(value)
    && value.version === 'fairpoker.transcript.v1'
    && typeof value.finalHash === 'string'
    && Array.isArray((value as {entries?: unknown}).entries);
}

export function loadTranscriptForDemo(): TranscriptSnapshot<unknown> | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(TRANSCRIPT_DEMO_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (!isTranscriptSnapshot(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveTranscriptForDemo(snapshot: TranscriptSnapshot<unknown> | null): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false;
  }
  try {
    if (!snapshot) {
      window.localStorage.removeItem(TRANSCRIPT_DEMO_STORAGE_KEY);
      return true;
    }
    window.localStorage.setItem(TRANSCRIPT_DEMO_STORAGE_KEY, JSON.stringify(snapshot));
    return true;
  } catch {
    return false;
  }
}

export function clearTranscriptForDemo(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false;
  }
  try {
    window.localStorage.removeItem(TRANSCRIPT_DEMO_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
