import React, { useEffect, useMemo, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';

type TranscriptItem = { timestamp: number; speaker: 'candidate' | 'interviewer'; text: string };
type EventItem = { timestamp: number; type: 'CODE_SNAPSHOT' | 'RUN' | 'NOTE'; payload: any };

export type PlaybackData = {
  language: 'python' | 'javascript' | 'java' | 'c' | 'cpp';
  initialCode: string;
  events: EventItem[];
  transcripts: TranscriptItem[];
  totalDurationMs: number;
};

type Props = {
  open: boolean;
  onClose: () => void;
  data: PlaybackData;
};

const SPEEDS = [1, 1.5, 2] as const;

const PlaybackModal: React.FC<Props> = ({ open, onClose, data }) => {
  const [playbackTime, setPlaybackTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedIdx, setSpeedIdx] = useState<number>(0);
  const intervalRef = useRef<number | null>(null);
  const editorRef = useRef<any>(null);

  const sortedEvents = useMemo(() => {
    return [...(data.events || [])].sort((a, b) => a.timestamp - b.timestamp);
  }, [data.events]);

  useEffect(() => {
    if (!open) return;
    if (isPlaying) {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      const spd = SPEEDS[speedIdx];
      intervalRef.current = window.setInterval(() => {
        setPlaybackTime((t) => {
          const next = t + 100 * spd;
          if (next >= data.totalDurationMs) {
            if (intervalRef.current !== null) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            setIsPlaying(false);
            return data.totalDurationMs;
          }
          return next;
        });
      }, 100);
      return () => {
        if (intervalRef.current !== null) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    }
  }, [isPlaying, speedIdx, data.totalDurationMs, open]);

  useEffect(() => {
    if (!open) return;
    // Update editor to the latest CODE_SNAPSHOT before or at playbackTime
    const snapshots = sortedEvents.filter((e) => e.type === 'CODE_SNAPSHOT' && e.timestamp <= playbackTime);
    const latest = snapshots[snapshots.length - 1];
    if (latest && editorRef.current) {
      try {
        const model = editorRef.current.getModel?.();
        if (model) {
          model.setValue(latest.payload.code || '');
        }
      } catch (_) {}
    }
    // Scroll timeline panel into view for the current event
    const activeEl = document.querySelector(`[data-evt-ts="${latest?.timestamp || 0}"]`);
    if (activeEl && 'scrollIntoView' in activeEl) {
      try { (activeEl as any).scrollIntoView({ block: 'nearest' }); } catch (_) {}
    }
  }, [playbackTime, sortedEvents, open]);

  useEffect(() => {
    if (!open) return;
    // Reset editor content when opening
    setPlaybackTime(0);
    setIsPlaying(false);
  }, [open]);

  if (!open) return null;

  const currentIdx = sortedEvents.findIndex(e => e.type === 'CODE_SNAPSHOT' && e.timestamp <= playbackTime);

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div style={{ width: '90vw', height: '85vh', background: '#101214', color: '#e5e7eb', borderRadius: 12, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111827' }}>
          <div style={{ fontWeight: 700 }}>Session Playback</div>
          <button onClick={onClose}>Close</button>
        </div>
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 0 }}>
          {/* Code editor panel */}
          <div style={{ borderRight: '1px solid #1f2937', display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1 }}>
              <Editor
                height="100%"
                language={data.language}
                defaultValue={data.initialCode}
                onMount={(editor) => { editorRef.current = editor; }}
                theme="vs-dark"
                options={{ readOnly: true, minimap: { enabled: false }, fontSize: 14 }}
              />
            </div>
          </div>
          {/* Timeline panel */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: 12, borderBottom: '1px solid #1f2937', fontWeight: 600 }}>Event Timeline</div>
            <div style={{ flex: 1, overflow: 'auto', padding: 12, display: 'grid', gap: 8 }}>
              {sortedEvents.map((e, i) => (
                <div
                  key={i}
                  data-evt-ts={e.timestamp}
                  style={{
                    padding: 8,
                    borderRadius: 8,
                    background: e.timestamp <= playbackTime ? '#1f2937' : 'transparent',
                    border: '1px solid #374151'
                  }}
                  title={`${e.type} @ ${e.timestamp}ms`}
                >
                  <div style={{ fontSize: 12, color: '#9ca3af' }}>{e.timestamp}ms</div>
                  <div style={{ fontWeight: 600 }}>{e.type}</div>
                  {e.type === 'NOTE' && <div style={{ color: '#d1d5db' }}>{e.payload?.text}</div>}
                </div>
              ))}
            </div>
            <div style={{ borderTop: '1px solid #1f2937', padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
              <button onClick={() => setIsPlaying((p) => !p)}>{isPlaying ? 'Pause' : 'Play'}</button>
              <input
                type="range"
                min={0}
                max={data.totalDurationMs}
                step={100}
                value={playbackTime}
                onChange={(e) => setPlaybackTime(parseInt(e.target.value, 10))}
                style={{ flex: 1 }}
              />
              <select value={speedIdx} onChange={(e) => setSpeedIdx(parseInt(e.target.value, 10))}>
                {SPEEDS.map((s, i) => (
                  <option key={s} value={i}>{s}x</option>
                ))}
              </select>
            </div>
          </div>
        </div>
        {/* Transcript strip */}
        <div style={{ padding: 8, background: '#0b0f14', borderTop: '1px solid #1f2937', display: 'flex', gap: 12, overflowX: 'auto' }}>
          {data.transcripts.map((t, idx) => (
            <div key={idx} style={{ whiteSpace: 'nowrap', color: '#cbd5e1' }}>
              <span style={{ color: '#93c5fd' }}>{t.speaker === 'candidate' ? '👩‍💻' : '🧑‍🏫'}</span> {t.timestamp}ms: {t.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default PlaybackModal;


