import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { 
  Badge, 
  StatCard, 
  SearchInput, 
  Select, 
  Progress,
  Tooltip 
} from '../../components/ui';
import '../../analytics.css';

interface Candidate {
  id: string;
  name: string;
  problem: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  score: number; // Overall score 0-100
  codeQuality: number; // 0-10
  performance: number; // 0-10
  completionTime: number; // minutes
  testsPassed: number;
  totalTests: number;
  lastInterview: string;
  status: 'completed' | 'in-progress' | 'scheduled';
}

const sampleCandidates: Candidate[] = [
  { 
    id: 'jane-doe', 
    name: 'Jane Doe', 
    problem: 'Two Sum', 
    difficulty: 'Medium',
    score: 85,
    codeQuality: 8,
    performance: 9,
    completionTime: 25,
    testsPassed: 8,
    totalTests: 10,
    lastInterview: '2024-01-15',
    status: 'completed'
  },
  { 
    id: 'john-smith', 
    name: 'John Smith', 
    problem: 'Valid Anagram', 
    difficulty: 'Easy',
    score: 92,
    codeQuality: 7,
    performance: 10,
    completionTime: 18,
    testsPassed: 10,
    totalTests: 10,
    lastInterview: '2024-01-14',
    status: 'completed'
  },
  { 
    id: 'alex-lee', 
    name: 'Alex Lee', 
    problem: 'LRU Cache', 
    difficulty: 'Hard',
    score: 72,
    codeQuality: 6,
    performance: 8,
    completionTime: 45,
    testsPassed: 6,
    totalTests: 10,
    lastInterview: '2024-01-16',
    status: 'in-progress'
  },
  {
    id: 'sarah-chen',
    name: 'Sarah Chen',
    problem: 'Binary Tree Traversal',
    difficulty: 'Medium',
    score: 88,
    codeQuality: 9,
    performance: 8,
    completionTime: 30,
    testsPassed: 9,
    totalTests: 10,
    lastInterview: '2024-01-17',
    status: 'completed'
  },
  {
    id: 'mike-wilson',
    name: 'Mike Wilson',
    problem: 'Merge Sort',
    difficulty: 'Hard',
    score: 95,
    codeQuality: 10,
    performance: 9,
    completionTime: 35,
    testsPassed: 10,
    totalTests: 10,
    lastInterview: '2024-01-18',
    status: 'completed'
  }
];

