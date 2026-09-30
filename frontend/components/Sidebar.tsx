
import React, { useCallback } from 'react';
import { UserRole, ProjectStatus } from '../types';
import { useStore } from '../store';
import { 
  LayoutDashboard, 
  FileText, 
  LogOut, 
  GraduationCap, 
  BookOpen, 
  Users,
  ShieldCheck,
  ShieldAlert,
  Lightbulb,
  MessageSquare,
  Home,
  BrainCircuit,
  TrendingUp,
  BarChart3,
  Settings,
  UserCog,
  Moon,
  Sun,
  X,
  Sparkles
  ,FlaskConical, Database, FileBarChart, Download, ClipboardCheck
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

interface SidebarProps {
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onClose }) => {
  const { currentUser, logout, messages, projects, theme, toggleTheme } = useStore();
  const location = useLocation();

  if (!currentUser) return null;

  const isActive = (path: string) => {
    if (path === '/admin') return location.pathname === '/admin';
    if (path === '/student') return location.pathname === '/student';
    if (path === '/supervisor') return location.pathname === '/supervisor';
    return location.pathname.startsWith(path);
  };

  const unreadCount = messages.filter(m => m.receiverId === currentUser.id && !m.read).length;

  const myProject = currentUser.role === UserRole.STUDENT 
    ? projects.filter(p => p.studentId === currentUser.id).sort((a,b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime())[0]
    : null;

  const getStatusColor = (status: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.APPROVED: return 'bg-green-500';
      case ProjectStatus.REJECTED: return 'bg-red-500';
      case ProjectStatus.CHANGES_REQUESTED: return 'bg-orange-500';
      case ProjectStatus.UNDER_REVIEW: return 'bg-blue-500';
      default: return 'bg-slate-300';
    }
  };

  const NavItem = ({ path, icon: Icon, label, badge, statusDot }: { path: string, icon: any, label: string, badge?: number, statusDot?: boolean }) => (
    <Link
      to={path}
      onClick={() => onClose && onClose()}
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-all group ${
        isActive(path) 
          ? 'bg-blue-600 text-white shadow-md' 
          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
      }`}
    >
      <div className="flex items-center gap-3">
        <Icon size={20} />
        <span className="font-medium">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {statusDot && myProject && (
           <span className={`w-2.5 h-2.5 rounded-full ${getStatusColor(myProject.status)}`}></span>
        )}
        {badge ? (
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${isActive(path) ? 'bg-white text-blue-600' : 'bg-red-500 text-white'}`}>
            {badge}
          </span>
        ) : null}
      </div>
    </Link>
  );

  return (
    <div className="w-64 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 h-screen flex flex-col shadow-xl">
      <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
        <div>
           <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-bold text-xl">
            <GraduationCap className="w-8 h-8" />
            <span>GPMS</span>
          </div>
        </div>
        {onClose && (
          <button onClick={onClose} className="md:hidden text-slate-400 hover:text-red-500">
            <X size={24} />
          </button>
        )}
      </div>

      <div className="px-6 py-4 flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center text-blue-600 dark:text-blue-300 font-bold">
          {currentUser.name.charAt(0)}
        </div>
        <div className="overflow-hidden">
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{currentUser.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{currentUser.role.toLowerCase()}</p>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {currentUser.role === UserRole.STUDENT && (
          <>
            <NavItem path="/student" icon={Home} label="Home" statusDot={true} />
            <NavItem path="/student/ideas" icon={Lightbulb} label="Idea Generator" />
            <NavItem path="/guidelines" icon={FileText} label="Guidelines" />
            <NavItem path="/repository" icon={BookOpen} label="Past Projects" />
            <NavItem path="/chat" icon={MessageSquare} label="Messages" badge={unreadCount > 0 ? unreadCount : undefined} />
            <NavItem path="/student/submit" icon={FileText} label="Submit Proposal" />
          </>
        )}

        {currentUser.role === UserRole.SUPERVISOR && (
          <>
            <NavItem path="/supervisor" icon={LayoutDashboard} label="Dashboard" />
            <NavItem path="/supervisor/students" icon={Users} label="My Students" />
            <NavItem path="/supervisor/reviews" icon={ShieldCheck} label="Project Reviews" />
            <NavItem path="/supervisor/profile" icon={UserCog} label="My Profile" />
            <NavItem path="/guidelines" icon={FileText} label="Guidelines" />
            <NavItem path="/repository" icon={BookOpen} label="Archive" />
            <NavItem path="/chat" icon={MessageSquare} label="Messages" badge={unreadCount > 0 ? unreadCount : undefined} />
          </>
        )}

        {currentUser.role === UserRole.ADMIN && (
          <>
            <div className="px-4 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Dashboard</div>
            <NavItem path="/admin" icon={LayoutDashboard} label="Overview" />
            <NavItem path="/admin/assignments" icon={BrainCircuit} label="AI Assignments" />
            <NavItem path="/admin/reports" icon={TrendingUp} label="Reports & Ranking" />
            <NavItem path="/admin/supervisor-model-evaluation" icon={ClipboardCheck} label="Supervisor Evaluation" />
            <NavItem path="/admin/research/annotations" icon={ClipboardCheck} label="Similarity Evaluation" />
            <NavItem path="/admin/similarity-results" icon={ShieldAlert} label="Similarity Results" />
            <div className="px-4 py-2 mt-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Research</div>
            <NavItem path="/admin/research/dataset" icon={Database} label="Research Dataset" />
            <NavItem path="/admin/research/import-results" icon={Download} label="Import Results" />
            <NavItem path="/admin/research/test-users" icon={UserCog} label="Test Users" />
            <NavItem path="/admin/research/supervisor-profiles" icon={Users} label="Supervisor Profiles" />
            <NavItem path="/admin/research/similarity-experiments" icon={BrainCircuit} label="Similarity Experiments" />
            <NavItem path="/admin/research/similarity-results" icon={ShieldAlert} label="Pair Results" />
            <NavItem path="/admin/research/supervisor-experiments" icon={FlaskConical} label="Supervisor Experiments" />
            <NavItem path="/admin/research/supervisor-recommendations" icon={Users} label="Recommendations" />
            <NavItem path="/admin/research/model-comparison" icon={BarChart3} label="Model Comparison" />
            <NavItem path="/admin/research/visualizations" icon={FileBarChart} label="Visualizations" />
            <NavItem path="/admin/research/reports" icon={Download} label="Generated Reports" />
            <NavItem path="/admin/research/activity-logs" icon={FileText} label="Activity Logs" />
            
            <div className="px-4 py-2 mt-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Management</div>
            <NavItem path="/admin/ideas" icon={Sparkles} label="Strategic Ideas" />
            <NavItem path="/admin/users" icon={UserCog} label="User Management" />
            <NavItem path="/admin/repository" icon={BookOpen} label="Repository" />
            <NavItem path="/admin/settings" icon={Settings} label="System Settings" />
          </>
        )}
      </nav>

      <div className="p-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center justify-between px-4 py-3 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          <div className="flex items-center gap-3">
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
            <span className="font-medium">{theme === 'light' ? 'Dark Mode' : 'Light Mode'}</span>
          </div>
          <div className={`w-10 h-5 rounded-full relative transition-colors ${theme === 'dark' ? 'bg-blue-600' : 'bg-slate-300'}`}>
            <div className={`absolute top-1 left-1 w-3 h-3 bg-white rounded-full transition-transform ${theme === 'dark' ? 'translate-x-5' : ''}`}></div>
          </div>
        </button>

        <button 
          type="button"
          onClick={() => logout()}
          className="w-full flex items-center gap-3 px-4 py-3 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <LogOut size={20} />
          <span className="font-medium">Sign Out</span>
        </button>
      </div>
    </div>
  );
};
