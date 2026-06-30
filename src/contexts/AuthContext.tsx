import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiClient as api, type LoginRequest, type AuthResponse } from '../lib/api';

interface User {
    id: number;
    username: string;
    role: string;
}

interface AuthContextType {
    user: User | null;
    isAuthenticated: boolean;
    login: (data: LoginRequest) => Promise<void>;
    logout: () => void;
    checkAuth: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);

    // Helper function to decode JWT and get expiry
    const getTokenExpiry = (token: string): number | null => {
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.exp ? payload.exp * 1000 : null; // Convert to milliseconds
        } catch (e) {
            console.error("Failed to decode token", e);
            return null;
        }
    };

    // Setup auto-logout on token expiry
    useEffect(() => {
        const token = localStorage.getItem('token');
        if (!token || !isAuthenticated) return;

        const expiry = getTokenExpiry(token);
        if (!expiry) return;

        const now = Date.now();
        const timeUntilExpiry = expiry - now;

        // If already expired, logout immediately
        if (timeUntilExpiry <= 0) {
            console.log("Token expired, logging out");
            logout();
            return;
        }

        // Set timeout to logout when token expires
        const timeoutId = setTimeout(() => {
            console.log("Session timeout - logging out after 12 hours");
            alert("Your session has expired. Please log in again.");
            logout();
        }, timeUntilExpiry);

        return () => clearTimeout(timeoutId);
    }, [isAuthenticated]);

    useEffect(() => {
        // Hydrate from localStorage
        const token = localStorage.getItem('token');
        const savedUser = localStorage.getItem('user');

        if (token && savedUser) {
            try {
                // Check if token is expired
                const expiry = getTokenExpiry(token);
                if (expiry && expiry < Date.now()) {
                    console.log("Token expired on load, clearing");
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    sessionStorage.clear();
                } else {
                    setUser(JSON.parse(savedUser));
                    setIsAuthenticated(true);
                    api.setToken(token);
                }
            } catch (e) {
                console.error("Failed to parse user from local storage", e);
                localStorage.removeItem('token');
                localStorage.removeItem('user');
            }
        }
        setLoading(false);
    }, []);

    const login = async (data: LoginRequest) => {
        const response = await api.login(data);
        setUser(response.user);
        setIsAuthenticated(true);
        localStorage.setItem('user', JSON.stringify(response.user));

        // Log session expiry time
        const token = localStorage.getItem('token');
        if (token) {
            const expiry = getTokenExpiry(token);
            if (expiry) {
                const expiryDate = new Date(expiry);
                console.log(`Session will expire at: ${expiryDate.toLocaleString()} (12 hours from login)`);
            }
        }
    };

    const logout = () => {
        setUser(null);
        setIsAuthenticated(false);
        api.setToken(null);
        localStorage.removeItem('user');
        localStorage.removeItem('token');

        // Clear session cache on logout
        sessionStorage.clear();
    };

    const checkAuth = () => {
        return !!localStorage.getItem('token');
    };

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, login, logout, checkAuth }}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
