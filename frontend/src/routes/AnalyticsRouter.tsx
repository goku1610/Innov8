import React from 'react';
import { Outlet, RouteObject, Link, Routes, Route, useNavigate } from 'react-router-dom';
import CandidateListPage from '../views/analytics/CandidateListPage';
import CandidateDetailPage from '../views/analytics/CandidateDetailPage';
import '../analytics.css';

const AnalyticsLayout: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="analytics-app">
      <header className="analytics-header">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Innovoice Analytics</h1>
            <p className="text-sm text-gray-600">Interview Performance Dashboard</p>
          </div>
          <button 
            onClick={() => navigate('/')}
            className="btn btn-secondary"
          >
            ← Back to IDE
          </button>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
};

const AnalyticsRouter: React.FC = () => {
  return (
    <Routes>
      <Route path="/" element={<AnalyticsLayout />}>
        <Route index element={<CandidateListPage />} />
        <Route path=":candidateId" element={<CandidateDetailPage />} />
      </Route>
    </Routes>
  );
};

export default AnalyticsRouter;


