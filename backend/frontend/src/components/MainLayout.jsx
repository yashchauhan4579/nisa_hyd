import React, { useState } from 'react';
import { useNavigate, useLocation, Routes, Route, Navigate } from 'react-router-dom';
import { LayoutDashboard, BarChart2, Menu, Settings as SettingsIcon, AlertTriangle, LogOut, Users } from 'lucide-react';
import Dashboard from '../pages/Dashboard';
import Analytics from '../pages/Analytics';
import Settings from '../pages/Settings';
import Violations from '../pages/Violations';
import UserManagement from '../pages/UserManagement';
import AdminRoute from './AdminRoute';
import { useAuth } from '../context/AuthContext';

function MainLayout() {
  const [isExpanded, setIsExpanded] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();
  const { logout, isAdmin } = useAuth();

  // Determine active tab from route
  const activeTab = location.pathname === '/' || location.pathname === '/dashboard' ? 'dashboard' :
    location.pathname === '/analytics' ? 'analytics' :
      location.pathname === '/violations' ? 'violations' :
        location.pathname === '/settings' ? 'settings' :
          location.pathname === '/users' ? 'users' : 'dashboard';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen bg-gray-900 text-white overflow-hidden relative">
      {/* Sidebar */}
      <div className={`${isExpanded ? 'w-64' : 'w-20'} bg-gray-800 border-r border-gray-700 flex flex-col transition-all duration-300`}>
        <div className={`p-6 border-b border-gray-700 flex ${isExpanded ? 'justify-between' : 'justify-center'} items-center h-20`}>
          {isExpanded ? (
            <div>
              <h1 className="text-xl font-bold tracking-wider text-cyan-500">Violation Analytics</h1>
              <p className="text-xs text-cyan-800 mt-1 tracking-widest">REAL-TIME SURVEILLANCE</p>
            </div>
          ) : (
            <div className="text-cyan-500 font-bold text-xl">VA</div>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <button
            onClick={() => navigate('/dashboard')}
            className={`w-full flex items-center ${isExpanded ? 'space-x-3 px-4' : 'justify-center px-2'} py-3 rounded-r-lg transition-all duration-300 ${activeTab === 'dashboard'
              ? 'bg-cyan-950 text-cyan-50 border-l-4 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]'
              : 'text-cyan-600 hover:text-cyan-100 hover:bg-cyan-900/40'
              }`}
            title={!isExpanded ? "Dashboard" : ""}
          >
            <LayoutDashboard size={20} className={activeTab === 'dashboard' ? 'text-cyan-400' : ''} />
            {isExpanded && <span className={`tracking-wide ${activeTab === 'dashboard' ? 'font-bold' : 'font-medium'}`}>Dashboard</span>}
          </button>

          <button
            onClick={() => navigate('/settings')}
            className={`w-full flex items-center ${isExpanded ? 'space-x-3 px-4' : 'justify-center px-2'} py-3 rounded-r-lg transition-all duration-300 ${activeTab === 'settings'
              ? 'bg-cyan-950 text-cyan-50 border-l-4 border-cyan-400 shadow-[0_0_20px_rgba(34,211,238,0.4)]'
              : 'text-cyan-600 hover:text-cyan-100 hover:bg-cyan-900/40'
              }`}
            title={!isExpanded ? "Settings" : ""}
          >
            <SettingsIcon size={20} className={activeTab === 'settings' ? 'text-cyan-400' : ''} />
            {isExpanded && <span className={`tracking-wide ${activeTab === 'settings' ? 'font-bold' : 'font-medium'}`}>Settings</span>}
          </button>
        </nav>

        {/* Bottom Toggle, Logout & Version */}
        <div className={`p-4 border-t border-gray-700 flex flex-col ${isExpanded ? 'items-stretch' : 'items-center'} space-y-2`}>
          <button
            onClick={handleLogout}
            className={`w-full flex items-center ${isExpanded ? 'space-x-3 px-4' : 'justify-center px-2'} py-3 rounded-lg transition-all duration-300 text-red-400 hover:text-red-300 hover:bg-red-900/40`}
            title={!isExpanded ? "Logout" : ""}
          >
            <LogOut size={20} />
            {isExpanded && <span className="tracking-wide font-medium">Logout</span>}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 text-cyan-500 hover:text-cyan-100 hover:bg-cyan-900/50 rounded-lg transition-all border border-cyan-500/50 hover:border-cyan-400 hover:shadow-[0_0_10px_rgba(34,211,238,0.3)]"
            title={isExpanded ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            <Menu size={20} />
          </button>
          {isExpanded && (
            <div className="text-xs text-gray-500 text-center">
              v1.0.0
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 bg-gray-900 relative flex flex-col">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/violations" element={<Violations />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
        </Routes>
      </div>
    </div>
  );
}

export default MainLayout;


