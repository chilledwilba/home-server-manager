import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  HardDrive,
  Container,
  Bell,
  Shield,
  Settings,
  Activity,
} from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
}

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/pools', icon: HardDrive, label: 'Storage Pools' },
  { to: '/containers', icon: Container, label: 'Containers' },
  { to: '/arr', icon: Activity, label: 'Arr Monitoring' },
  { to: '/alerts', icon: Bell, label: 'Alerts' },
  { to: '/security', icon: Shield, label: 'Security' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar({ isOpen }: SidebarProps) {
  if (!isOpen) return null;

  return (
    <aside className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 overflow-y-auto scrollbar-thin">
      <nav className="p-4 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`
            }
          >
            <item.icon className="w-5 h-5" />
            <span className="font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
