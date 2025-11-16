import { Navigate, Route, BrowserRouter as Router, Routes } from 'react-router-dom';
import { Layout } from './components/Layout/Layout';
import { Alerts } from './pages/Alerts';
import { ArrMonitoring } from './pages/ArrMonitoring';
import { Containers } from './pages/Containers';
import { Dashboard } from './pages/Dashboard';
import { Pools } from './pages/Pools';
import { Security } from './pages/Security';
import { Settings } from './pages/Settings';

function App() {
  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pools" element={<Pools />} />
          <Route path="/containers" element={<Containers />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/security" element={<Security />} />
          <Route path="/arr" element={<ArrMonitoring />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
