import React from 'react';
import { Link } from 'react-router-dom';

const sampleCandidates = [
  { id: 'jane-doe', name: 'Jane Doe', problem: 'Two Sum', difficulty: 'Medium' },
  { id: 'john-smith', name: 'John Smith', problem: 'Valid Anagram', difficulty: 'Easy' },
  { id: 'alex-lee', name: 'Alex Lee', problem: 'LRU Cache', difficulty: 'Hard' }
];

const CandidateListPage: React.FC = () => {
  return (
    <div>
      <h2>All Candidates</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
        {sampleCandidates.map(c => (
          <Link key={c.id} to={`/analytics/${c.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ border: '1px solid #e0e0e0', borderRadius: 8, padding: 16, background: '#fff' }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>{c.name}</div>
              <div style={{ marginTop: 4 }}>
                <span style={{ color: '#666' }}>{c.problem}</span> · <span>{c.difficulty}</span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
};

export default CandidateListPage;


