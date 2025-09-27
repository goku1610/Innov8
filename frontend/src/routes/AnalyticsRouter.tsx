import React from 'react';
import { Outlet, RouteObject, Link, Routes, Route, useNavigate } from 'react-router-dom';
import CandidateListPage from '../views/analytics/CandidateListPage';
import CandidateDetailPage from '../views/analytics/CandidateDetailPage';

const AnalyticsLayout: React.FC = () => {
  const navigate = useNavigate();
  return (
    <div className="analytics-app">
      <header className="app-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1>Candidate Analytics</h1>
        <div>
          <button onClick={() => navigate('/')}>Back to IDE</button>
        </div>
      </header>
      <main style={{ padding: '16px' }}>
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


