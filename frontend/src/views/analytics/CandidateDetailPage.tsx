import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Bar, Doughnut, Line, Radar } from 'react-chartjs-2';
import PlaybackModal, { PlaybackData } from './PlaybackModal';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement,
  PointElement,
  LineElement,
  RadialLinearScale
} from 'chart.js';
import { 
  Badge, 
  Card,
  CardHeader,
  CardContent,
  Gauge, 
  Progress,
  Button,
  TabNav,
  StatCard,
  Tooltip as UITooltip
} from '../../components/ui';
import '../../analytics.css';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend, ArcElement, PointElement, LineElement, RadialLinearScale);

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
  // New fields for enhanced analytics
  codingTimeHistory?: number[]; // Time series data for coding progress
  errorRate?: number; // 0-100
  testingApproach?: 'tdd' | 'manual' | 'none';
  communicationScore?: number; // 0-10
  problemSolvingSteps?: string[];
  optimizationSteps?: string[];
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
    },
    codingTimeHistory: [0, 5, 12, 18, 25, 30, 35, 40, 42, 45],
    errorRate: 15,
    testingApproach: 'manual',
    communicationScore: 9,
    problemSolvingSteps: [
      'Understood the problem requirements',
      'Identified brute force approach first',
      'Optimized to hash map solution',
      'Tested with provided examples',
      'Explained time complexity'
    ],
    optimizationSteps: [
      'Initial O(n²) nested loops',
      'Optimized to O(n) hash map',
      'Added input validation'
    ]
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



