import { useState } from 'react';
import { Settings, User, Bell, Palette, Database, Shield, Wifi, Globe, Server, HardDrive } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { SearchCameraManager } from '@/components/settings/SearchCameraManager';

type SettingsTab = 'general' | 'account' | 'notifications' | 'appearance' | 'system' | 'security';

/**
 * Settings Page - application configuration and preferences
 * Features:
 * - User account settings
 * - System configuration
 * - Notification preferences
 * - Theme and appearance
 * - Security settings
 * - Database management
 */
export function SettingsPage() {
  const { theme, setTheme, themeFamily, setThemeFamily } = useTheme();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');

  const tabs = [
    { id: 'general' as const, label: 'General', icon: Settings },
    { id: 'account' as const, label: 'Account', icon: User },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'appearance' as const, label: 'Appearance', icon: Palette },
    { id: 'system' as const, label: 'System', icon: Server },
    { id: 'security' as const, label: 'Security', icon: Shield },
  ];

  return (
    <div className="h-full overflow-y-auto">
      {/* Header */}
      <div className={cn(
        "sticky top-0 z-10 backdrop-blur-sm border-b",
        theme === 'light'
          ? 'bg-white/90 border-gray-200'
          : 'bg-gray-900/90 border-white/10'
      )}>
        <div className="p-6">
          <div className="flex items-center gap-3">
            <Settings className={cn("w-7 h-7", theme === 'light' ? 'text-amber-600' : 'text-amber-400')} />
            <div>
              <h1 className={cn("text-2xl font-bold", theme === 'light' ? 'text-gray-900' : 'text-white')}>
                Settings
              </h1>
              <p className={cn("text-sm mt-1", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                Manage your application preferences and configuration
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100%-120px)]">
        {/* Sidebar */}
        <div className={cn(
          "w-64 border-r p-4",
          theme === 'light' ? 'bg-gray-50 border-gray-200' : 'bg-gray-900/50 border-white/5'
        )}>
          <nav className="space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left",
                    isActive
                      ? theme === 'light'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-amber-500/20 text-amber-400'
                      : theme === 'light'
                        ? 'text-gray-700 hover:bg-gray-200'
                        : 'text-gray-400 hover:bg-white/5'
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl space-y-6">
            {activeTab === 'general' && (
              <>
                <div>
                  <h2 className={cn("text-xl font-semibold mb-1", theme === 'light' ? 'text-gray-900' : 'text-white')}>
                    General Settings
                  </h2>
                  <p className={cn("text-sm", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                    Basic application configuration
                  </p>
                </div>

                <Card className={cn("p-6", theme === 'light' ? 'bg-white' : 'glass')}>
                  <div className="space-y-4">
                    <div>
                      <Label>System Name</Label>
                      <Input defaultValue="IRIS - Integrated Realtime Intelligence System" className="mt-2" />
                    </div>
                    <div>
                      <Label>Time Zone</Label>
                      <select className={cn(
                        "w-full px-3 py-2 rounded-md border mt-2",
                        theme === 'light'
                          ? 'bg-white border-gray-300'
                          : 'bg-white/5 border-white/10 text-gray-300'
                      )}>
                        <option>Asia/Kolkata (IST)</option>
                        <option>UTC</option>
                      </select>
                    </div>
                    <div>
                      <Label>Date Format</Label>
                      <select className={cn(
                        "w-full px-3 py-2 rounded-md border mt-2",
                        theme === 'light'
                          ? 'bg-white border-gray-300'
                          : 'bg-white/5 border-white/10 text-gray-300'
                      )}>
                        <option>DD/MM/YYYY</option>
                        <option>MM/DD/YYYY</option>
                        <option>YYYY-MM-DD</option>
                      </select>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {activeTab === 'account' && (
              <>
                <div>
                  <h2 className={cn("text-xl font-semibold mb-1", theme === 'light' ? 'text-gray-900' : 'text-white')}>
                    Account Settings
                  </h2>
                  <p className={cn("text-sm", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                    Manage your user account and profile
                  </p>
                </div>

                <Card className={cn("p-6", theme === 'light' ? 'bg-white' : 'glass')}>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4 pb-4 border-b border-white/10">
                      <div className="w-16 h-16 rounded-full bg-amber-500/20 flex items-center justify-center">
                        <User className="w-8 h-8 text-amber-500" />
                      </div>
                      <div>
                        <div className={cn("font-semibold", theme === 'light' ? 'text-gray-900' : 'text-white')}>
                          {user?.username || 'User'}
                        </div>
                        <div className={cn("text-sm", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                          Administrator
                        </div>
                      </div>
                    </div>
                    <div>
                      <Label>Username</Label>
                      <Input value={user?.username || ''} disabled className="mt-2" />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input type="email" placeholder="admin@iris.local" className="mt-2" />
                    </div>
                    <div className="pt-4">
                      <Button variant="outline">Change Password</Button>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {activeTab === 'notifications' && (
              <>
                <div>
                  <h2 className={cn("text-xl font-semibold mb-1", theme === 'light' ? 'text-gray-900' : 'text-white')}>
                    Notification Preferences
                  </h2>
                  <p className={cn("text-sm", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                    Configure alert and notification settings
                  </p>
                </div>

                <Card className={cn("p-6", theme === 'light' ? 'bg-white' : 'glass')}>
                  <div className="space-y-6">
                    {[
                      { label: 'Camera Offline Alerts', description: 'Notify when a camera goes offline' },
                      { label: 'Traffic Violations', description: 'Alert for detected violations' },
                      { label: 'System Health', description: 'Daily system health reports' },
                      { label: 'High Traffic Alerts', description: 'Notify when traffic exceeds threshold' },
                    ].map((item) => (
                      <div key={item.label} className="flex items-center justify-between">
                        <div>
                          <div className={cn("font-medium", theme === 'light' ? 'text-gray-900' : 'text-white')}>
                            {item.label}
                          </div>
                          <div className={cn("text-sm", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                            {item.description}
                          </div>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" defaultChecked />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 dark:peer-focus:ring-amber-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-amber-600"></div>
                        </label>
                      </div>
                    ))}
                  </div>
                </Card>
              </>
            )}

            {activeTab === 'appearance' && (
              <>
                <div>
                  <h2 className={cn("text-xl font-semibold mb-1", theme === 'light' ? 'text-gray-900' : 'text-white')}>
                    Appearance
                  </h2>
                  <p className={cn("text-sm", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                    Customize the look and feel of the application
                  </p>
                </div>

                <Card className={cn("p-6", theme === 'light' ? 'bg-white' : 'glass')}>
                  <div className="space-y-6">
                    <div>
                      <Label className="mb-4 block">Theme</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setTheme('light')}
                          className={cn(
                            "p-6 rounded-lg border-2 transition-all",
                            theme === 'light'
                              ? 'border-amber-500 bg-amber-50'
                              : 'border-gray-300 bg-white hover:border-gray-400'
                          )}
                        >
                          <div className="text-center">
                            <div className="text-4xl mb-2">☀️</div>
                            <div className="font-medium text-gray-900">Light</div>
                            {theme === 'light' && (
                              <Badge className="mt-2 bg-amber-500">Active</Badge>
                            )}
                          </div>
                        </button>
                        <button
                          onClick={() => setTheme('dark')}
                          className={cn(
                            "p-6 rounded-lg border-2 transition-all",
                            theme === 'dark'
                              ? 'border-amber-500 bg-amber-500/10'
                              : theme === 'light'
                                ? 'border-gray-300 bg-gray-900 hover:border-gray-600'
                                : 'border-white/20 bg-gray-900 hover:border-white/30'
                          )}
                        >
                          <div className="text-center">
                            <div className="text-4xl mb-2">🌙</div>
                            <div className={cn("font-medium", theme === 'light' ? 'text-white' : 'text-white')}>Dark</div>
                            {theme === 'dark' && (
                              <Badge className="mt-2 bg-amber-500">Active</Badge>
                            )}
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* Theme family — Amber (original) vs Cyberpunk (neon blue/pink).
                        Orthogonal to light/dark: both families honor the toggle above. */}
                    <div>
                      <Label className="mb-4 block">Theme Style</Label>
                      <div className="grid grid-cols-2 gap-4">
                        <button
                          onClick={() => setThemeFamily('amber')}
                          className={cn(
                            "p-6 rounded-lg border-2 transition-all text-left",
                            themeFamily === 'amber'
                              ? 'border-amber-500 bg-amber-500/10'
                              : theme === 'light'
                                ? 'border-gray-300 bg-white hover:border-gray-400'
                                : 'border-white/20 bg-gray-900 hover:border-white/30'
                          )}
                        >
                          <div className="flex items-center gap-1.5 mb-3">
                            <span className="h-4 w-4 rounded-full" style={{ background: '#f59e0b' }} />
                            <span className="h-4 w-4 rounded-full" style={{ background: '#f97316' }} />
                            <span className={cn("h-4 w-4 rounded-full border", theme === 'light' ? 'bg-black border-gray-300' : 'bg-black border-white/20')} />
                          </div>
                          <div className={cn("font-medium", theme === 'light' ? 'text-gray-900' : 'text-white')}>Amber</div>
                          <div className={cn("text-xs mt-0.5", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                            The original IRIS command-center look
                          </div>
                          {themeFamily === 'amber' && (
                            <Badge className="mt-2 bg-amber-500">Active</Badge>
                          )}
                        </button>
                        <button
                          onClick={() => setThemeFamily('cyberpunk')}
                          className={cn(
                            "p-6 rounded-lg border-2 transition-all text-left",
                            themeFamily !== 'cyberpunk' && (theme === 'light'
                              ? 'border-gray-300 bg-white hover:border-gray-400'
                              : 'border-white/20 bg-gray-900 hover:border-white/30')
                          )}
                          style={themeFamily === 'cyberpunk'
                            ? { borderColor: '#2D7FFF', background: 'rgba(45,127,255,0.08)', boxShadow: '0 0 16px rgba(45,127,255,0.35)' }
                            : undefined}
                        >
                          <div className="flex items-center gap-1.5 mb-3">
                            <span className="h-4 w-4 rounded-full" style={{ background: '#2D7FFF' }} />
                            <span className="h-4 w-4 rounded-full" style={{ background: '#FF2D95' }} />
                            <span className="h-4 w-4 rounded-full border border-white/20" style={{ background: '#0a0614' }} />
                          </div>
                          <div className={cn("font-medium", theme === 'light' ? 'text-gray-900' : 'text-white')}>Cyberpunk</div>
                          <div className={cn("text-xs mt-0.5", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                            Electric blue + hot pink, neon glow
                          </div>
                          {themeFamily === 'cyberpunk' && (
                            <Badge className="mt-2 text-white" style={{ background: '#2D7FFF' }}>Active</Badge>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </Card>
              </>
            )}

            {activeTab === 'system' && (
              <>
                <div>
                  <h2 className={cn("text-xl font-semibold mb-1", theme === 'light' ? 'text-gray-900' : 'text-white')}>
                    System Configuration
                  </h2>
                  <p className={cn("text-sm", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                    Advanced system settings and diagnostics
                  </p>
                </div>

                <Card className={cn("p-6", theme === 'light' ? 'bg-white' : 'glass')}>
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div className={cn(
                        "p-4 rounded-lg",
                        theme === 'light' ? 'bg-gray-50' : 'bg-white/5'
                      )}>
                        <div className="flex items-center gap-2 mb-2">
                          <Database className="w-4 h-4 text-amber-500" />
                          <span className={cn("text-sm font-medium", theme === 'light' ? 'text-gray-700' : 'text-gray-300')}>
                            Database
                          </span>
                        </div>
                        <div className={cn("text-xs", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                          PostgreSQL + TimescaleDB
                        </div>
                        <Badge variant="outline" className="mt-2">Connected</Badge>
                      </div>

                      <div className={cn(
                        "p-4 rounded-lg",
                        theme === 'light' ? 'bg-gray-50' : 'bg-white/5'
                      )}>
                        <div className="flex items-center gap-2 mb-2">
                          <Wifi className="w-4 h-4 text-green-500" />
                          <span className={cn("text-sm font-medium", theme === 'light' ? 'text-gray-700' : 'text-gray-300')}>
                            NATS Server
                          </span>
                        </div>
                        <div className={cn("text-xs", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                          JetStream Enabled
                        </div>
                        <Badge variant="outline" className="mt-2">Running</Badge>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-white/10">
                      <Button variant="outline" className="mr-2">
                        <HardDrive className="w-4 h-4 mr-2" />
                        Database Backup
                      </Button>
                      <Button variant="outline">
                        <Globe className="w-4 h-4 mr-2" />
                        Network Diagnostics
                      </Button>
                    </div>
                  </div>
                </Card>

                <SearchCameraManager />
              </>
            )}

            {activeTab === 'security' && (
              <>
                <div>
                  <h2 className={cn("text-xl font-semibold mb-1", theme === 'light' ? 'text-gray-900' : 'text-white')}>
                    Security Settings
                  </h2>
                  <p className={cn("text-sm", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                    Manage security and access control
                  </p>
                </div>

                <Card className={cn("p-6", theme === 'light' ? 'bg-white' : 'glass')}>
                  <div className="space-y-6">
                    <div>
                      <Label>Session Timeout (minutes)</Label>
                      <Input type="number" defaultValue="1440" className="mt-2" />
                    </div>
                    <div>
                      <Label>Require 2FA</Label>
                      <div className="flex items-center gap-4 mt-2">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input type="checkbox" className="sr-only peer" />
                          <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-amber-300 dark:peer-focus:ring-amber-800 rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-amber-600"></div>
                        </label>
                        <span className={cn("text-sm", theme === 'light' ? 'text-gray-600' : 'text-gray-400')}>
                          Require two-factor authentication
                        </span>
                      </div>
                    </div>
                    <div className="pt-4">
                      <Button variant="outline">View Audit Logs</Button>
                    </div>
                  </div>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
