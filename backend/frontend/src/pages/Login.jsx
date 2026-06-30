import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  // Redirect if already authenticated
  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      navigate('/dashboard', { replace: true });
    }
  }, [isAuthenticated, authLoading, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);
    setLoading(false);

    if (result.success) {
      navigate('/dashboard');
    } else {
      setError(result.error || 'Login failed. Please check your credentials.');
    }
  };

  return (
    <div className="min-h-screen bg-[#050b14] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-gray-800 border border-cyan-500/50 rounded-lg p-8 shadow-[0_0_20px_rgba(6,182,212,0.3)]">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-cyan-400 glow-text mb-2">
              Violation Analytics
            </h1>
            <p className="text-sm text-cyan-600 tracking-widest">
              REAL-TIME SURVEILLANCE
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-cyan-400 mb-2">
                Username
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-900 border border-cyan-500/50 rounded-lg 
                         text-cyan-100 focus:outline-none focus:border-cyan-400 
                         focus:ring-2 focus:ring-cyan-400/50 transition-all"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-cyan-400 mb-2">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full px-4 py-3 bg-gray-900 border border-cyan-500/50 rounded-lg 
                         text-cyan-100 focus:outline-none focus:border-cyan-400 
                         focus:ring-2 focus:ring-cyan-400/50 transition-all"
                placeholder="Enter password"
              />
            </div>

            {error && (
              <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-cyan-600 hover:bg-cyan-500 
                       text-white font-bold rounded-lg transition-all
                       disabled:opacity-50 disabled:cursor-not-allowed
                       shadow-[0_0_10px_rgba(6,182,212,0.5)]
                       hover:shadow-[0_0_20px_rgba(6,182,212,0.8)]"
            >
              {loading ? 'Logging in...' : 'Login'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;


