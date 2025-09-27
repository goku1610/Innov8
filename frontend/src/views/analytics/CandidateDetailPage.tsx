import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bar } from 'react-chartjs-2';
import PlaybackModal, { PlaybackData } from './PlaybackModal';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

type CandidateData = {
  name: string;
  problemTitle: string;
  difficulty: string;
  final_summary: {
    strengths: string[];
    areas_for_improvement: string[];
    text: string;
  };
  readability_score: number; // 0-10
  algorithm: {
    foundOptimal: boolean;
    efficiencyScore: number; // 0-10
    timeComplexity: string;
    spaceComplexity: string;
    optimalTimeComplexity: string;
    optimalSpaceComplexity: string;
  };
  performance: {
    execAvgMs: number;
    execBaselineMs: number;
    memPeakMb: number;
    memBaselineMb: number;
    tests: { label: string; passed: boolean }[];
  };
  deep_quality_assessment_report: {
    methodology: string;
    readability: string;
    alternatives: string;
  };
};

const SAMPLE_DATA: Record<string, CandidateData> = {
  'jane-doe': {
    name: 'Jane Doe',
    problemTitle: 'Two Sum',
    difficulty: 'Medium',
    final_summary: {
      strengths: [
        'Identified optimal hash map approach quickly',
        'Clear separation of concerns and validation'
      ],
      areas_for_improvement: [
        'Use more descriptive variable names',
        'Add inline comments for edge cases'
      ],
      text: 'This is a strong solution. The candidate identified and implemented the optimal algorithm, demonstrating solid understanding of hash map usage.'
    },
    readability_score: 8,
    algorithm: {
      foundOptimal: true,
      efficiencyScore: 10,
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(n)',
      optimalTimeComplexity: 'O(n)',
      optimalSpaceComplexity: 'O(n)'
    },
    performance: {
      execAvgMs: 1.2,
      execBaselineMs: 1.0,
      memPeakMb: 8,
      memBaselineMb: 6,
      tests: [
        { label: 'Base Cases', passed: true },
        { label: 'Edge Cases', passed: true },
        { label: 'Large Inputs', passed: true }
      ]
    },
    deep_quality_assessment_report: {
      methodology: 'Used a single-pass hash map to store complements. Consider pre-validating inputs.',
      readability: 'Consistent indentation, reasonably named functions. Variable naming could be clearer.',
      alternatives: 'Two-pass hash map or sorting + two pointers (O(n log n)).'
    }
  },
  'john-smith': {
    name: 'John Smith',
    problemTitle: 'Valid Anagram',
    difficulty: 'Easy',
    final_summary: {
      strengths: ['Simple and correct approach', 'Good use of language features'],
      areas_for_improvement: ['Consider using early returns', 'Add docstring'],
      text: 'Correct solution with clear logic; minor style improvements suggested.'
    },
    readability_score: 7,
    algorithm: {
      foundOptimal: true,
      efficiencyScore: 9,
      timeComplexity: 'O(n)',
      spaceComplexity: 'O(1) or O(k)',
      optimalTimeComplexity: 'O(n)',
      optimalSpaceComplexity: 'O(1)'
    },
    performance: {
      execAvgMs: 0.6,
      execBaselineMs: 0.5,
      memPeakMb: 5,
      memBaselineMb: 4,
      tests: [
        { label: 'Base Cases', passed: true },
        { label: 'Edge Cases', passed: true },
        { label: 'Large Inputs', passed: false }
      ]
    },
    deep_quality_assessment_report: {
      methodology: 'Frequency count and comparison. Could handle unicode normalization explicitly.',
      readability: 'Readable and modular; docstring missing.',
      alternatives: 'Sorting both strings to compare.'
    }
  },
  'alex-lee': {
    name: 'Alex Lee',
    problemTitle: 'LRU Cache',
    difficulty: 'Hard',
    final_summary: {
      strengths: ['Solid class design', 'Understands hashmap + DLL pattern'],
      areas_for_improvement: ['Edge case on capacity=0', 'Unit tests for eviction order'],
      text: 'Good understanding of LRU internals; minor correctness gaps under edge constraints.'
    },
    readability_score: 6,
    algorithm: {
      foundOptimal: true,
      efficiencyScore: 9,
      timeComplexity: 'O(1) average per op',
      spaceComplexity: 'O(n)',
      optimalTimeComplexity: 'O(1) average per op',
      optimalSpaceComplexity: 'O(n)'
    },
    performance: {
      execAvgMs: 2.4,
      execBaselineMs: 2.0,
      memPeakMb: 18,
      memBaselineMb: 15,
      tests: [
        { label: 'Base Cases', passed: true },
        { label: 'Edge Cases', passed: false },
        { label: 'Large Inputs', passed: true }
      ]
    },
    deep_quality_assessment_report: {
      methodology: 'Hash map + doubly-linked list with head/tail sentinels. Needs explicit null checks.',
      readability: 'Long methods; could extract helpers and improve naming.',
      alternatives: 'OrderedDict-like structures or language-native caches where allowed.'
    }
  }
};