const CandidateDetailPage: React.FC = () => {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const data = SAMPLE_DATA[candidateId || ''] || SAMPLE_DATA['jane-doe'];
  const [activeTab, setActiveTab] = useState<'overview' | 'performance' | 'quality' | 'communication'>('overview');
  const [isPlaybackOpen, setIsPlaybackOpen] = useState<boolean>(false);

  // Helper functions
  const getDifficultyVariant = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'success';
      case 'Medium': return 'warning'; 
      case 'Hard': return 'error';
      default: return 'gray';
    }
  };

  const passedTests = data.performance.tests.filter(test => test.passed).length;

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

  const skillRadarData = useMemo(() => ({
    labels: ['Problem Solving', 'Code Quality', 'Performance', 'Communication', 'Testing', 'Debugging'],
    datasets: [{
      label: 'Candidate Skills',
      data: [
        data.algorithm.efficiencyScore,
        data.readability_score,
        Math.min(10, (data.performance.execBaselineMs / data.performance.execAvgMs) * 10),
        data.communicationScore || 8,
        (passedTests / data.performance.tests.length) * 10,
        10 - (data.errorRate || 15) / 10
      ],
      backgroundColor: 'rgba(59, 130, 246, 0.2)',
      borderColor: 'rgba(59, 130, 246, 1)',
      borderWidth: 2,
      pointBackgroundColor: 'rgba(59, 130, 246, 1)',
    }]
  }), [data, passedTests]);

  const codingProgressData = useMemo(() => ({
    labels: Array.from({ length: 10 }, (_, i) => `${(i + 1) * 5}min`),
    datasets: [{
      label: 'Coding Progress',
      data: data.codingTimeHistory || [0, 10, 25, 35, 50, 65, 75, 85, 90, 100],
      borderColor: 'rgba(34, 197, 94, 1)',
      backgroundColor: 'rgba(34, 197, 94, 0.1)',
      fill: true,
      tension: 0.4,
    }]
  }), [data]);

  return (
    <div className="analytics-main fade-in">
      {/* Header with candidate info and actions */}
      <Card className="mb-6">
        <CardContent>
          <div className="flex justify-between items-start gap-6">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{data.name}</h1>
                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-gray-600">{data.problemTitle}</span>
                    <Badge variant={getDifficultyVariant(data.difficulty)}>
                      {data.difficulty}
                    </Badge>
                    <Badge variant={data.algorithm.foundOptimal ? 'success' : 'warning'}>
                      {data.algorithm.foundOptimal ? 'Optimal Solution' : 'Sub-optimal'}
                    </Badge>
                  </div>
                </div>
              </div>
              
              <p className="text-gray-700 mb-4">{data.final_summary.text}</p>
              
              <div className="flex items-center gap-6 text-sm text-gray-600">
                <span>⏱️ Time: {data.algorithm.timeComplexity}</span>
                <span>💾 Space: {data.algorithm.spaceComplexity}</span>
                <span>🎯 Optimal: {data.algorithm.optimalTimeComplexity}, {data.algorithm.optimalSpaceComplexity}</span>
              </div>
            </div>
            
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => navigate('/analytics')}>
                ← All Candidates
              </Button>
              <Button variant="primary" onClick={() => setIsPlaybackOpen(true)}>
                📹 View Session
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics Overview */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Code Quality"
          value={`${data.readability_score}/10`}
          icon="📝"
          change={{ value: "Above average", positive: data.readability_score > 6 }}
        />
        <StatCard
          label="Algorithm Score"
          value={`${data.algorithm.efficiencyScore}/10`}
          icon="⚡"
          change={{ value: "Optimal found", positive: data.algorithm.foundOptimal }}
        />
        <StatCard
          label="Communication"
          value={`${data.communicationScore || 8}/10`}
          icon="💬"
        />
        <StatCard
          label="Error Rate"
          value={`${data.errorRate || 15}%`}
          icon="🐛"
          change={{ value: "Below threshold", positive: (data.errorRate || 15) < 20 }}
        />
      </div>

      {/* Main Dashboard Grid */}
      <div className="grid grid-cols-3 gap-6 mb-6">
        {/* Performance Gauges */}
        <Card>
          <CardHeader title="Performance Scores" />
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <Gauge label="Code Quality" value={data.readability_score} />
              <Gauge label="Efficiency" value={data.algorithm.efficiencyScore} />
            </div>
          </CardContent>
        </Card>

        {/* Test Results */}
        <Card>
          <CardHeader title="Test Results" subtitle={`${passedTests}/${data.performance.tests.length} passed`} />
          <CardContent>
            <div className="space-y-3">
              {data.performance.tests.map((test, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">{test.label}</span>
                  <Badge variant={test.passed ? 'success' : 'error'} size="sm">
                    {test.passed ? '✅ Pass' : '❌ Fail'}
                  </Badge>
                </div>
              ))}
            </div>
            <Progress 
              value={(passedTests / data.performance.tests.length) * 100}
              label="Overall Test Success"
              showValue
              variant={passedTests === data.performance.tests.length ? 'success' : 'warning'}
            />
          </CardContent>
        </Card>

        {/* Problem Solving Process */}
        <Card>
          <CardHeader title="Problem Solving Steps" />
          <CardContent>
            <div className="space-y-2">
              {(data.problemSolvingSteps || []).map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-600 text-xs flex items-center justify-center font-bold mt-0.5">
                    {i + 1}
                  </div>
                  <span className="text-sm text-gray-700">{step}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Analysis Tabs */}
      <TabNav
        tabs={[
          { key: 'overview', label: 'Overview', icon: '📊' },
          { key: 'performance', label: 'Performance', icon: '⚡' },
          { key: 'quality', label: 'Code Quality', icon: '📝' },
          { key: 'communication', label: 'Communication', icon: '💬' }
        ]}
        activeTab={activeTab}
        onTabChange={(tab) => setActiveTab(tab as 'overview' | 'performance' | 'quality' | 'communication')}
      />

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-2 gap-6">
          <Card>
            <CardHeader title="Performance vs Baseline" />
            <CardContent>
              <Bar 
                data={perfChartData} 
                options={{ 
                  responsive: true, 
                  plugins: { 
                    legend: { position: 'top' as const },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          const label = context.dataset.label || '';
                          const value = context.parsed.y;
                          const unit = context.dataIndex === 0 ? 'ms' : 'MB';
                          return `${label}: ${value}${unit}`;
                        }
                      }
                    }
                  },
                  scales: {
                    y: {
                      beginAtZero: true
                    }
                  }
                }} 
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader title="Skill Assessment" />
            <CardContent>
              <Radar 
                data={skillRadarData}
                options={{
                  responsive: true,
                  plugins: {
                    legend: { position: 'top' as const }
                  },
                  scales: {
                    r: {
                      beginAtZero: true,
                      max: 10,
                      ticks: {
                        stepSize: 2
                      }
                    }
                  }
                }}
              />
            </CardContent>
          </Card>
        </div>
      )}

      {activeTab === 'performance' && (
        <div className="grid gap-6">
          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader title="Execution Metrics" />
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Execution Time</span>
                    <div className="text-right">
                      <div className="font-bold">{data.performance.execAvgMs}ms</div>
                      <div className="text-sm text-gray-500">baseline: {data.performance.execBaselineMs}ms</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Memory Usage</span>
                    <div className="text-right">
                      <div className="font-bold">{data.performance.memPeakMb}MB</div>
                      <div className="text-sm text-gray-500">baseline: {data.performance.memBaselineMb}MB</div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-700">Error Rate</span>
                    <div className="text-right">
                      <div className="font-bold">{data.errorRate || 15}%</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Coding Progress" />
              <CardContent>
                <Line
                  data={codingProgressData}
                  options={{
                    responsive: true,
                    plugins: {
                      legend: { display: false }
                    },
                    scales: {
                      x: {
                        title: {
                          display: true,
                          text: 'Time (minutes)'
                        }
                      },
                      y: {
                        title: {
                          display: true,
                          text: 'Progress %'
                        },
                        beginAtZero: true,
                        max: 100
                      }
                    }
                  }}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'quality' && (
        <div className="space-y-6">
          <Card>
            <CardHeader title="Code Quality Analysis" />
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Methodology</h4>
                  <p className="text-gray-700 text-sm">{data.deep_quality_assessment_report.methodology}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Readability</h4>
                  <p className="text-gray-700 text-sm">{data.deep_quality_assessment_report.readability}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2">Alternatives</h4>
                  <p className="text-gray-700 text-sm">{data.deep_quality_assessment_report.alternatives}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-6">
            <Card>
              <CardHeader title="Strengths" />
              <CardContent>
                <div className="space-y-2">
                  {data.final_summary.strengths.map((strength, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-green-500 text-lg">✅</span>
                      <span className="text-gray-700">{strength}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader title="Areas for Improvement" />
              <CardContent>
                <div className="space-y-2">
                  {data.final_summary.areas_for_improvement.map((area, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-orange-500 text-lg">�</span>
                      <span className="text-gray-700">{area}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {activeTab === 'communication' && (
        <Card>
          <CardHeader title="Communication Assessment" />
          <CardContent>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold mb-4">Communication Metrics</h4>
                <div className="space-y-4">
                  <Progress label="Clarity of Explanation" value={85} showValue />
                  <Progress label="Problem Understanding" value={90} showValue />
                  <Progress label="Solution Walkthrough" value={80} showValue />
                  <Progress label="Q&A Responsiveness" value={88} showValue />
                </div>
              </div>
              <div>
                <h4 className="font-semibold mb-4">Key Observations</h4>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li>• Clear articulation of approach and reasoning</li>
                  <li>• Good use of examples to explain concepts</li>
                  <li>• Proactive communication during coding</li>
                  <li>• Responded well to follow-up questions</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <PlaybackModal open={isPlaybackOpen} onClose={() => setIsPlaybackOpen(false)} data={playbackSample} />
    </div>
  );
};

export default CandidateDetailPage;