const CandidateListPage: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [difficultyFilter, setDifficultyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sortBy, setSortBy] = useState('score');

  // Statistics
  const stats = useMemo(() => {
    const completed = sampleCandidates.filter(c => c.status === 'completed');
    const averageScore = completed.reduce((acc, c) => acc + c.score, 0) / completed.length || 0;
    const passRate = completed.filter(c => c.testsPassed === c.totalTests).length / completed.length * 100 || 0;
    
    return {
      totalCandidates: sampleCandidates.length,
      completedInterviews: completed.length,
      averageScore: Math.round(averageScore),
      passRate: Math.round(passRate),
      inProgress: sampleCandidates.filter(c => c.status === 'in-progress').length
    };
  }, []);

  // Filtered and sorted candidates
  const filteredCandidates = useMemo(() => {
    let filtered = sampleCandidates.filter(candidate => {
      const matchesSearch = candidate.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          candidate.problem.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesDifficulty = !difficultyFilter || candidate.difficulty === difficultyFilter;
      const matchesStatus = !statusFilter || candidate.status === statusFilter;
      
      return matchesSearch && matchesDifficulty && matchesStatus;
    });

    // Sort candidates
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'score':
          return b.score - a.score;
        case 'date':
          return new Date(b.lastInterview).getTime() - new Date(a.lastInterview).getTime();
        case 'completion':
          return a.completionTime - b.completionTime;
        default:
          return 0;
      }
    });

    return filtered;
  }, [searchTerm, difficultyFilter, statusFilter, sortBy]);

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'Easy': return 'success';
      case 'Medium': return 'warning';
      case 'Hard': return 'error';
      default: return 'gray';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'success';
      case 'in-progress': return 'warning';
      case 'scheduled': return 'primary';
      default: return 'gray';
    }
  };

  return (
    <div className="analytics-main fade-in">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Candidate Analytics</h1>
          <p className="text-gray-600 mt-1">Review and analyze interview performance data</p>
        </div>
      </div>

      {/* Statistics Overview */}
      <div className="stats-grid">
        <StatCard
          label="Total Candidates"
          value={stats.totalCandidates}
          icon="👥"
        />
        <StatCard
          label="Completed Interviews"
          value={stats.completedInterviews}
          icon="✅"
          change={{ value: "+2 this week", positive: true }}
        />
        <StatCard
          label="Average Score"
          value={`${stats.averageScore}%`}
          icon="📊"
          change={{ value: "+5% vs last month", positive: true }}
        />
        <StatCard
          label="Test Pass Rate"
          value={`${stats.passRate}%`}
          icon="🎯"
        />
        <StatCard
          label="In Progress"
          value={stats.inProgress}
          icon="⏳"
        />
      </div>

      {/* Search and Filters */}
      <div className="search-filter-bar">
        <SearchInput
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search candidates or problems..."
          className="flex-1"
        />
        
        <Select
          value={difficultyFilter}
          onChange={setDifficultyFilter}
          options={[
            { value: 'Easy', label: 'Easy' },
            { value: 'Medium', label: 'Medium' },
            { value: 'Hard', label: 'Hard' }
          ]}
          placeholder="All Difficulties"
        />
        
        <Select
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'completed', label: 'Completed' },
            { value: 'in-progress', label: 'In Progress' },
            { value: 'scheduled', label: 'Scheduled' }
          ]}
          placeholder="All Status"
        />
        
        <Select
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: 'score', label: 'Sort by Score' },
            { value: 'name', label: 'Sort by Name' },
            { value: 'date', label: 'Sort by Date' },
            { value: 'completion', label: 'Sort by Time' }
          ]}
          placeholder="Sort by..."
        />
      </div>

      {/* Results Count */}
      <div className="mb-4 text-sm text-gray-600">
        Showing {filteredCandidates.length} of {sampleCandidates.length} candidates
      </div>

      {/* Candidate Grid */}
      <div className="grid grid-auto-fill">
        {filteredCandidates.map(candidate => (
          <Link 
            key={candidate.id} 
            to={`/analytics/${candidate.id}`} 
            className="candidate-card slide-in"
          >
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="candidate-name">{candidate.name}</h3>
                <p className="candidate-problem">{candidate.problem}</p>
              </div>
              <div className="flex gap-2 flex-col items-end">
                <Badge variant={getDifficultyColor(candidate.difficulty)}>
                  {candidate.difficulty}
                </Badge>
                <Badge variant={getStatusColor(candidate.status)} size="sm">
                  {candidate.status}
                </Badge>
              </div>
            </div>

            {/* Score Progress */}
            <div className="mb-4">
              <Progress 
                value={candidate.score} 
                label="Overall Score"
                showValue
                variant={candidate.score >= 80 ? 'success' : candidate.score >= 60 ? 'warning' : 'error'}
              />
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Tooltip content={`Code quality score: ${candidate.codeQuality}/10`}>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="text-lg font-bold text-gray-900">{candidate.codeQuality}/10</div>
                  <div className="text-xs text-gray-600">Code Quality</div>
                </div>
              </Tooltip>
              
              <Tooltip content={`Performance score: ${candidate.performance}/10`}>
                <div className="text-center p-2 bg-gray-50 rounded-lg">
                  <div className="text-lg font-bold text-gray-900">{candidate.performance}/10</div>
                  <div className="text-xs text-gray-600">Performance</div>
                </div>
              </Tooltip>
            </div>

            {/* Footer Info */}
            <div className="candidate-metrics">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <span>⏱️ {candidate.completionTime}min</span>
                <span>•</span>
                <span>
                  {candidate.testsPassed}/{candidate.totalTests} tests
                </span>
              </div>
              
              <div className="candidate-score">
                <span className={`
                  px-2 py-1 rounded-full text-xs font-semibold
                  ${candidate.score >= 80 ? 'bg-green-100 text-green-800' : 
                    candidate.score >= 60 ? 'bg-yellow-100 text-yellow-800' : 
                    'bg-red-100 text-red-800'}
                `}>
                  {candidate.score}%
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Empty State */}
      {filteredCandidates.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No candidates found</h3>
          <p className="text-gray-600">Try adjusting your search criteria or filters.</p>
        </div>
      )}
    </div>
  );
};

export default CandidateListPage;