const Gauge: React.FC<{ label: string; score: number }> = ({ label, score }) => {
  const pct = Math.max(0, Math.min(10, score)) * 10;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 160 }}>
      <div style={{ fontSize: 14, color: '#555' }}>{label}</div>
      <div style={{ height: 12, background: '#eee', borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: pct >= 70 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444' }} />
      </div>
      <div style={{ fontWeight: 600 }}>{score}/10</div>
    </div>
  );
};

const CandidateDetailPage: React.FC = () => {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const data = SAMPLE_DATA[candidateId || ''] || SAMPLE_DATA['jane-doe'];
  const [activeTab, setActiveTab] = useState<'quality' | 'performance'>('quality');
  const [isPlaybackOpen, setIsPlaybackOpen] = useState<boolean>(false);
  const playbackSample: PlaybackData = {
    language: 'python',
    initialCode: '',
    totalDurationMs: 90000,
    events: [
      { timestamp: 0, type: 'CODE_SNAPSHOT', payload: { code: '' } },
      { timestamp: 2000, type: 'CODE_SNAPSHOT', payload: { code: 'p' } },
      { timestamp: 2300, type: 'CODE_SNAPSHOT', payload: { code: 'pr' } },
      { timestamp: 2600, type: 'CODE_SNAPSHOT', payload: { code: 'pri' } },
      { timestamp: 3000, type: 'CODE_SNAPSHOT', payload: { code: 'prin' } },
      { timestamp: 3300, type: 'CODE_SNAPSHOT', payload: { code: 'print' } },
      { timestamp: 4000, type: 'CODE_SNAPSHOT', payload: { code: 'print("hi")' } },
      { timestamp: 8000, type: 'RUN', payload: {} },
      { timestamp: 12000, type: 'NOTE', payload: { text: 'Explained approach' } }
    ],
    transcripts: [
      { timestamp: 10000, speaker: 'candidate', text: 'I will use a hash map.' },
      { timestamp: 14000, speaker: 'interviewer', text: 'What is the complexity?' },
      { timestamp: 15000, speaker: 'candidate', text: 'O(n) time, O(n) space.' }
    ]
  };

  const perfChartData = useMemo(() => {
    return {
      labels: ['Execution Time (ms)', 'Memory (MB)'],
      datasets: [
        {
          label: 'Candidate',
          data: [data.performance.execAvgMs, data.performance.memPeakMb],
          backgroundColor: 'rgba(59,130,246,0.6)'
        },
        {
          label: 'Baseline',
          data: [data.performance.execBaselineMs, data.performance.memBaselineMb],
          backgroundColor: 'rgba(16,185,129,0.6)'
        }
      ]
    };
  }, [data]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Top-Level Summary Card */}
      <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>
              {data.name} - {data.problemTitle} (difficulty: {data.difficulty})
            </div>
            <div style={{ marginTop: 8, color: '#374151' }}>
              <strong>Summary:</strong> {data.final_summary.text}
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <Gauge label="Code Readability" score={data.readability_score} />
              <Gauge label="Algorithm Efficiency" score={data.algorithm.efficiencyScore} />
            </div>
            <div style={{ marginTop: 8, color: '#4b5563' }}>
              Time: {data.algorithm.timeComplexity} (optimal {data.algorithm.optimalTimeComplexity}) · Space: {data.algorithm.spaceComplexity} (optimal {data.algorithm.optimalSpaceComplexity})
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => navigate('/analytics')}>All Candidates</button>
            <button onClick={() => setIsPlaybackOpen(true)}>Open Session Playback</button>
          </div>
        </div>
      </div>

      {/* Detailed Analysis Tabs */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => setActiveTab('quality')} style={{ fontWeight: activeTab === 'quality' ? 700 : 500 }}>Code Quality Analysis</button>
        <button onClick={() => setActiveTab('performance')} style={{ fontWeight: activeTab === 'performance' ? 700 : 500 }}>Performance Metrics</button>
      </div>

      {activeTab === 'quality' ? (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff' }}>
          <h3>Problem-Solving Methodology</h3>
          <p>{data.deep_quality_assessment_report.methodology}</p>
          <h3>Readability Feedback</h3>
          <p>{data.deep_quality_assessment_report.readability}</p>
          <h3>Alternative Solutions</h3>
          <p>{data.deep_quality_assessment_report.alternatives}</p>
          <div style={{ marginTop: 12 }}>
            <h4>Strengths</h4>
            <ul>
              {data.final_summary.strengths.map((s, i) => (
                <li key={i}>✅ {s}</li>
              ))}
            </ul>
            <h4>Areas for Improvement</h4>
            <ul>
              {data.final_summary.areas_for_improvement.map((s, i) => (
                <li key={i}>🟠 {s}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: '#fff', display: 'grid', gap: 16 }}>
          <div>
            <h3>Execution Time vs Baseline</h3>
            <Bar data={perfChartData} options={{ responsive: true, plugins: { legend: { position: 'top' as const } } }} />
          </div>
          <div>
            <h3>Test Cases</h3>
            <ul style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
              {data.performance.tests.map((t, i) => (
                <li key={i} style={{ listStyle: 'none' }}>{t.passed ? '✅' : '❌'} {t.label}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
      <PlaybackModal open={isPlaybackOpen} onClose={() => setIsPlaybackOpen(false)} data={playbackSample} />
    </div>
  );
};

export default CandidateDetailPage;


