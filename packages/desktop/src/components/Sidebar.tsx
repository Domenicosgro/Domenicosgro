import { NavLink } from 'react-router-dom';
import { FileText, Calendar, Settings, Vault } from 'lucide-react';

const navItems = [
  { to: '/documents', icon: FileText, label: 'Dokumente' },
  { to: '/deadlines', icon: Calendar, label: 'Fristen' },
  { to: '/settings', icon: Settings, label: 'Einstellungen' },
];

export function Sidebar() {
  return (
    <aside className="w-56 flex flex-col bg-slate-800 border-r border-slate-700 select-none">
      {/* Logo / title — draggable for macOS */}
      <div className="title-bar-drag flex items-center gap-2 px-4 py-5 border-b border-slate-700">
        <Vault className="w-6 h-6 text-blue-400" />
        <span className="font-bold text-white tracking-tight">DokuVault</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-1 pt-3">
        {navItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`
            }
          >
            <Icon className="w-4 h-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
