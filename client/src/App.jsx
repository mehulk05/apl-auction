import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import { useAuction } from './lib/auction.jsx';
import Nav from './components/Nav.jsx';
import PasswordGate from './components/PasswordGate.jsx';
import { Toasts } from './components/ui.jsx';
import LiveAuction from './pages/LiveAuction.jsx';
import Players from './pages/Players.jsx';
import Teams from './pages/Teams.jsx';
import TeamDetail from './pages/TeamDetail.jsx';
import GroupSquads from './pages/GroupSquads.jsx';
import Sold from './pages/Sold.jsx';
import Unsold from './pages/Unsold.jsx';
import History from './pages/History.jsx';
import AdminSettings from './pages/AdminSettings.jsx';
import Display from './pages/Display.jsx';

export default function App() {
  const { snapshot } = useAuction();
  const loc = useLocation();
  const bare = loc.pathname === '/display' || loc.pathname === '/watch';

  if (!snapshot) {
    return (
      <div className="app">
        <div className="empty" style={{ paddingTop: '22vh' }}>Opening the saleroom…</div>
      </div>
    );
  }

  return (
    <div className={`app ${bare ? 'projector' : ''}`}>
      <Nav />
      <main className={`main ${bare ? '' : 'wide'}`}>
        <PasswordGate>
        <Routes>
          <Route path="/" element={<LiveAuction />} />
          <Route path="/control" element={<LiveAuction />} />
          <Route path="/bid/:teamKey" element={<LiveAuction />} />
          <Route path="/watch" element={<Display />} />
          <Route path="/players" element={<Players />} />
          <Route path="/teams" element={<Teams />} />
          <Route path="/teams/:teamId" element={<TeamDetail />} />
          <Route path="/squads" element={<GroupSquads />} />
          <Route path="/sold" element={<Sold />} />
          <Route path="/unsold" element={<Unsold />} />
          <Route path="/history" element={<History />} />
          <Route path="/admin" element={<AdminSettings />} />
          <Route path="/display" element={<Display />} />
          <Route path="*" element={<section className="card"><div className="card-body"><div className="empty">No such page.</div></div></section>} />
        </Routes>
        </PasswordGate>
      </main>
      <Toasts />
    </div>
  );
}
