
import React, { useEffect, useState } from 'react';
import { useStore } from '../store';
import { ProjectStatus, UserRole, SupervisorRecommendation, CuratedIdea, User, ProjectProposal } from '../types';
import { recommendSupervisors } from '../services/geminiService';
import { researchAPI, similarityResultsAPI } from '../services/apiService';
import { AnnouncementsBanner } from '../components/AnnouncementsBanner';
import { departmentsForFaculty, refId } from '../utils/taxonomy';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, Radar, RadarChart, PolarGrid, PolarAngleAxis
} from 'recharts';
import { 
  Users, 
  CheckCircle, 
  AlertOctagon, 
  BrainCircuit, 
  Award, 
  UserPlus,
  Loader2,
  TrendingUp,
  Clock,
  Save,
  Calendar,
  Activity,
  Download,
  ShieldAlert,
  XCircle,
  Zap,
  Layers,
  Plus,
  Trash2,
  ListPlus,
  Settings2,
  Sparkles,
  FileText,
  BarChart3,
  GraduationCap,
  PieChart as PieChartIcon,
  Megaphone,
  BookOpen,
  Search,
  RefreshCw
} from 'lucide-react';

// --- SHARED COMPONENTS ---
const DashboardCard: React.FC<{ children?: React.ReactNode, className?: string }> = ({ children, className = "" }) => (
  <div className={`bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-colors duration-300 ${className}`}>
    {children}
  </div>
);

const StatCardAdvanced = ({ title, value, icon: Icon, trend, trendUp, colorClass, bgClass, darkBgClass }: any) => (
  <div className={`admin-dashboard-stat-card relative overflow-hidden rounded-2xl p-6 border border-slate-100 dark:border-slate-700 shadow-sm hover:shadow-md transition-all group ${bgClass} dark:${darkBgClass} dark:bg-slate-800`}>
    <div className="relative z-10 flex justify-between items-start">
      <div>
        <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">{title}</p>
        <h3 className="admin-dashboard-stat-value text-3xl font-extrabold text-slate-900 dark:text-white mt-2">{value}</h3>
        {trend && (
          <div className={`flex items-center gap-1 mt-2 text-xs font-bold ${trendUp ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            <TrendingUp size={14} className={trendUp ? '' : 'rotate-180'} />
            <span>{trend}</span>
          </div>
        )}
      </div>
      <div className={`admin-dashboard-stat-icon w-12 h-12 rounded-xl flex items-center justify-center ${colorClass} group-hover:scale-110 transition-transform`}>
        <Icon size={24} />
      </div>
    </div>
    <Icon size={100} className="admin-dashboard-stat-bg-icon absolute -right-4 -bottom-4 opacity-5 dark:opacity-10 pointer-events-none" />
  </div>
);

// --- 1. OVERVIEW PAGE ---
export const AdminOverview: React.FC = () => {
  const { projects, users, theme } = useStore();
  const databaseProjects = projects.filter(project => /^[a-f\d]{24}$/i.test(project.id || ''));
  const databaseUsers = users.filter(user => /^[a-f\d]{24}$/i.test(user.id || ''));
  const students = databaseUsers.filter(u => u.role === UserRole.STUDENT);
  const approvedProjects = databaseProjects.filter(p => p.status === ProjectStatus.APPROVED || p.status === ProjectStatus.IN_PROGRESS || p.status === ProjectStatus.COMPLETED).length;
  const pendingProjects = databaseProjects.filter(p => p.status === ProjectStatus.UNDER_REVIEW || p.status === ProjectStatus.SUBMITTED).length;
  const rejectedProjects = databaseProjects.filter(p => p.status === ProjectStatus.REJECTED).length;
  const changesRequested = databaseProjects.filter(p => p.status === ProjectStatus.CHANGES_REQUESTED).length;

  const atRiskProjects = databaseProjects.filter(p => (p.similarityRisk === 'High') || (p.status === ProjectStatus.REJECTED));
  const statusData = [
    { name: 'Accepted', value: approvedProjects, color: '#10b981' }, 
    { name: 'Pending', value: pendingProjects, color: '#f59e0b' }, 
    { name: 'Changes', value: changesRequested, color: '#6366f1' }, 
    { name: 'Rejected', value: rejectedProjects, color: '#ef4444' }, 
  ];

  const departmentCounts = new Map<string, number>();
  databaseProjects.forEach(project => {
    const student = databaseUsers.find(user => user.id === project.studentId);
    const department = student?.department || 'Unspecified';
    departmentCounts.set(department, (departmentCounts.get(department) || 0) + 1);
  });
  const deptData = Array.from(departmentCounts, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const recentActivities = [...databaseProjects]
    .sort((left, right) => new Date(right.submissionDate || 0).getTime() - new Date(left.submissionDate || 0).getTime())
    .slice(0, 3)
    .map(project => ({
      title: `${project.studentName}: ${project.title}`,
      time: project.submissionDate ? new Date(project.submissionDate).toLocaleDateString() : 'Date unavailable',
      type: project.similarityRisk === 'High' ? 'warning' : project.status === ProjectStatus.APPROVED || project.status === ProjectStatus.COMPLETED ? 'success' : 'normal',
    }));

  const RecentActivityItem = ({ title, time, type }: any) => (
    <div className="flex gap-4 items-start p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors">
      <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
        type === 'success' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : type === 'warning' ? 'bg-orange-500 shadow-[0_0_8px_rgba(249,115,22,0.6)]' : 'bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.6)]'
      }`} />
      <div>
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{title}</p>
        <p className="text-xs text-slate-400 mt-0.5">{time}</p>
      </div>
    </div>
  );

  return (
    <div className="p-4 md:p-8 space-y-8 min-h-screen animate-fade-in">
      {/* Announcements Banner */}
      <AnnouncementsBanner />
      
      <div className="relative rounded-3xl overflow-hidden bg-slate-900 dark:bg-black shadow-2xl p-8 text-white">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 opacity-80"></div>
        <div className="absolute top-0 right-0 p-12 opacity-10"><Activity size={200} /></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
           <div>
             <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md border border-white/10 text-xs font-medium mb-3">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                System Operational
             </div>
             <h1 className="text-4xl font-extrabold tracking-tight">Admin Command Center</h1>
             <p className="text-blue-200 mt-2 max-w-xl">Welcome back. You have <span className="text-white font-bold underline decoration-blue-400">{pendingProjects} pending proposals</span> requiring attention.</p>
           </div>
           <div className="flex gap-3">
              <button type="button" className="bg-white/10 hover:bg-white/20 backdrop-blur-md text-white px-5 py-2.5 rounded-xl text-sm font-bold border border-white/10 flex items-center gap-2"><Download size={18}/> Export Report</button>
              <button type="button" className="bg-blue-500 hover:bg-blue-400 text-white px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg transition-all flex items-center gap-2"><Zap size={18}/> Quick Actions</button>
           </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCardAdvanced title="Total Students" value={students.length} icon={Users} trend="+12% vs last sem" trendUp={true} bgClass="bg-white" darkBgClass="bg-slate-800" colorClass="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400" />
        <StatCardAdvanced title="Accepted Projects" value={approvedProjects} icon={CheckCircle} trend="85% Approval Rate" trendUp={true} bgClass="bg-gradient-to-br from-green-50 to-emerald-50 border-emerald-100" darkBgClass="bg-slate-800" colorClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400" />
        <StatCardAdvanced title="Pending Review" value={pendingProjects} icon={Clock} trend="Needs Attention" trendUp={false} bgClass="bg-gradient-to-br from-orange-50 to-amber-50 border-amber-100" darkBgClass="bg-slate-800" colorClass="bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400" />
        <StatCardAdvanced title="Rejected Proposals" value={rejectedProjects} icon={XCircle} trend="-5% vs last sem" trendUp={true} bgClass="bg-gradient-to-br from-red-50 to-rose-50 border-rose-100" darkBgClass="bg-slate-800" colorClass="bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          <DashboardCard className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Project Status Overview</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">Distribution of proposal decisions across the faculty.</p>
              </div>
            </div>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#f1f5f9'} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 12}} />
                  <Tooltip cursor={{fill: theme === 'dark' ? '#1e293b' : '#f8fafc'}} contentStyle={{borderRadius: '12px', border: 'none', backgroundColor: theme === 'dark' ? '#1e293b' : '#fff', color: theme === 'dark' ? '#fff' : '#000'}} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={50}>
                    {statusData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </DashboardCard>
          <div className="grid md:grid-cols-2 gap-6">
             <DashboardCard className="p-6">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-4">By Department</h3>
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={deptData} cx="50%" cy="50%" innerRadius={40} outerRadius={70} paddingAngle={5} dataKey="value">
                        <Cell fill="#3b82f6" /><Cell fill="#6366f1" /><Cell fill="#8b5cf6" />
                      </Pie>
                      <Tooltip contentStyle={{borderRadius: '8px', border: 'none', backgroundColor: theme === 'dark' ? '#1e293b' : '#fff'}} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
             </DashboardCard>
             <DashboardCard className="p-6 border-l-4 border-l-red-500">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase mb-4 flex items-center gap-2"><AlertOctagon size={16} className="text-red-500" /> Watchlist</h3>
                <div className="space-y-3 overflow-y-auto h-40 pr-2">
                  {atRiskProjects.map(p => (
                    <div key={p.id} className="flex justify-between items-center p-2 bg-red-50 dark:bg-red-900/10 rounded-lg">
                      <p className="text-xs font-bold text-slate-900 dark:text-white truncate w-32">{p.studentName}</p>
                      <button type="button" className="text-xs bg-white dark:bg-slate-700 text-red-600 px-2 py-1 rounded">Investigate</button>
                    </div>
                  ))}
                </div>
             </DashboardCard>
          </div>
        </div>
        <div className="space-y-8">
          <DashboardCard className="p-6">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2"><Activity size={20} className="text-blue-500"/> Recent Activity</h3>
            <div className="space-y-1 relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-100 dark:bg-slate-700"></div>
              {recentActivities.map(activity => <RecentActivityItem key={`${activity.title}-${activity.time}`} {...activity} />)}
              {!recentActivities.length && <p className="p-3 text-sm text-slate-400">No database activity is available.</p>}
            </div>
          </DashboardCard>
          <DashboardCard className="p-6 bg-gradient-to-br from-slate-900 to-slate-800 text-white border-none"><ShieldAlert className="text-orange-400 mb-4" size={24} /><h3 className="font-bold text-lg">System Health</h3><p className="text-slate-300 text-sm mb-6">AI Services online. Next backup 02:00 AM.</p><div className="flex items-center gap-2"><div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div><span className="text-sm font-bold text-green-400">Operational</span></div></DashboardCard>
        </div>
      </div>
    </div>
  );
};

// --- 2. ASSIGNMENTS PAGE ---
export const AdminAssignments: React.FC = () => {
  const { projects, users, updateProject, fetchProjects, fetchSupervisors } = useStore();
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);
  const [recommendations, setRecommendations] = useState<Record<string, SupervisorRecommendation[]>>({});
  const [isLoadingSupervisors, setIsLoadingSupervisors] = useState(false);
  const [selectedSupervisor, setSelectedSupervisor] = useState<User | null>(null);
  const [assigningKey, setAssigningKey] = useState<string | null>(null);
  
  // Fetch supervisors from database on component mount
  React.useEffect(() => {
    const loadSupervisors = async () => {
      setIsLoadingSupervisors(true);
      await fetchProjects();
      await fetchSupervisors();
      setIsLoadingSupervisors(false);
    };
    loadSupervisors();
  }, []);
  
  const supervisors = users.filter(u => u.role === UserRole.SUPERVISOR);
  const hasSupervisor = (project: any) => Boolean(refId(project.supervisorId));
  const isAssignableProject = (project: ProjectProposal) =>
    !hasSupervisor(project) &&
    project.status !== ProjectStatus.DRAFT &&
    project.status !== ProjectStatus.COMPLETED &&
    project.status !== ProjectStatus.REJECTED;
  const unassignedProjects = projects.filter(isAssignableProject);
  const assignedProjects = projects.filter(project => hasSupervisor(project));
  const getSupervisorLoad = (supId: string) => projects.filter(p => refId((p as any).supervisorId) === supId).length;
  const supervisorName = (supervisorId?: string) =>
    users.find(user => user.id === refId(supervisorId))?.name || 'Assigned supervisor';
  const MAX_LOAD = 5;
  
  // View supervisor details
  const handleViewSupervisor = (supervisorId: string) => {
    const supervisor = users.find(u => u.id === supervisorId);
    if (supervisor) {
      setSelectedSupervisor(supervisor);
    }
  };

  const handleAnalysis = (projectId: string) => {
    setAnalyzingId(projectId);
    const project = projects.find(p => p.id === projectId);
    if (project) {
      console.log('Starting supervisor analysis for project:', project);
      console.log('Available supervisors:', supervisors);
      
      // Use local matching algorithm (no external API)
      const results = recommendSupervisors(project, supervisors);
      console.log('Supervisor matching results:', results);
      
      if (results.length === 0) {
        console.warn('No supervisors available');
        alert('No supervisors found. Please ensure supervisors are registered with expertise.');
      }
      setRecommendations(prev => ({ ...prev, [projectId]: results }));
    }
    setAnalyzingId(null);
  };

  const handleAssign = async (projectId: string, supervisorId: string) => {
    console.log('Assign supervisor clicked', { projectId, supervisorId });
    const key = `${projectId}:${supervisorId}`;
    setAssigningKey(key);
    try {
      await updateProject(projectId, { supervisorId, status: ProjectStatus.UNDER_REVIEW });
      await fetchProjects();
      setRecommendations(prev => {
        const next = { ...prev };
        delete next[projectId];
        return next;
      });
      alert('Supervisor assigned successfully.');
    } catch (error: any) {
      alert(error?.response?.data?.message || error?.message || 'Could not assign supervisor. Please login as an admin and try again.');
    } finally {
      setAssigningKey(null);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row justify-between gap-6 mb-8">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">Supervisor Assignments</h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Match students with supervisors using intelligent analysis.</p>
          {isLoadingSupervisors && <p className="text-xs text-blue-500 mt-1">Loading supervisors from database...</p>}
          {!isLoadingSupervisors && supervisors.length === 0 && (
            <p className="text-xs text-red-500 mt-1">⚠️ No supervisors registered. Please register supervisors with expertise first.</p>
          )}
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm flex items-center gap-4 overflow-x-auto max-w-xl">
           <div className="shrink-0 font-bold text-xs text-slate-500 dark:text-slate-400 uppercase w-20">Supervisor Load</div>
           {supervisors.map(sup => (
               <div key={sup.id} className="text-center group relative">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm mb-1 ${getSupervisorLoad(sup.id) >= MAX_LOAD ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>{getSupervisorLoad(sup.id)}</div>
                  <div className="text-[10px] text-slate-500 truncate w-12">{sup.name.split(' ')[1]}</div>
               </div>
           ))}
        </div>
      </div>
      <div className="grid gap-6">
        {!isLoadingSupervisors && unassignedProjects.length === 0 && (
          <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-8 text-center shadow-sm">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">No unassigned submitted projects</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
              Loaded {projects.length} project{projects.length === 1 ? '' : 's'} from the database. Newly submitted projects without a supervisor will appear here.
            </p>
          </div>
        )}
        {unassignedProjects.map(project => (
          <div key={project.id} className="admin-assignment-project-card bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm">
            <div className="admin-assignment-card-body">
              <div className="admin-assignment-info">
                <h3 className="admin-assignment-title text-xl font-bold text-slate-900 dark:text-white">{project.title}</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Student: {project.studentName}</p>
                <div className="admin-assignment-description mt-4 bg-slate-50 dark:bg-slate-900 p-4 rounded-xl"><p className="text-slate-700 dark:text-slate-300 text-sm italic">"{project.description}"</p></div>
              </div>
              <div className="admin-assignment-ai-panel">
                {!recommendations[project.id] ? (
                  <button type="button" onClick={() => handleAnalysis(project.id)} disabled={analyzingId === project.id} className="admin-assignment-match-button w-full py-3 bg-blue-600 text-white rounded-xl font-bold flex items-center justify-center gap-2">{analyzingId === project.id ? <Loader2 className="animate-spin" /> : <BrainCircuit />} Match Supervisor</button>
                ) : (
                  <div className="space-y-3">
                    {recommendations[project.id].length === 0 ? (
                      <div className="text-center text-slate-500 dark:text-slate-400 py-4">
                        <p className="text-sm">No recommendations available.</p>
                        <button type="button" onClick={() => handleAnalysis(project.id)} className="mt-2 text-blue-600 text-xs underline">Try Again</button>
                      </div>
                    ) : (
                      recommendations[project.id].map(rec => (
                        <div 
                          key={rec.supervisorId} 
                          className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:shadow-md transition-all"
                        >
                          <div className="flex justify-between items-center mb-1">
                            <span className="font-bold text-sm dark:text-white">{rec.supervisorName}</span>
                            <span className={`font-bold text-sm px-2 py-0.5 rounded ${rec.matchScore >= 70 ? 'bg-green-100 text-green-700' : rec.matchScore >= 40 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>{rec.matchScore}%</span>
                          </div>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mb-2 line-clamp-2">{rec.reason}</p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => handleViewSupervisor(rec.supervisorId)}
                              className="py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs rounded-lg font-bold hover:border-blue-400 transition-colors"
                            >
                              View Profile
                            </button>
                            <button
                              type="button"
                              data-testid={`assign-supervisor-${project.id}-${rec.supervisorId}`}
                              disabled={assigningKey === `${project.id}:${rec.supervisorId}`}
                              onPointerDown={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                void handleAssign(project.id, rec.supervisorId);
                              }}
                              className="py-1.5 bg-slate-900 dark:bg-blue-600 text-white text-xs rounded-lg font-bold hover:bg-slate-800 dark:hover:bg-blue-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                              {assigningKey === `${project.id}:${rec.supervisorId}` ? 'Assigning...' : 'Assign Supervisor'}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {assignedProjects.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">Assigned Projects</h3>
          <div className="grid gap-3">
            {assignedProjects.map(project => (
              <div key={project.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white">{project.title}</h4>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Student: {project.studentName}</p>
                </div>
                <div className="text-left md:text-right">
                  <p className="text-sm font-bold text-blue-700 dark:text-blue-300">{supervisorName(project.supervisorId)}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 capitalize">{String(project.status).replace('_', ' ').toLowerCase()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Supervisor Detail Modal */}
      {selectedSupervisor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedSupervisor(null)}>
          <div 
            className="bg-white dark:bg-slate-800 rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 rounded-t-2xl">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center text-white text-2xl font-bold">
                  {selectedSupervisor.name.charAt(0)}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">{selectedSupervisor.name}</h2>
                  <p className="text-blue-100">{selectedSupervisor.email}</p>
                </div>
              </div>
            </div>
            
            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Department */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Department</h3>
                <p className="text-slate-900 dark:text-white font-medium">{selectedSupervisor.department || 'Not specified'}</p>
              </div>
              
              {/* CV Summary - Moved before Expertise */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">CV Summary / Experience</h3>
                {selectedSupervisor.cvSummary ? (
                  <div className="bg-gradient-to-r from-slate-50 to-blue-50 dark:from-slate-900 dark:to-blue-900/20 p-4 rounded-xl border border-slate-100 dark:border-slate-700">
                    <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">{selectedSupervisor.cvSummary}</p>
                  </div>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400 italic">No CV summary available</p>
                )}
              </div>
              
              {/* Expertise */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Areas of Expertise</h3>
                {selectedSupervisor.expertise && selectedSupervisor.expertise.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedSupervisor.expertise.map((exp, idx) => (
                      <span key={idx} className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-sm font-medium">
                        {exp}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-slate-500 dark:text-slate-400 italic">No expertise listed</p>
                )}
              </div>
              
              {/* Current Load */}
              <div>
                <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Current Workload</h3>
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${getSupervisorLoad(selectedSupervisor.id) >= MAX_LOAD ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                    {getSupervisorLoad(selectedSupervisor.id)}
                  </div>
                  <div>
                    <p className="text-slate-900 dark:text-white font-medium">{getSupervisorLoad(selectedSupervisor.id)} / {MAX_LOAD} projects</p>
                    <p className="text-xs text-slate-500">{getSupervisorLoad(selectedSupervisor.id) >= MAX_LOAD ? 'At maximum capacity' : 'Available for new projects'}</p>
                  </div>
                </div>
              </div>
              
              {/* Performance Metrics if available */}
              {selectedSupervisor.performanceMetrics && (
                <div>
                  <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Performance Metrics</h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl text-center">
                      <p className="text-2xl font-bold text-blue-600">{selectedSupervisor.performanceMetrics.projectsSupervised}</p>
                      <p className="text-[10px] text-slate-500">Projects Supervised</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl text-center">
                      <p className="text-2xl font-bold text-green-600">{selectedSupervisor.performanceMetrics.studentSatisfactionScore}</p>
                      <p className="text-[10px] text-slate-500">Satisfaction Score</p>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900 p-3 rounded-xl text-center">
                      <p className="text-2xl font-bold text-orange-600">{selectedSupervisor.performanceMetrics.avgResponseTimeHours}h</p>
                      <p className="text-[10px] text-slate-500">Avg Response</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            {/* Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-700">
              <button 
                type="button"
                onClick={() => setSelectedSupervisor(null)}
                className="w-full py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- 3. STRATEGIC IDEA MANAGEMENT PAGE ---
export const AdminStrategicIdeas: React.FC = () => {
  const { curatedIdeas, fetchCuratedIdeas, addCuratedIdeaToBackend, deleteCuratedIdeaFromBackend } = useStore();
  const [newIdea, setNewIdea] = useState<Partial<CuratedIdea>>({ title: '', description: '', difficulty: 'Medium', technologies: [], category: 'AI' });
  const categoryOptions = ['AI', 'IoT', 'Web', 'AI+IoT', 'AI+Web', 'Web+IoT', 'AI+Web+IoT', 'Security', 'Mobile', 'Data Science', 'Blockchain', 'Cloud', 'Other'];
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch ideas on component mount
  React.useEffect(() => {
    fetchCuratedIdeas();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newIdea.title && newIdea.description && !isSubmitting) {
      setIsSubmitting(true);
      try {
        await addCuratedIdeaToBackend({
          title: newIdea.title,
          description: newIdea.description,
          difficulty: (newIdea.difficulty as any) || 'Medium',
          technologies: newIdea.technologies || [],
          category: newIdea.category || 'Other'
        });
        setNewIdea({ title: '', description: '', difficulty: 'Medium', technologies: [], category: 'AI' });
      } catch (error) {
        console.error('Error adding idea:', error);
      }
      setIsSubmitting(false);
    }
  };

  const handleBulkAdd = async (e: React.MouseEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    const lines = bulkText.split('\n').filter(l => l.trim().length > 5);
    for (const line of lines) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        try {
          await addCuratedIdeaToBackend({
            title: parts[0].trim(),
            description: parts[1].trim(),
            difficulty: 'Medium',
            technologies: []
          });
        } catch (error) {
          console.error('Error adding bulk idea:', error);
        }
      }
    }
    setBulkText('');
    setBulkMode(false);
    setIsSubmitting(false);
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteCuratedIdeaFromBackend(id);
    } catch (error) {
      console.error('Error deleting idea:', error);
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-8 max-w-7xl mx-auto animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
           <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
             <Sparkles size={32} className="text-indigo-600" /> Strategic Innovation Catalog
           </h1>
           <p className="text-slate-500 dark:text-slate-400 mt-1">Seed the AI generator with university-preferred research topics and industry trends.</p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
           <div className="px-4 py-2 text-xs font-bold text-slate-500 uppercase">AI Knowledge Base</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <DashboardCard className="p-6 h-fit sticky top-8">
          <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Plus size={20} className="text-blue-500"/> {bulkMode ? 'Bulk Import' : 'New Strategic Idea'}
          </h3>
          {bulkMode ? (
            <div className="space-y-4">
                <p className="text-xs text-slate-500">Paste multiple projects. Format: "Title: Description" (one per line).</p>
                <textarea 
                  value={bulkText}
                  onChange={e => setBulkText(e.target.value)}
                  className="w-full h-64 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Smart City IoT: Using sensors to manage waste...&#10;E-Health: Telemedicine portal for remote areas..."
                />
                <div className="flex gap-2">
                  <button type="button" onClick={handleBulkAdd} className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 shadow-lg">Process Import</button>
                  <button type="button" onClick={() => setBulkMode(false)} className="px-4 py-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold">Cancel</button>
                </div>
            </div>
          ) : (
            <form onSubmit={handleAdd} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Topic Title</label>
                  <input required value={newIdea.title} onChange={e => setNewIdea({...newIdea, title: e.target.value})} className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="E.g. Somali Language NLP" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Scope & Objectives</label>
                  <textarea required value={newIdea.description} onChange={e => setNewIdea({...newIdea, description: e.target.value})} className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" rows={4} placeholder="What should students focus on?" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Category / Type</label>
                  <select 
                    value={newIdea.category} 
                    onChange={e => setNewIdea({...newIdea, category: e.target.value})} 
                    className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {categoryOptions.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-3">
                    <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"><Plus size={18}/> Add Strategic Idea</button>
                    <button type="button" onClick={() => setBulkMode(true)} className="w-full py-2.5 text-xs font-bold text-slate-500 hover:text-blue-600 transition-colors flex items-center justify-center gap-2"><ListPlus size={16}/> Bulk Data Entry</button>
                </div>
            </form>
          )}
        </DashboardCard>

        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center gap-2 px-2">
              <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">Global Seed List</span>
              <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
              <span className="text-xs bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 px-3 py-1 rounded-full font-bold">{curatedIdeas.length} Active Topics</span>
          </div>
          
          <div className="grid gap-4 max-h-[calc(100vh-200px)] overflow-y-auto no-scrollbar pb-10">
              {curatedIdeas.length === 0 ? (
                <div className="p-20 text-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400">
                  <BrainCircuit size={64} className="mx-auto mb-4 opacity-10"/>
                  <p className="font-bold text-lg">No strategic topics defined.</p>
                  <p className="text-sm mt-2">The AI Idea Generator will rely solely on its internal training data until you seed it with university priorities.</p>
                </div>
              ) : (
                curatedIdeas.map(idea => (
                  <div key={idea.id} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm flex justify-between items-start group hover:border-indigo-400 dark:hover:border-indigo-500 transition-all">
                    <div className="flex-1 pr-4">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-bold text-lg text-slate-900 dark:text-white">{idea.title}</h4>
                          {idea.category && (
                            <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-[10px] font-bold rounded-full uppercase">{idea.category}</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">{idea.description}</p>
                    </div>
                    <button type="button" onClick={() => handleDelete(idea.id)} className="p-2 text-slate-300 hover:text-red-500 transition-colors rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20">
                        <Trash2 size={20} />
                    </button>
                  </div>
                ))
              )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- GUIDELINES MANAGER COMPONENT ---
const GuidelinesManager: React.FC = () => {
  const { guidelines, addGuideline, deleteGuideline, toggleGuidelineActive, currentUser } = useStore();
  const [newGuideline, setNewGuideline] = useState({
    title: '',
    description: '',
    category: 'general' as 'research' | 'proposal' | 'submission' | 'defense' | 'general'
  });
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [viewingPdf, setViewingPdf] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleAddGuideline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuideline.title || !newGuideline.description) return;
    
    setIsSubmitting(true);
    const formData = new FormData();
    formData.append('title', newGuideline.title);
    formData.append('description', newGuideline.description);
    formData.append('category', newGuideline.category);
    formData.append('createdBy', currentUser?.name || 'Admin');
    if (pdfFile) {
      formData.append('pdf', pdfFile);
    }
    
    await addGuideline(formData);
    setNewGuideline({ title: '', description: '', category: 'general' });
    setPdfFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    setIsSubmitting(false);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'research': return 'bg-blue-100 text-blue-700';
      case 'proposal': return 'bg-green-100 text-green-700';
      case 'submission': return 'bg-yellow-100 text-yellow-700';
      case 'defense': return 'bg-purple-100 text-purple-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Create Guideline Form */}
      <DashboardCard className="p-6 h-fit lg:sticky lg:top-8">
        <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
          <Plus size={20} className="text-purple-500"/> New Guideline
        </h3>
        <form onSubmit={handleAddGuideline} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Title</label>
            <input 
              required 
              value={newGuideline.title} 
              onChange={e => setNewGuideline({...newGuideline, title: e.target.value})} 
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-purple-500 outline-none" 
              placeholder="e.g., Research Proposal Guidelines" 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Description</label>
            <textarea 
              required 
              value={newGuideline.description} 
              onChange={e => setNewGuideline({...newGuideline, description: e.target.value})} 
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-purple-500 outline-none" 
              rows={3} 
              placeholder="Brief description of this guideline..." 
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Category</label>
            <select 
              value={newGuideline.category} 
              onChange={e => setNewGuideline({...newGuideline, category: e.target.value as any})} 
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
            >
              <option value="general">General</option>
              <option value="research">Research</option>
              <option value="proposal">Proposal</option>
              <option value="submission">Submission</option>
              <option value="defense">Defense</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">PDF Document (Optional)</label>
            <input 
              ref={fileInputRef}
              type="file" 
              accept=".pdf"
              onChange={e => setPdfFile(e.target.files?.[0] || null)} 
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-bold file:bg-purple-100 file:text-purple-700 hover:file:bg-purple-200" 
            />
            {pdfFile && (
              <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                <FileText size={12} /> {pdfFile.name}
              </p>
            )}
          </div>
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold hover:bg-purple-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-purple-500/20 disabled:opacity-50"
          >
            {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18}/>} 
            {isSubmitting ? 'Uploading...' : 'Add Guideline'}
          </button>
        </form>
      </DashboardCard>

      {/* Guidelines List */}
      <div className="lg:col-span-2 space-y-4">
        <div className="flex items-center gap-2 px-2">
          <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">All Guidelines</span>
          <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
          <span className="text-xs bg-purple-100 dark:bg-purple-900/40 text-purple-600 dark:text-purple-300 px-3 py-1 rounded-full font-bold">
            {guidelines.filter(g => g.isActive).length} Active
          </span>
        </div>
        
        <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
          {guidelines.length === 0 ? (
            <div className="p-12 text-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400">
              <BookOpen size={48} className="mx-auto mb-4 opacity-20"/>
              <p className="font-bold">No guidelines yet</p>
              <p className="text-sm mt-1">Create your first guideline with PDF support.</p>
            </div>
          ) : (
            guidelines.map(guideline => (
              <div 
                key={guideline.id} 
                className={`bg-white dark:bg-slate-800 p-5 rounded-2xl border shadow-sm ${
                  guideline.isActive 
                    ? 'border-slate-200 dark:border-slate-700' 
                    : 'border-slate-100 dark:border-slate-800 opacity-60'
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${getCategoryColor(guideline.category)}`}>
                        {guideline.category}
                      </span>
                      {!guideline.isActive && (
                        <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold uppercase">Inactive</span>
                      )}
                      {guideline.pdfUrl && (
                        <span className="px-2 py-1 bg-red-100 text-red-600 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1">
                          <FileText size={10} /> PDF
                        </span>
                      )}
                    </div>
                    <h4 className="font-bold text-slate-900 dark:text-white">{guideline.title}</h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{guideline.description}</p>
                    {guideline.pdfUrl && (
                      <button
                        type="button"
                        onClick={() => setViewingPdf(guideline.pdfUrl || null)}
                        className="mt-3 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors"
                      >
                        <FileText size={16} /> View PDF: {guideline.pdfFileName}
                      </button>
                    )}
                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                      <span>By: {guideline.createdBy}</span>
                      <span>Created: {new Date(guideline.createdAt).toLocaleDateString()}</span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button 
                      type="button"
                      onClick={() => toggleGuidelineActive(guideline.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        guideline.isActive 
                          ? 'text-green-600 bg-green-50 hover:bg-green-100' 
                          : 'text-slate-400 bg-slate-50 hover:bg-slate-100'
                      }`}
                      title={guideline.isActive ? 'Deactivate' : 'Activate'}
                    >
                      {guideline.isActive ? <CheckCircle size={18} /> : <XCircle size={18} />}
                    </button>
                    <button 
                      type="button"
                      onClick={() => deleteGuideline(guideline.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Delete"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* PDF Viewer Modal */}
      {viewingPdf && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setViewingPdf(null)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText size={20} className="text-red-500" /> PDF Viewer
              </h3>
              <button 
                type="button"
                onClick={() => setViewingPdf(null)}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <XCircle size={20} />
              </button>
            </div>
            <div className="flex-1 p-4">
              <iframe 
                src={`http://localhost:5000${viewingPdf}`}
                className="w-full h-full rounded-xl border border-slate-200 dark:border-slate-700"
                title="PDF Viewer"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --- 4. SETTINGS PAGE (System Configuration Only) ---
export const AdminSettings: React.FC = () => {
  const { announcements, addAnnouncement, deleteAnnouncement, toggleAnnouncementActive, currentUser, guidelines, fetchAnnouncements, fetchGuidelines } = useStore();
  
  // Fetch announcements and guidelines on mount
  React.useEffect(() => {
    fetchAnnouncements();
    fetchGuidelines();
  }, []);
  const [activeTab, setActiveTab] = useState<'general' | 'announcements' | 'guidelines'>('general');
  const [newAnnouncement, setNewAnnouncement] = useState({
    title: '',
    content: '',
    type: 'info' as 'info' | 'warning' | 'urgent' | 'guideline',
    expiresAt: ''
  });

  const handleAddAnnouncement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAnnouncement.title || !newAnnouncement.content) return;
    
    addAnnouncement({
      title: newAnnouncement.title,
      content: newAnnouncement.content,
      type: newAnnouncement.type,
      expiresAt: newAnnouncement.expiresAt || undefined,
      createdBy: currentUser?.name || 'Admin',
      isActive: true
    });
    
    setNewAnnouncement({ title: '', content: '', type: 'info', expiresAt: '' });
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'urgent': return 'bg-red-100 text-red-700 border-red-200';
      case 'warning': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'guideline': return 'bg-purple-100 text-purple-700 border-purple-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'urgent': return <AlertOctagon size={16} />;
      case 'warning': return <ShieldAlert size={16} />;
      case 'guideline': return <FileText size={16} />;
      default: return <BrainCircuit size={16} />;
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
           <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white flex items-center gap-3">
             <Settings2 className="text-blue-600" /> System Settings
           </h1>
           <p className="text-slate-500 dark:text-slate-400 mt-1">Configure system settings, announcements, and guidelines for all users.</p>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
        {[
          { id: 'general', label: 'General Settings', icon: <Settings2 size={16} /> },
          { id: 'announcements', label: 'Announcements', icon: <Megaphone size={16} /> },
          { id: 'guidelines', label: 'Guidelines', icon: <BookOpen size={16} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-t-lg font-bold text-sm flex items-center gap-2 transition-colors ${
              activeTab === tab.id 
                ? 'bg-blue-600 text-white' 
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* General Settings Tab */}
      {activeTab === 'general' && (
        <div className="space-y-6">
          <DashboardCard className="p-8">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <Calendar size={20} className="text-blue-600 dark:text-blue-400" /> Academic Timeline
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Academic Year</label>
                <input type="text" defaultValue="2023-2024" className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Semester</label>
                <select className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none">
                  <option>Fall</option>
                  <option>Spring</option>
                  <option>Summer</option>
                </select>
              </div>
            </div>
            <div className="mt-8 flex justify-end">
              <button type="button" className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20"><Save size={18}/> Save Timeline</button>
            </div>
          </DashboardCard>

          <DashboardCard className="p-8">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
              <ShieldAlert size={20} className="text-red-500" /> Plagiarism & Academic Integrity
            </h3>
            <div className="space-y-6">
              <div className="flex items-center justify-between p-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">Auto-Flag Similarity Threshold</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Proposals exceeding this percentage will trigger a high-risk warning.</p>
                </div>
                <div className="flex items-center gap-2">
                  <input type="number" defaultValue={20} className="w-20 p-3 text-center border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 dark:text-white font-bold focus:ring-2 focus:ring-blue-500 outline-none" /> 
                  <span className="font-bold text-slate-400">%</span>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-6 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-100 dark:border-slate-700">
                <div>
                  <p className="font-bold text-slate-900 dark:text-white">AI Analysis Depth</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Control the complexity of AI-generated similarity reports.</p>
                </div>
                <select className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white font-bold">
                  <option>Standard</option>
                  <option>Strict (Comprehensive)</option>
                  <option>Discovery Mode</option>
                </select>
              </div>
            </div>
          </DashboardCard>

          <div className="flex justify-end gap-4">
            <button type="button" className="px-6 py-3 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-xl font-bold">Reset Defaults</button>
            <button type="button" className="px-8 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/20">Apply Global Settings</button>
          </div>
        </div>
      )}

      {/* Announcements Tab */}
      {activeTab === 'announcements' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Create Announcement Form */}
          <DashboardCard className="p-6 h-fit lg:sticky lg:top-8">
            <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
              <Plus size={20} className="text-blue-500"/> New Announcement
            </h3>
            <form onSubmit={handleAddAnnouncement} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Title</label>
                <input 
                  required 
                  value={newAnnouncement.title} 
                  onChange={e => setNewAnnouncement({...newAnnouncement, title: e.target.value})} 
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                  placeholder="Announcement title" 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Content</label>
                <textarea 
                  required 
                  value={newAnnouncement.content} 
                  onChange={e => setNewAnnouncement({...newAnnouncement, content: e.target.value})} 
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                  rows={4} 
                  placeholder="Write your announcement..." 
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Type</label>
                <select 
                  value={newAnnouncement.type} 
                  onChange={e => setNewAnnouncement({...newAnnouncement, type: e.target.value as any})} 
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="info">Information</option>
                  <option value="warning">Warning</option>
                  <option value="urgent">Urgent</option>
                  <option value="guideline">Guideline</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Expires At (Optional)</label>
                <input 
                  type="date" 
                  value={newAnnouncement.expiresAt} 
                  onChange={e => setNewAnnouncement({...newAnnouncement, expiresAt: e.target.value})} 
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" 
                />
              </div>
              <button type="submit" className="w-full py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">
                <Plus size={18}/> Publish Announcement
              </button>
            </form>
          </DashboardCard>

          {/* Announcements List */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-2 px-2">
              <span className="text-sm font-bold text-slate-400 uppercase tracking-widest">All Announcements</span>
              <div className="h-px bg-slate-200 dark:bg-slate-700 flex-1"></div>
              <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 px-3 py-1 rounded-full font-bold">
                {announcements.filter(a => a.isActive).length} Active
              </span>
            </div>
            
            <div className="space-y-4 max-h-[calc(100vh-300px)] overflow-y-auto">
              {announcements.length === 0 ? (
                <div className="p-12 text-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400">
                  <Megaphone size={48} className="mx-auto mb-4 opacity-20"/>
                  <p className="font-bold">No announcements yet</p>
                  <p className="text-sm mt-1">Create your first announcement to notify all users.</p>
                </div>
              ) : (
                announcements.map(announcement => (
                  <div 
                    key={announcement.id} 
                    className={`bg-white dark:bg-slate-800 p-5 rounded-2xl border shadow-sm ${
                      announcement.isActive 
                        ? 'border-slate-200 dark:border-slate-700' 
                        : 'border-slate-100 dark:border-slate-800 opacity-60'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1 ${getTypeColor(announcement.type)}`}>
                            {getTypeIcon(announcement.type)} {announcement.type}
                          </span>
                          {!announcement.isActive && (
                            <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-bold uppercase">Inactive</span>
                          )}
                        </div>
                        <h4 className="font-bold text-slate-900 dark:text-white">{announcement.title}</h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{announcement.content}</p>
                        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                          <span>By: {announcement.createdBy}</span>
                          <span>Created: {new Date(announcement.createdAt).toLocaleDateString()}</span>
                          {announcement.expiresAt && (
                            <span className="text-orange-500">Expires: {announcement.expiresAt}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <button 
                          type="button"
                          onClick={() => toggleAnnouncementActive(announcement.id)}
                          className={`p-2 rounded-lg transition-colors ${
                            announcement.isActive 
                              ? 'text-green-600 bg-green-50 hover:bg-green-100' 
                              : 'text-slate-400 bg-slate-50 hover:bg-slate-100'
                          }`}
                          title={announcement.isActive ? 'Deactivate' : 'Activate'}
                        >
                          {announcement.isActive ? <CheckCircle size={18} /> : <XCircle size={18} />}
                        </button>
                        <button 
                          type="button"
                          onClick={() => deleteAnnouncement(announcement.id)}
                          className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Guidelines Tab */}
      {activeTab === 'guidelines' && (
        <GuidelinesManager />
      )}
    </div>
  );
};

// --- 5. REPORTS PAGE ---
export const AdminReports: React.FC = () => {
  const { theme, users, projects, faculties, departments } = useStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'projects' | 'supervisors' | 'students' | 'models'>('overview');
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
  const [researchAnalytics, setResearchAnalytics] = useState<any>(null);
  const [researchOverview, setResearchOverview] = useState<any>(null);
  const [isResearchLoading, setIsResearchLoading] = useState(false);
  const [researchError, setResearchError] = useState('');
  const [modelReportCategory, setModelReportCategory] = useState<'supervisor' | 'similarity'>('supervisor');
  const [modelReportView, setModelReportView] = useState<'reports' | 'visuals'>('reports');
  const databaseProjects = projects.filter(project => /^[a-f\d]{24}$/i.test(project.id || ''));
  const databaseUsers = users.filter(user => /^[a-f\d]{24}$/i.test(user.id || ''));

  const loadResearchComparison = async () => {
    setIsResearchLoading(true);
    setResearchError('');
    try {
      const [analyticsResponse, overviewResponse] = await Promise.all([
        researchAPI.getAnalytics(),
        researchAPI.getOverview(),
      ]);
      setResearchAnalytics(analyticsResponse.data?.data || null);
      setResearchOverview(overviewResponse.data?.data || null);
    } catch (error: any) {
      setResearchError(error?.response?.data?.message || error?.message || 'Unable to load model comparison reports.');
    } finally {
      setIsResearchLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'models' && !researchAnalytics && !isResearchLoading) {
      void loadResearchComparison();
    }
  }, [activeTab]);

  const activeFaculties = faculties.filter(faculty => faculty.isActive !== false);
  const departmentById = new Map<string, typeof departments[number]>();
  departments.forEach(department => {
    const id = refId(department);
    if (id) departmentById.set(id, department);
  });

  const getProjectDepartmentId = (project: ProjectProposal) => refId(project.departmentId);
  const getProjectFacultyId = (project: ProjectProposal) => {
    const directFacultyId = refId(project.facultyId);
    if (directFacultyId) return directFacultyId;
    const department = departmentById.get(getProjectDepartmentId(project));
    return refId(department?.facultyId);
  };

  const facultyName = (facultyId?: string) => {
    if (!facultyId) return 'All Faculties';
    return activeFaculties.find(faculty => refId(faculty) === facultyId)?.name || 'Selected Faculty';
  };

  const departmentName = (departmentId?: string) => {
    if (!departmentId) return 'All Departments';
    return departments.find(department => refId(department) === departmentId)?.name || 'Selected Department';
  };

  const departmentOptions = departments.filter(department => (
    department.isActive !== false && (!selectedFacultyId || refId(department.facultyId) === selectedFacultyId)
  ));

  const filteredProjects = databaseProjects.filter(project => {
    const matchesFaculty = !selectedFacultyId || getProjectFacultyId(project) === selectedFacultyId;
    const matchesDepartment = !selectedDepartmentId || getProjectDepartmentId(project) === selectedDepartmentId;
    return matchesFaculty && matchesDepartment;
  });

  const filteredUsers = databaseUsers.filter(user => {
    const matchesFaculty = !selectedFacultyId || refId(user.facultyId) === selectedFacultyId;
    const matchesDepartment = !selectedDepartmentId || refId(user.departmentId) === selectedDepartmentId;
    return matchesFaculty && matchesDepartment;
  });

  const supervisors = filteredUsers.filter(u => u.role === UserRole.SUPERVISOR);
  const students = filteredUsers.filter(u => u.role === UserRole.STUDENT);
  const allSupervisors = databaseUsers.filter(u => u.role === UserRole.SUPERVISOR);

  const statusCounts = {
    draft: filteredProjects.filter(p => p.status === ProjectStatus.DRAFT).length,
    submitted: filteredProjects.filter(p => p.status === ProjectStatus.SUBMITTED).length,
    underReview: filteredProjects.filter(p => p.status === ProjectStatus.UNDER_REVIEW).length,
    approved: filteredProjects.filter(p => p.status === ProjectStatus.APPROVED).length,
    inProgress: filteredProjects.filter(p => p.status === ProjectStatus.IN_PROGRESS).length,
    completed: filteredProjects.filter(p => p.status === ProjectStatus.COMPLETED).length,
    rejected: filteredProjects.filter(p => p.status === ProjectStatus.REJECTED).length,
    changesRequested: filteredProjects.filter(p => p.status === ProjectStatus.CHANGES_REQUESTED).length,
  };

  const totalProjects = filteredProjects.length;
  const assignedProjects = filteredProjects.filter(p => p.supervisorId).length;
  const unassignedProjects = filteredProjects.filter(p => !p.supervisorId && p.status !== ProjectStatus.DRAFT && p.status !== ProjectStatus.COMPLETED).length;
  const pendingReviewProjects = statusCounts.submitted + statusCounts.underReview + statusCounts.changesRequested;
  const avgSimilarity = totalProjects
    ? Math.round(filteredProjects.reduce((sum, project) => sum + (project.similarityScore || 0), 0) / totalProjects)
    : 0;
  const completionRate = totalProjects ? Math.round((statusCounts.completed / totalProjects) * 100) : 0;
  const assignmentRate = totalProjects ? Math.round((assignedProjects / totalProjects) * 100) : 0;

  const getSimilarityRisk = (project: ProjectProposal): 'Low' | 'Medium' | 'High' => {
    const score = project.similarityScore || 0;
    if (project.similarityRisk === 'High' || score >= 60) return 'High';
    if (project.similarityRisk === 'Medium' || score >= 30) return 'Medium';
    return 'Low';
  };

  const riskCounts = {
    high: filteredProjects.filter(p => getSimilarityRisk(p) === 'High').length,
    medium: filteredProjects.filter(p => getSimilarityRisk(p) === 'Medium').length,
    low: filteredProjects.filter(p => getSimilarityRisk(p) === 'Low').length,
  };

  const techUsage: Record<string, number> = {};
  filteredProjects.forEach(p => {
    (p.technologies || []).forEach(tech => {
      techUsage[tech] = (techUsage[tech] || 0) + 1;
    });
  });
  const maxTechUsage = Math.max(1, ...Object.values(techUsage));
  const topTechnologies = Object.entries(techUsage)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, value]) => ({ name, value, fullMark: maxTechUsage + 2 }));

  const supervisorWorkload = supervisors.map(sup => ({
    ...sup,
    projectCount: filteredProjects.filter(p => p.supervisorId === sup.id).length,
    activeProjects: filteredProjects.filter(p => p.supervisorId === sup.id && p.status === ProjectStatus.IN_PROGRESS).length,
    completedProjects: filteredProjects.filter(p => p.supervisorId === sup.id && p.status === ProjectStatus.COMPLETED).length,
  })).sort((a, b) => b.projectCount - a.projectCount);

  const modelLabels: Record<string, string> = researchAnalytics?.modelLabels || {
    tfidf: 'TF-IDF',
    sentence_bert: 'Sentence-BERT',
    bge_m3: 'BGE-M3',
  };
  const reportNumber = (value: unknown, digits = 2) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(digits) : '-';
  };
  const projectModelComparison = (researchAnalytics?.descriptive || []).map((row: any) => ({
    ...row,
    ...(researchAnalytics?.latency || []).find((item: any) => item.model === row.model),
    supervisorMatching: (researchAnalytics?.supervisorModelSummary || []).find((item: any) => item.model === row.model),
  }));
  const supervisorComparisonRows = (researchAnalytics?.workload || []).map((row: any) => ({
    ...row,
    availableCapacity: Math.max(0, Number(row.maximumCapacity || 0) - Number(row.assignedProjects || 0)),
  }));
  const similarityEvaluationRows = Object.entries(researchAnalytics?.evaluation?.results || {}).map(([model, value]: [string, any]) => ({
    model,
    modelLabel: modelLabels[model] || model,
    ...(value?.classification || {}),
  }));
  const bestSimilarityModel = [...similarityEvaluationRows]
    .filter(row => Number.isFinite(Number(row.macro_f1_score)))
    .sort((left, right) => Number(right.macro_f1_score || 0) - Number(left.macro_f1_score || 0))[0];
  const supervisorEvaluationRows = Object.entries(researchAnalytics?.supervisorEvaluation?.results || {}).map(([model, value]: [string, any]) => ({
    model,
    modelLabel: modelLabels[model] || model,
    ...value,
  }));
  const bestSupervisorModel = supervisorEvaluationRows.find(row => row.model === researchAnalytics?.supervisorEvaluation?.bestModel);

  const statusChartData = [
    { name: 'Draft', value: statusCounts.draft, color: '#94a3b8' },
    { name: 'Submitted', value: statusCounts.submitted, color: '#3b82f6' },
    { name: 'Under Review', value: statusCounts.underReview, color: '#f59e0b' },
    { name: 'Approved', value: statusCounts.approved, color: '#10b981' },
    { name: 'In Progress', value: statusCounts.inProgress, color: '#6366f1' },
    { name: 'Completed', value: statusCounts.completed, color: '#22c55e' },
    { name: 'Changes', value: statusCounts.changesRequested, color: '#f97316' },
    { name: 'Rejected', value: statusCounts.rejected, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const riskChartData = [
    { name: 'Low', value: riskCounts.low, color: '#22c55e' },
    { name: 'Medium', value: riskCounts.medium, color: '#f59e0b' },
    { name: 'High', value: riskCounts.high, color: '#ef4444' },
  ].filter(d => d.value > 0);

  const monthlyMap = new Map<string, { month: string; submissions: number; completions: number; order: number }>();
  filteredProjects.forEach(project => {
    const parsedDate = new Date(project.submissionDate);
    const validDate = !Number.isNaN(parsedDate.getTime());
    const month = validDate ? parsedDate.toLocaleString('en-US', { month: 'short' }) : 'Unknown';
    const order = validDate ? parsedDate.getFullYear() * 12 + parsedDate.getMonth() : 0;
    const entry = monthlyMap.get(month) || { month, submissions: 0, completions: 0, order };
    entry.submissions += 1;
    if (project.status === ProjectStatus.COMPLETED) entry.completions += 1;
    monthlyMap.set(month, entry);
  });
  const monthlyData = Array.from(monthlyMap.values())
    .sort((a, b) => a.order - b.order)
    .slice(-6);

  const departmentBreakdown = departmentOptions.map(department => {
    const departmentId = refId(department);
    const departmentProjects = filteredProjects.filter(project => getProjectDepartmentId(project) === departmentId);
    const assigned = departmentProjects.filter(project => project.supervisorId).length;
    return {
      id: departmentId,
      name: department.name,
      projects: departmentProjects.length,
      assigned,
      completed: departmentProjects.filter(project => project.status === ProjectStatus.COMPLETED).length,
      highRisk: departmentProjects.filter(project => getSimilarityRisk(project) === 'High').length,
      assignmentRate: departmentProjects.length ? Math.round((assigned / departmentProjects.length) * 100) : 0,
    };
  }).filter(row => row.projects > 0 || selectedDepartmentId === row.id);

  const facultyBreakdown = activeFaculties.map(faculty => {
    const facultyId = refId(faculty);
    const facultyProjects = filteredProjects.filter(project => getProjectFacultyId(project) === facultyId);
    return {
      id: facultyId,
      name: faculty.name,
      projects: facultyProjects.length,
      assigned: facultyProjects.filter(project => project.supervisorId).length,
      completed: facultyProjects.filter(project => project.status === ProjectStatus.COMPLETED).length,
      highRisk: facultyProjects.filter(project => getSimilarityRisk(project) === 'High').length,
    };
  }).filter(row => row.projects > 0 || selectedFacultyId === row.id);

  const attentionWeight = (project: ProjectProposal) => {
    if (getSimilarityRisk(project) === 'High') return 4;
    if (!project.supervisorId && project.status !== ProjectStatus.DRAFT && project.status !== ProjectStatus.COMPLETED) return 3;
    if (project.status === ProjectStatus.REJECTED || project.status === ProjectStatus.CHANGES_REQUESTED) return 2;
    return 1;
  };

  const attentionReason = (project: ProjectProposal) => {
    if (getSimilarityRisk(project) === 'High') return 'High similarity risk';
    if (!project.supervisorId && project.status !== ProjectStatus.DRAFT && project.status !== ProjectStatus.COMPLETED) return 'Needs supervisor';
    if (project.status === ProjectStatus.CHANGES_REQUESTED) return 'Changes requested';
    if (project.status === ProjectStatus.REJECTED) return 'Rejected';
    return 'Review needed';
  };

  const attentionProjects = filteredProjects
    .filter(project => attentionWeight(project) > 1)
    .sort((a, b) => attentionWeight(b) - attentionWeight(a))
    .slice(0, 8);

  const exportReport = () => {
    const reportData = {
      generatedAt: new Date().toISOString(),
      scope: {
        faculty: facultyName(selectedFacultyId),
        department: departmentName(selectedDepartmentId),
      },
      summary: {
        totalProjects,
        assignedProjects,
        unassignedProjects,
        pendingReviewProjects,
        completionRate,
        assignmentRate,
        avgSimilarity,
        highRiskProjects: riskCounts.high,
        totalSupervisors: supervisors.length,
        totalStudents: students.length,
      },
      projectsByStatus: statusCounts,
      similarityRisk: riskCounts,
      departmentBreakdown,
      facultyBreakdown,
      supervisorWorkload: supervisorWorkload.map(s => ({
        name: s.name,
        email: s.email,
        projectCount: s.projectCount,
        activeProjects: s.activeProjects,
        completedProjects: s.completedProjects,
      })),
      supervisorComparisonReport: supervisorComparisonRows,
      allModelComparisonReport: researchAnalytics ? {
        dataCoverage: researchAnalytics.counts,
        supervisorAssignmentReport: {
          bestModel: bestSupervisorModel?.model || null,
          selectionBasis: bestSupervisorModel ? 'Highest F1 using saved expert relevance labels' : 'Awaiting expert relevance labels',
          evaluation: researchAnalytics.supervisorEvaluation,
          modelComparison: researchAnalytics.supervisorModelSummary || [],
          supervisorCapacity: supervisorComparisonRows,
        },
        similarityReport: {
          bestModel: bestSimilarityModel?.model || null,
          selectionBasis: bestSimilarityModel ? 'Highest Macro F1 using current authorised-reviewer project-pair labels' : 'Awaiting human project-pair labels',
          evaluation: researchAnalytics.evaluation,
          modelComparison: projectModelComparison,
          fieldAverages: researchAnalytics.fieldAverages || [],
          riskDistribution: researchAnalytics.riskDistribution || [],
          executionPerformance: researchAnalytics.latency || [],
          modelCorrelations: researchAnalytics.correlations || [],
          largestModelDisagreements: researchAnalytics.disagreements || [],
          groundTruthStatus: researchOverview?.groundTruthStatus || 'Not loaded',
        },
      } : {
        status: 'Model analytics were not loaded. Open the Model & Supervisor Comparison tab and export again.',
      },
      topTechnologies: topTechnologies.map(t => ({ technology: t.name, count: t.value })),
      allProjects: filteredProjects.map(p => ({
        title: p.title,
        student: p.studentName,
        status: p.status,
        faculty: facultyName(getProjectFacultyId(p)),
        department: departmentName(getProjectDepartmentId(p)),
        supervisor: allSupervisors.find(s => s.id === p.supervisorId)?.name || 'Unassigned',
        technologies: p.technologies,
        similarityScore: p.similarityScore || 0,
        similarityRisk: getSimilarityRisk(p),
        submissionDate: p.submissionDate,
      })),
    };
    
    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `admin-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportProjectsCsv = () => {
    const supervisorName = (project: ProjectProposal) =>
      allSupervisors.find(s => s.id === project.supervisorId)?.name || 'Unassigned';
    const joinList = (value?: string[]) => (value || []).join('; ');
    const escapeCsv = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const headers = [
      'Project ID',
      'Title',
      'Student ID',
      'Student Name',
      'Status',
      'Faculty',
      'Department',
      'Supervisor',
      'Description',
      'Problem Statement',
      'Objectives',
      'Features',
      'Technologies',
      'Tools Or Methods',
      'Expected Outputs',
      'Similarity Score',
      'Similarity Risk',
      'Submission Date',
    ];
    const rows = filteredProjects.map(project => [
      project.id,
      project.title,
      project.studentId,
      project.studentName,
      project.status,
      facultyName(getProjectFacultyId(project)),
      departmentName(getProjectDepartmentId(project)),
      supervisorName(project),
      project.description,
      project.problemStatement || '',
      joinList(project.objectives),
      joinList(project.features),
      joinList(project.technologies),
      joinList(project.toolsOrMethods),
      joinList(project.expectedOutputs),
      project.similarityScore || 0,
      project.similarityRisk || getSimilarityRisk(project),
      project.submissionDate,
    ]);
    const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const scope = selectedDepartmentId
      ? departmentName(selectedDepartmentId)
      : selectedFacultyId
        ? facultyName(selectedFacultyId)
        : 'all-projects';
    anchor.href = url;
    anchor.download = `projects-${scope.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().split('T')[0]}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportSupervisorComparisonCsv = () => {
    const escapeCsv = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const headers = ['Supervisor Code', 'Supervisor Name', 'Assigned Projects', 'Maximum Capacity', 'Available Capacity', 'Utilization Percentage'];
    const rows = supervisorComparisonRows.map((row: any) => [
      row.supervisorCode,
      row.supervisorName,
      row.assignedProjects,
      row.maximumCapacity,
      row.availableCapacity,
      row.utilizationPercentage,
    ]);
    const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `supervisor-comparison-${new Date().toISOString().split('T')[0]}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Admin Intelligence</p>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">Reports & Analytics</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {facultyName(selectedFacultyId)} / {departmentName(selectedDepartmentId)}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={exportProjectsCsv}
            disabled={!filteredProjects.length}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Download size={18} /> Download Projects CSV
          </button>
          <button 
            onClick={exportReport}
            className="px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors"
          >
            <FileText size={18} /> Export Report
          </button>
        </div>
      </div>

      <DashboardCard className="p-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr_auto] gap-4 items-end">
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Faculty
            </label>
            <select
              value={selectedFacultyId}
              onChange={(e) => {
                setSelectedFacultyId(e.target.value);
                setSelectedDepartmentId('');
              }}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Faculties</option>
              {activeFaculties.map(faculty => (
                <option key={refId(faculty)} value={refId(faculty)}>{faculty.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Department
            </label>
            <select
              value={selectedDepartmentId}
              onChange={(e) => setSelectedDepartmentId(e.target.value)}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Departments</option>
              {departmentOptions.map(department => (
                <option key={refId(department)} value={refId(department)}>{department.name}</option>
              ))}
            </select>
          </div>
          <div className="rounded-xl bg-slate-50 dark:bg-slate-900 px-4 py-3 min-w-[220px]">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Scope</p>
            <p className="text-sm font-black text-slate-900 dark:text-white mt-1">
              {totalProjects} projects, {supervisors.length} supervisors
            </p>
          </div>
        </div>
      </DashboardCard>
      
      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700 pb-2">
        {[
          { id: 'overview', label: 'Overview', icon: <BarChart3 size={16} /> },
          { id: 'projects', label: 'Projects', icon: <Layers size={16} /> },
          { id: 'supervisors', label: 'Supervisors', icon: <Users size={16} /> },
          { id: 'models', label: 'Model & Supervisor Comparison', icon: <BrainCircuit size={16} /> },
          { id: 'students', label: 'Students', icon: <GraduationCap size={16} /> },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2 rounded-t-lg font-bold text-sm flex items-center gap-2 transition-colors ${
              activeTab === tab.id 
                ? 'bg-blue-600 text-white' 
                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            {tab.icon} {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="grid grid-cols-2 xl:grid-cols-6 gap-4">
            <DashboardCard className="admin-dashboard-mini-card p-4 text-center">
              <p className="admin-dashboard-mini-value text-3xl font-black text-blue-600">{totalProjects}</p>
              <p className="text-xs text-slate-500 uppercase font-bold">Total Projects</p>
            </DashboardCard>
            <DashboardCard className="admin-dashboard-mini-card p-4 text-center">
              <p className="admin-dashboard-mini-value text-3xl font-black text-green-600">{assignedProjects}</p>
              <p className="text-xs text-slate-500 uppercase font-bold">Assigned</p>
              <p className="text-[11px] text-slate-400 mt-1">{assignmentRate}% assigned</p>
            </DashboardCard>
            <DashboardCard className="admin-dashboard-mini-card p-4 text-center">
              <p className="admin-dashboard-mini-value text-3xl font-black text-orange-600">{unassignedProjects}</p>
              <p className="text-xs text-slate-500 uppercase font-bold">Pending Assignment</p>
            </DashboardCard>
            <DashboardCard className="admin-dashboard-mini-card p-4 text-center">
              <p className="admin-dashboard-mini-value text-3xl font-black text-indigo-600">{pendingReviewProjects}</p>
              <p className="text-xs text-slate-500 uppercase font-bold">Review Queue</p>
            </DashboardCard>
            <DashboardCard className="admin-dashboard-mini-card p-4 text-center">
              <p className="admin-dashboard-mini-value text-3xl font-black text-emerald-600">{completionRate}%</p>
              <p className="text-xs text-slate-500 uppercase font-bold">Completion Rate</p>
            </DashboardCard>
            <DashboardCard className="admin-dashboard-mini-card p-4 text-center">
              <p className={`admin-dashboard-mini-value text-3xl font-black ${riskCounts.high ? 'text-red-600' : 'text-slate-700 dark:text-slate-200'}`}>{riskCounts.high}</p>
              <p className="text-xs text-slate-500 uppercase font-bold">High Risk</p>
              <p className="text-[11px] text-slate-400 mt-1">Avg {avgSimilarity}%</p>
            </DashboardCard>
          </div>
          
          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Project Status Distribution */}
            <DashboardCard className="p-6">
              <h3 className="font-bold text-lg dark:text-white mb-4 flex items-center gap-2">
                <PieChartIcon size={20} className="text-indigo-500" /> Project Status Distribution
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap gap-2 mt-4 justify-center">
                {statusChartData.map(item => (
                  <div key={item.name} className="flex items-center gap-1 text-xs">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                    <span className="text-slate-600 dark:text-slate-400">{item.name}</span>
                  </div>
                ))}
              </div>
            </DashboardCard>
            
            {/* Similarity Risk */}
            <DashboardCard className="p-6">
              <h3 className="font-bold text-lg dark:text-white mb-4 flex items-center gap-2">
                <ShieldAlert className="text-red-500" size={20}/> Similarity Risk
              </h3>
              <div className="h-64">
                {riskChartData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={riskChartData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={88}
                        paddingAngle={3}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {riskChartData.map((entry, index) => (
                          <Cell key={`risk-cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">No similarity data in this scope.</div>
                )}
              </div>
              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                {riskChartData.map(item => (
                  <div key={item.name} className="rounded-xl bg-slate-50 dark:bg-slate-900 p-2">
                    <p className="text-lg font-black" style={{ color: item.color }}>{item.value}</p>
                    <p className="text-[10px] font-bold uppercase text-slate-400">{item.name}</p>
                  </div>
                ))}
              </div>
            </DashboardCard>
          </div>
          
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <DashboardCard className="p-6">
              <h3 className="font-bold text-lg dark:text-white mb-4 flex items-center gap-2">
                <TrendingUp size={20} className="text-green-500" /> Monthly Activity
              </h3>
              <div className="h-64">
                {monthlyData.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                      <XAxis dataKey="month" tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                      <YAxis tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="submissions" fill="#2563eb" name="Submissions" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completions" fill="#16a34a" name="Completions" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">No project submissions in this scope.</div>
                )}
              </div>
            </DashboardCard>

            <DashboardCard className="p-6">
              <h3 className="font-bold text-lg dark:text-white mb-4 flex items-center gap-2">
                <Layers className="text-purple-600" size={20}/> Technology Stack
              </h3>
              <div className="h-64">
                {topTechnologies.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={topTechnologies}>
                      <PolarGrid stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                      <PolarAngleAxis dataKey="name" tick={{ fontSize: 10, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                      <Radar dataKey="value" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.55} />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">No technology tags in this scope.</div>
                )}
              </div>
            </DashboardCard>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
            <DashboardCard className="p-6 xl:col-span-2">
              <h3 className="font-bold text-lg dark:text-white mb-4 flex items-center gap-2">
                <BarChart3 size={20} className="text-blue-600" /> Department Performance
              </h3>
              <div className="h-72">
                {departmentBreakdown.length ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={departmentBreakdown.slice(0, 8)}>
                      <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                      <XAxis dataKey="name" tick={{ fontSize: 11, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                      <YAxis tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="projects" fill="#2563eb" name="Projects" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="assigned" fill="#16a34a" name="Assigned" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="highRisk" fill="#ef4444" name="High Risk" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-sm text-slate-400">No departments have projects in this scope.</div>
                )}
              </div>
            </DashboardCard>

            <DashboardCard className="p-6">
              <h3 className="font-bold text-lg dark:text-white mb-4 flex items-center gap-2">
                <AlertOctagon size={20} className="text-orange-500" /> Attention Queue
              </h3>
              <div className="space-y-3">
                {attentionProjects.length ? attentionProjects.map(project => (
                  <div key={project.id} className="border-b border-slate-100 dark:border-slate-700 pb-3 last:border-0 last:pb-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{project.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{project.studentName}</p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-orange-100 dark:bg-orange-900/30 px-2 py-1 text-[10px] font-black uppercase text-orange-700 dark:text-orange-300">
                        {attentionReason(project)}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">
                      {departmentName(getProjectDepartmentId(project))} / Similarity {project.similarityScore || 0}%
                    </p>
                  </div>
                )) : (
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-900 p-4 text-sm text-slate-500 dark:text-slate-400">
                    No urgent project issues in this scope.
                  </div>
                )}
              </div>
            </DashboardCard>
          </div>

          <DashboardCard className="overflow-hidden">
            <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="font-bold text-lg dark:text-white">
                  {selectedFacultyId ? 'Department Summary' : 'Faculty Summary'}
                </h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Assignment and risk view for the selected reporting scope.
                </p>
              </div>
              <span className="rounded-xl bg-blue-50 dark:bg-blue-900/20 px-3 py-1 text-xs font-black uppercase text-blue-700 dark:text-blue-300">
                {facultyName(selectedFacultyId)}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">{selectedFacultyId ? 'Department' : 'Faculty'}</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Projects</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Assigned</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Completed</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">High Risk</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {(selectedFacultyId ? departmentBreakdown : facultyBreakdown).map(row => (
                    <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="p-3 font-bold text-sm text-slate-800 dark:text-white">{row.name}</td>
                      <td className="p-3 text-sm text-slate-600 dark:text-slate-400">{row.projects}</td>
                      <td className="p-3 text-sm text-slate-600 dark:text-slate-400">{row.assigned}</td>
                      <td className="p-3 text-sm text-slate-600 dark:text-slate-400">{row.completed}</td>
                      <td className={`p-3 text-sm font-bold ${row.highRisk ? 'text-red-600' : 'text-slate-500 dark:text-slate-400'}`}>{row.highRisk}</td>
                    </tr>
                  ))}
                  {!(selectedFacultyId ? departmentBreakdown : facultyBreakdown).length && (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        No report rows available for this scope.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DashboardCard>
        </div>
      )}

      {/* Projects Tab */}
      {activeTab === 'projects' && (
        <div className="space-y-6">
          {/* Status Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
            {[
              { label: 'Draft', count: statusCounts.draft, color: 'bg-slate-100 text-slate-600' },
              { label: 'Submitted', count: statusCounts.submitted, color: 'bg-blue-100 text-blue-600' },
              { label: 'Under Review', count: statusCounts.underReview, color: 'bg-yellow-100 text-yellow-600' },
              { label: 'Approved', count: statusCounts.approved, color: 'bg-emerald-100 text-emerald-600' },
              { label: 'In Progress', count: statusCounts.inProgress, color: 'bg-indigo-100 text-indigo-600' },
              { label: 'Completed', count: statusCounts.completed, color: 'bg-green-100 text-green-600' },
              { label: 'Changes', count: statusCounts.changesRequested, color: 'bg-orange-100 text-orange-600' },
              { label: 'Rejected', count: statusCounts.rejected, color: 'bg-red-100 text-red-600' },
            ].map(status => (
              <div key={status.label} className={`p-3 rounded-xl ${status.color} text-center`}>
                <p className="text-2xl font-black">{status.count}</p>
                <p className="text-[10px] font-bold uppercase">{status.label}</p>
              </div>
            ))}
          </div>
          
          {/* All Projects Table */}
          <DashboardCard className="overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h3 className="font-bold text-lg dark:text-white">All Projects</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400">{filteredProjects.length} projects in the current report scope.</p>
              </div>
              <button
                type="button"
                onClick={exportProjectsCsv}
                disabled={!filteredProjects.length}
                className="px-3 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold flex items-center gap-2 hover:bg-blue-700 disabled:opacity-50"
              >
                <Download size={16} /> Download CSV
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Project</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Student</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Faculty</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Department</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Status</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Supervisor</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Technologies</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Similarity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredProjects.map(project => (
                    <tr key={project.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="p-3">
                        <span className="font-bold text-slate-700 dark:text-white text-sm">{project.title}</span>
                      </td>
                      <td className="p-3 text-sm text-slate-600 dark:text-slate-400">{project.studentName}</td>
                      <td className="p-3 text-sm text-slate-600 dark:text-slate-400">{facultyName(getProjectFacultyId(project))}</td>
                      <td className="p-3 text-sm text-slate-600 dark:text-slate-400">{departmentName(getProjectDepartmentId(project))}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                          project.status === ProjectStatus.COMPLETED ? 'bg-green-100 text-green-700' :
                          project.status === ProjectStatus.IN_PROGRESS ? 'bg-indigo-100 text-indigo-700' :
                          project.status === ProjectStatus.APPROVED ? 'bg-emerald-100 text-emerald-700' :
                          project.status === ProjectStatus.UNDER_REVIEW ? 'bg-yellow-100 text-yellow-700' :
                          project.status === ProjectStatus.SUBMITTED ? 'bg-blue-100 text-blue-700' :
                          project.status === ProjectStatus.CHANGES_REQUESTED ? 'bg-orange-100 text-orange-700' :
                          project.status === ProjectStatus.REJECTED ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {project.status}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-slate-600 dark:text-slate-400">
                        {allSupervisors.find(s => s.id === project.supervisorId)?.name || 
                          <span className="text-orange-500 italic">Unassigned</span>
                        }
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(project.technologies || []).slice(0, 3).map(tech => (
                            <span key={tech} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] rounded">
                              {tech}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={`font-bold text-sm ${
                          (project.similarityScore || 0) > 30 ? 'text-red-600' : 
                          (project.similarityScore || 0) > 15 ? 'text-yellow-600' : 'text-green-600'
                        }`}>
                          {project.similarityScore || 0}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {!filteredProjects.length && (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        No projects found for this faculty and department.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DashboardCard>
        </div>
      )}

      {/* Supervisors Tab */}
      {activeTab === 'supervisors' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {supervisorWorkload.map((sup, idx) => (
              <DashboardCard key={sup.id} className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                    {sup.name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-slate-900 dark:text-white">{sup.name}</h4>
                      {idx === 0 && <Award size={16} className="text-yellow-500" />}
                    </div>
                    <p className="text-xs text-slate-500">{sup.email}</p>
                    <p className="text-xs text-slate-400 mt-1">{sup.department}</p>
                  </div>
                </div>
                
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg">
                    <p className="text-lg font-black text-blue-600">{sup.projectCount}</p>
                    <p className="text-[9px] text-slate-400 uppercase">Total</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg">
                    <p className="text-lg font-black text-indigo-600">{sup.activeProjects}</p>
                    <p className="text-[9px] text-slate-400 uppercase">Active</p>
                  </div>
                  <div className="bg-slate-50 dark:bg-slate-900 p-2 rounded-lg">
                    <p className="text-lg font-black text-green-600">{sup.completedProjects}</p>
                    <p className="text-[9px] text-slate-400 uppercase">Done</p>
                  </div>
                </div>
                
                {sup.expertise && sup.expertise.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {sup.expertise.slice(0, 4).map(exp => (
                      <span key={exp} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 text-[10px] rounded-full">
                        {exp}
                      </span>
                    ))}
                  </div>
                )}
                
                {sup.performanceMetrics && (
                  <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex justify-between text-xs">
                    <span className="text-slate-400">Satisfaction:</span>
                    <span className="font-bold text-green-600">{sup.performanceMetrics.studentSatisfactionScore}/5</span>
                  </div>
                )}
              </DashboardCard>
            ))}
            {!supervisorWorkload.length && (
              <DashboardCard className="p-8 text-center md:col-span-2 lg:col-span-3">
                <Users size={32} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                <p className="font-bold text-slate-700 dark:text-slate-200">No supervisors in this scope</p>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                  Change the faculty or department filter to view other supervisor workloads.
                </p>
              </DashboardCard>
            )}
          </div>
        </div>
      )}

      {/* Model and Supervisor Comparison Tab */}
      {activeTab === 'models' && (
        <div className="space-y-6">
          <DashboardCard className="p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="flex items-center gap-2 text-xl font-black text-slate-900 dark:text-white">
                  <BrainCircuit size={22} className="text-blue-600" /> All-Model & Supervisor Comparison Report
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Persisted results for TF-IDF, Sentence-BERT, and BGE-M3, including project similarity, supervisor matching, workload, and processing performance.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void loadResearchComparison()}
                  disabled={isResearchLoading}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                >
                  <RefreshCw size={16} className={isResearchLoading ? 'animate-spin' : ''} /> Refresh
                </button>
                <button
                  type="button"
                  onClick={exportSupervisorComparisonCsv}
                  disabled={!supervisorComparisonRows.length}
                  className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                >
                  <Download size={16} /> Supervisor CSV
                </button>
              </div>
            </div>
          </DashboardCard>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <button
              type="button"
              onClick={() => setModelReportCategory('supervisor')}
              className={`rounded-2xl border p-5 text-left transition-all ${modelReportCategory === 'supervisor' ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200 dark:bg-blue-950/30' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}
            >
              <div className="flex items-center gap-3"><Users className="text-blue-600"/><div><h3 className="font-black text-slate-900 dark:text-white">1. Supervisor Assignment Reports & Visuals</h3><p className="mt-1 text-sm text-slate-500">Assignment quality, semantic fit, adjusted scores, workload, capacity, speed, and expert-labelled F1.</p></div></div>
            </button>
            <button
              type="button"
              onClick={() => setModelReportCategory('similarity')}
              className={`rounded-2xl border p-5 text-left transition-all ${modelReportCategory === 'similarity' ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200 dark:bg-purple-950/30' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800'}`}
            >
              <div className="flex items-center gap-3"><ShieldAlert className="text-purple-600"/><div><h3 className="font-black text-slate-900 dark:text-white">2. Similarity Reports & Visuals</h3><p className="mt-1 text-sm text-slate-500">Pair scores, fields, risk classification, correlations, disagreements, speed, and human-labelled preliminary F1.</p></div></div>
            </button>
          </div>

          <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-800">
            <button type="button" onClick={() => setModelReportView('reports')} className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black ${modelReportView === 'reports' ? 'bg-slate-900 text-white dark:bg-blue-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}><FileText size={17}/>Reports & Tables</button>
            <button type="button" onClick={() => setModelReportView('visuals')} className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-black ${modelReportView === 'visuals' ? 'bg-slate-900 text-white dark:bg-blue-600' : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'}`}><BarChart3 size={17}/>Visuals & Charts</button>
            <div className="ml-auto flex items-center px-3 text-xs font-bold uppercase tracking-wider text-slate-400">{modelReportCategory === 'supervisor' ? 'Supervisor Assignment' : 'Project Similarity'} / {modelReportView}</div>
          </div>

          {researchError && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {researchError}
            </div>
          )}

          {isResearchLoading && !researchAnalytics && (
            <DashboardCard className="flex items-center justify-center gap-3 p-10 text-slate-500">
              <Loader2 className="animate-spin" /> Loading stored model and supervisor reports...
            </DashboardCard>
          )}

          {researchAnalytics && (
            <>
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
                {[
                  ['Models', researchAnalytics.models?.length || 0],
                  ['Stored Pair Scores', researchAnalytics.counts?.persistedPairScores || 0],
                  ['Complete Project Pairs', researchAnalytics.counts?.completeProjectPairs || 0],
                  ['Supervisor Scores', researchAnalytics.counts?.supervisorScores || 0],
                  ['Assignments', researchAnalytics.counts?.assignments || 0],
                ].map(([label, value]) => (
                  <DashboardCard key={String(label)} className="admin-dashboard-mini-card p-4 text-center">
                    <p className="admin-dashboard-mini-value text-2xl font-black text-blue-600">{Number(value).toLocaleString()}</p>
                    <p className="text-[10px] font-bold uppercase text-slate-500">{label}</p>
                  </DashboardCard>
                ))}
              </div>

              {modelReportCategory === 'supervisor' ? (
                <DashboardCard className="border-l-4 border-l-blue-600 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div><p className="text-xs font-black uppercase tracking-wider text-blue-600">Best Supervisor Assignment Model</p><h3 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{bestSupervisorModel ? bestSupervisorModel.modelLabel : 'Awaiting expert labels'}</h3><p className="mt-1 text-sm text-slate-500">{researchAnalytics.supervisorEvaluation?.note}</p></div>
                    {bestSupervisorModel && <div className="grid grid-cols-3 gap-3 text-center"><div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-950/30"><p className="text-xl font-black text-blue-600">{reportNumber(Number(bestSupervisorModel.accuracy || 0) * 100)}%</p><span className="text-[10px] font-bold uppercase text-slate-400">Accuracy</span></div><div className="rounded-xl bg-green-50 p-3 dark:bg-green-950/30"><p className="text-xl font-black text-green-600">{reportNumber(Number(bestSupervisorModel.f1Score || 0) * 100)}%</p><span className="text-[10px] font-bold uppercase text-slate-400">F1</span></div><div className="rounded-xl bg-purple-50 p-3 dark:bg-purple-950/30"><p className="text-xl font-black text-purple-600">{bestSupervisorModel.sampleSize}</p><span className="text-[10px] font-bold uppercase text-slate-400">Labels</span></div></div>}
                  </div>
                </DashboardCard>
              ) : (
                <DashboardCard className="border-l-4 border-l-purple-600 p-5">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div><p className="text-xs font-black uppercase tracking-wider text-purple-600">Best Similarity Model</p><h3 className="mt-1 text-2xl font-black text-slate-900 dark:text-white">{bestSimilarityModel ? bestSimilarityModel.modelLabel : 'Awaiting human labels'}</h3><p className="mt-1 text-sm text-slate-500">{researchAnalytics.evaluation?.note}</p></div>
                    {bestSimilarityModel && <div className="grid grid-cols-3 gap-3 text-center"><div className="rounded-xl bg-blue-50 p-3 dark:bg-blue-950/30"><p className="text-xl font-black text-blue-600">{reportNumber(Number(bestSimilarityModel.accuracy || 0) * 100)}%</p><span className="text-[10px] font-bold uppercase text-slate-400">Accuracy</span></div><div className="rounded-xl bg-purple-50 p-3 dark:bg-purple-950/30"><p className="text-xl font-black text-purple-600">{reportNumber(Number(bestSimilarityModel.macro_f1_score || 0) * 100)}%</p><span className="text-[10px] font-bold uppercase text-slate-400">Macro F1</span></div><div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-900"><p className="text-xl font-black text-slate-700 dark:text-slate-200">{researchAnalytics.evaluation?.sampleSize || 0}</p><span className="text-[10px] font-bold uppercase text-slate-400">Consensus pairs</span></div></div>}
                  </div>
                </DashboardCard>
              )}

              {modelReportCategory === 'similarity' && modelReportView === 'reports' && <DashboardCard className="overflow-hidden">
                <div className="border-b border-slate-200 p-5 dark:border-slate-700">
                  <h3 className="font-bold text-slate-900 dark:text-white">Project Similarity Model Comparison</h3>
                  <p className="mt-1 text-sm text-slate-500">Descriptive score statistics and measured inference performance for every stored model.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[1250px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50">
                      <tr>
                        <th className="p-3">Model</th><th className="p-3">Records</th><th className="p-3">Mean</th><th className="p-3">Median</th>
                        <th className="p-3">Minimum</th><th className="p-3">Maximum</th><th className="p-3">Std. deviation</th>
                        <th className="p-3">95% confidence interval</th><th className="p-3">Average time</th><th className="p-3">Comparisons/sec</th><th className="p-3">Device</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {projectModelComparison.map((row: any) => (
                        <tr key={row.model}>
                          <td className="p-3 font-black text-slate-900 dark:text-white">{modelLabels[row.model] || row.model}</td>
                          <td className="p-3">{Number(row.records || 0).toLocaleString()}</td>
                          <td className="p-3">{reportNumber(row.mean)}%</td><td className="p-3">{reportNumber(row.median)}%</td>
                          <td className="p-3">{reportNumber(row.minimum)}%</td><td className="p-3">{reportNumber(row.maximum)}%</td>
                          <td className="p-3">{reportNumber(row.standardDeviation)}</td>
                          <td className="p-3">{reportNumber(row.confidenceIntervalLow)}% – {reportNumber(row.confidenceIntervalHigh)}%</td>
                          <td className="p-3">{reportNumber(row.averageMs)} ms</td><td className="p-3">{reportNumber(row.comparisonsPerSecond)}</td>
                          <td className="p-3">{row.device || 'CPU'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DashboardCard>}

              {modelReportCategory === 'similarity' && modelReportView === 'visuals' && <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <DashboardCard className="p-5">
                  <h3 className="font-bold text-slate-900 dark:text-white">Average Similarity Score by Model</h3>
                  <p className="mt-1 text-sm text-slate-500">Mean weighted score across persisted project pairs.</p>
                  <div className="mt-4 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={projectModelComparison.map((row: any) => ({ model: modelLabels[row.model] || row.model, score: Number(row.mean || 0) }))}><CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'}/><XAxis dataKey="model" tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 11 }}/><YAxis domain={[0, 100]} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b' }}/><Tooltip/><Bar dataKey="score" name="Average similarity (%)" fill="#7c3aed" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer></div>
                </DashboardCard>
                <DashboardCard className="p-5">
                  <h3 className="font-bold text-slate-900 dark:text-white">Similarity Model Processing Time</h3>
                  <p className="mt-1 text-sm text-slate-500">Average inference latency for each model.</p>
                  <div className="mt-4 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={projectModelComparison.map((row: any) => ({ model: modelLabels[row.model] || row.model, time: Number(row.averageMs || 0) }))}><CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'}/><XAxis dataKey="model" tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 11 }}/><YAxis tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b' }}/><Tooltip/><Bar dataKey="time" name="Average time (ms)" fill="#0f766e" radius={[5, 5, 0, 0]}/></BarChart></ResponsiveContainer></div>
                </DashboardCard>
                <DashboardCard className="p-5 xl:col-span-2">
                  <h3 className="font-bold text-slate-900 dark:text-white">Similarity Risk Distribution Across All Models</h3>
                  <p className="mt-1 text-sm text-slate-500">Low, Medium, and High classifications produced by each model.</p>
                  <div className="mt-4 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={(researchAnalytics.riskDistribution || []).map((row: any) => ({ risk: row.risk, ...row }))}><CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'}/><XAxis dataKey="risk" tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b' }}/><YAxis allowDecimals={false} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b' }}/><Tooltip/>{(researchAnalytics.models || []).map((model: string, index: number) => <Bar key={model} dataKey={model} name={modelLabels[model] || model} fill={['#2563eb', '#7c3aed', '#16a34a'][index] || '#64748b'} radius={[4, 4, 0, 0]}/>)}</BarChart></ResponsiveContainer></div>
                </DashboardCard>
                {similarityEvaluationRows.length > 0 && <DashboardCard className="p-5 xl:col-span-2">
                  <h3 className="font-bold text-slate-900 dark:text-white">Validated Similarity Quality Metrics</h3>
                  <p className="mt-1 text-sm text-slate-500">Accuracy, precision, recall, and Macro F1 calculated from current authorised-reviewer labels and marked preliminary where appropriate.</p>
                  <div className="mt-4 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={similarityEvaluationRows.map(row => ({ model: row.modelLabel, accuracy: Number(row.accuracy || 0) * 100, precision: Number(row.precision || 0) * 100, recall: Number(row.recall || 0) * 100, f1: Number(row.macro_f1_score || 0) * 100 }))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="model"/><YAxis domain={[0, 100]}/><Tooltip/><Bar dataKey="accuracy" name="Accuracy" fill="#2563eb"/><Bar dataKey="precision" name="Precision" fill="#16a34a"/><Bar dataKey="recall" name="Recall" fill="#f59e0b"/><Bar dataKey="f1" name="Macro F1" fill="#7c3aed"/></BarChart></ResponsiveContainer></div>
                </DashboardCard>}
              </div>}

              {modelReportCategory === 'supervisor' && modelReportView === 'reports' && <DashboardCard className="overflow-hidden">
                <div className="border-b border-slate-200 p-5 dark:border-slate-700">
                  <h3 className="font-bold text-slate-900 dark:text-white">Supervisor-Matching Model Comparison</h3>
                  <p className="mt-1 text-sm text-slate-500">Compares each model before and after workload/capacity adjustment.</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50">
                      <tr><th className="p-3">Model</th><th className="p-3">Supervisor comparisons</th><th className="p-3">Average semantic score</th><th className="p-3">Average adjusted score</th><th className="p-3">Average execution time</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                      {(researchAnalytics.supervisorModelSummary || []).map((row: any) => (
                        <tr key={row.model}>
                          <td className="p-3 font-black text-slate-900 dark:text-white">{modelLabels[row.model] || row.model}</td>
                          <td className="p-3">{Number(row.records || 0).toLocaleString()}</td>
                          <td className="p-3">{reportNumber(row.averageSemanticScore)}%</td>
                          <td className="p-3">{reportNumber(row.averageAdjustedScore)}%</td>
                          <td className="p-3">{reportNumber(row.averageTimeMs)} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </DashboardCard>}

              {modelReportCategory === 'supervisor' && modelReportView === 'visuals' && <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <DashboardCard className="p-5">
                  <h3 className="font-bold text-slate-900 dark:text-white">Supervisor Score Comparison by Model</h3>
                  <p className="mt-1 text-sm text-slate-500">Pure semantic fit compared with the final capacity-adjusted recommendation score.</p>
                  <div className="mt-4 h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(researchAnalytics.supervisorModelSummary || []).map((row: any) => ({
                        model: modelLabels[row.model] || row.model,
                        semantic: Number(row.averageSemanticScore || 0),
                        adjusted: Number(row.averageAdjustedScore || 0),
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                        <XAxis dataKey="model" tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                        <YAxis domain={[0, 100]} tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                        <Tooltip />
                        <Bar dataKey="semantic" name="Semantic score" fill="#2563eb" radius={[5, 5, 0, 0]} />
                        <Bar dataKey="adjusted" name="Adjusted score" fill="#16a34a" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </DashboardCard>

                <DashboardCard className="p-5">
                  <h3 className="font-bold text-slate-900 dark:text-white">Supervisor Experiment Processing Time</h3>
                  <p className="mt-1 text-sm text-slate-500">Average measured execution time for all supervisor comparisons.</p>
                  <div className="mt-4 h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={(researchAnalytics.supervisorModelSummary || []).map((row: any) => ({
                        model: modelLabels[row.model] || row.model,
                        time: Number(row.averageTimeMs || 0),
                        records: Number(row.records || 0),
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                        <XAxis dataKey="model" tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b', fontSize: 11 }} />
                        <YAxis tick={{ fill: theme === 'dark' ? '#94a3b8' : '#64748b' }} />
                        <Tooltip />
                        <Bar dataKey="time" name="Average time (ms)" fill="#7c3aed" radius={[5, 5, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </DashboardCard>
                {supervisorEvaluationRows.some(row => Number(row.sampleSize || 0) > 0) && <DashboardCard className="p-5 xl:col-span-2">
                  <h3 className="font-bold text-slate-900 dark:text-white">Expert-Labelled Supervisor Assignment Quality</h3>
                  <p className="mt-1 text-sm text-slate-500">Accuracy, precision, recall, and F1 for every assignment model using saved expert relevance labels.</p>
                  <div className="mt-4 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={supervisorEvaluationRows.map(row => ({ model: row.modelLabel, accuracy: Number(row.accuracy || 0) * 100, precision: Number(row.precision || 0) * 100, recall: Number(row.recall || 0) * 100, f1: Number(row.f1Score || 0) * 100 }))}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="model"/><YAxis domain={[0, 100]}/><Tooltip/><Bar dataKey="accuracy" name="Accuracy" fill="#2563eb"/><Bar dataKey="precision" name="Precision" fill="#16a34a"/><Bar dataKey="recall" name="Recall" fill="#f59e0b"/><Bar dataKey="f1" name="F1" fill="#7c3aed"/></BarChart></ResponsiveContainer></div>
                </DashboardCard>}
              </div>}

              {modelReportCategory === 'similarity' && modelReportView === 'reports' && <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <DashboardCard className="overflow-hidden">
                  <div className="border-b border-slate-200 p-5 dark:border-slate-700">
                    <h3 className="font-bold text-slate-900 dark:text-white">Academic Field Score Comparison</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50"><tr><th className="p-3">Project field</th>{(researchAnalytics.models || []).map((model: string) => <th key={model} className="p-3">{modelLabels[model] || model}</th>)}</tr></thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {(researchAnalytics.fieldAverages || []).map((row: any) => <tr key={row.field}><td className="p-3 font-semibold">{row.fieldLabel}</td>{(researchAnalytics.models || []).map((model: string) => <td key={model} className="p-3">{reportNumber(row[model])}%</td>)}</tr>)}
                      </tbody>
                    </table>
                  </div>
                </DashboardCard>

                <DashboardCard className="overflow-hidden">
                  <div className="border-b border-slate-200 p-5 dark:border-slate-700">
                    <h3 className="font-bold text-slate-900 dark:text-white">Risk Classification by Model</h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[620px] text-left text-sm">
                      <thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50"><tr><th className="p-3">Risk level</th>{(researchAnalytics.models || []).map((model: string) => <th key={model} className="p-3">{modelLabels[model] || model}</th>)}</tr></thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                        {(researchAnalytics.riskDistribution || []).map((row: any) => <tr key={row.risk}><td className="p-3 font-semibold">{row.risk}</td>{(researchAnalytics.models || []).map((model: string) => <td key={model} className="p-3">{Number(row[model] || 0).toLocaleString()}</td>)}</tr>)}
                      </tbody>
                    </table>
                  </div>
                </DashboardCard>
              </div>}

              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                {modelReportCategory === 'similarity' && modelReportView === 'reports' && <DashboardCard className="overflow-hidden">
                  <div className="border-b border-slate-200 p-5 dark:border-slate-700">
                    <h3 className="font-bold text-slate-900 dark:text-white">Inter-Model Correlation</h3>
                    <p className="mt-1 text-sm text-slate-500">Pearson agreement of project-pair similarity scores.</p>
                  </div>
                  <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50"><tr><th className="p-3">Model</th>{(researchAnalytics.models || []).map((model: string) => <th key={model} className="p-3">{modelLabels[model] || model}</th>)}</tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700">{(researchAnalytics.correlations || []).map((row: any) => <tr key={row.model}><td className="p-3 font-semibold">{row.modelLabel}</td>{(researchAnalytics.models || []).map((model: string) => <td key={model} className="p-3">{reportNumber(row[model], 4)}</td>)}</tr>)}</tbody></table></div>
                </DashboardCard>}

                {modelReportCategory === 'supervisor' && modelReportView === 'reports' && <DashboardCard className="overflow-hidden">
                  <div className="border-b border-slate-200 p-5 dark:border-slate-700">
                    <h3 className="font-bold text-slate-900 dark:text-white">Supervisor Capacity Comparison</h3>
                    <p className="mt-1 text-sm text-slate-500">Assignment load and remaining supervision capacity.</p>
                  </div>
                  <div className="max-h-96 overflow-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="sticky top-0 bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900"><tr><th className="p-3">Supervisor</th><th className="p-3">Assigned</th><th className="p-3">Capacity</th><th className="p-3">Available</th><th className="p-3">Utilization</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700">{supervisorComparisonRows.map((row: any) => <tr key={row.supervisorId}><td className="p-3"><span className="font-bold text-slate-900 dark:text-white">{row.supervisorName}</span><br/><span className="text-xs text-slate-400">{row.supervisorCode || '-'}</span></td><td className="p-3">{row.assignedProjects}</td><td className="p-3">{row.maximumCapacity}</td><td className="p-3">{row.availableCapacity}</td><td className="p-3 font-bold">{reportNumber(row.utilizationPercentage)}%</td></tr>)}</tbody></table></div>
                </DashboardCard>}
              </div>

              {modelReportCategory === 'similarity' && modelReportView === 'reports' && <DashboardCard className="overflow-hidden">
                <div className="border-b border-slate-200 p-5 dark:border-slate-700">
                  <h3 className="font-bold text-slate-900 dark:text-white">Largest Model Disagreements</h3>
                  <p className="mt-1 text-sm text-slate-500">Project pairs that should receive additional academic review because model scores differ most.</p>
                </div>
                <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50"><tr><th className="p-3">First project</th><th className="p-3">Second project</th>{(researchAnalytics.models || []).map((model: string) => <th key={model} className="p-3">{modelLabels[model] || model}</th>)}<th className="p-3">Maximum difference</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700">{(researchAnalytics.disagreements || []).slice(0, 10).map((row: any) => <tr key={row.pairKey}><td className="p-3 font-medium">{row.firstProjectTitle}</td><td className="p-3 font-medium">{row.secondProjectTitle}</td>{(researchAnalytics.models || []).map((model: string) => <td key={model} className="p-3">{reportNumber(row[model])}%</td>)}<td className="p-3 font-black text-orange-600">{reportNumber(row.maximumDifference)}%</td></tr>)}</tbody></table></div>
              </DashboardCard>}

              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
                <strong>Evaluation boundary:</strong>{' '}
                {modelReportCategory === 'supervisor'
                  ? researchAnalytics.supervisorEvaluation?.note || 'Save expert supervisor relevance labels before selecting the best assignment model.'
                  : researchAnalytics.evaluation?.note || researchOverview?.groundTruthStatus || 'Similarity ground-truth status is unavailable.'}
              </div>
            </>
          )}
        </div>
      )}

      {/* Students Tab */}
      {activeTab === 'students' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <DashboardCard className="admin-dashboard-mini-card p-4 text-center">
              <p className="admin-dashboard-mini-value text-3xl font-black text-blue-600">{students.length}</p>
              <p className="text-xs text-slate-500 uppercase font-bold">Total Students</p>
            </DashboardCard>
            <DashboardCard className="admin-dashboard-mini-card p-4 text-center">
              <p className="admin-dashboard-mini-value text-3xl font-black text-green-600">{statusCounts.completed}</p>
              <p className="text-xs text-slate-500 uppercase font-bold">Completed Projects</p>
            </DashboardCard>
            <DashboardCard className="admin-dashboard-mini-card p-4 text-center">
              <p className="admin-dashboard-mini-value text-3xl font-black text-indigo-600">{statusCounts.inProgress}</p>
              <p className="text-xs text-slate-500 uppercase font-bold">In Progress</p>
            </DashboardCard>
            <DashboardCard className="admin-dashboard-mini-card p-4 text-center">
              <p className="admin-dashboard-mini-value text-3xl font-black text-orange-600">{unassignedProjects}</p>
              <p className="text-xs text-slate-500 uppercase font-bold">Awaiting Supervisor</p>
            </DashboardCard>
          </div>
          
          <DashboardCard className="overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="font-bold text-lg dark:text-white">Student Project Status</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Student</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Project</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Department</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Status</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Supervisor</th>
                    <th className="p-3 text-xs font-bold text-slate-400 uppercase">Submitted</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                  {filteredProjects.map(project => (
                    <tr key={project.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold text-sm">
                            {project.studentName?.charAt(0) || '?'}
                          </div>
                          <span className="font-medium text-slate-700 dark:text-white text-sm">{project.studentName}</span>
                        </div>
                      </td>
                      <td className="p-3 text-sm text-slate-600 dark:text-slate-400 max-w-xs truncate">{project.title}</td>
                      <td className="p-3 text-sm text-slate-600 dark:text-slate-400">{departmentName(getProjectDepartmentId(project))}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded-lg text-[10px] font-bold uppercase ${
                          project.status === ProjectStatus.COMPLETED ? 'bg-green-100 text-green-700' :
                          project.status === ProjectStatus.IN_PROGRESS ? 'bg-indigo-100 text-indigo-700' :
                          project.status === ProjectStatus.APPROVED ? 'bg-emerald-100 text-emerald-700' :
                          project.status === ProjectStatus.UNDER_REVIEW ? 'bg-yellow-100 text-yellow-700' :
                          project.status === ProjectStatus.SUBMITTED ? 'bg-blue-100 text-blue-700' :
                          project.status === ProjectStatus.CHANGES_REQUESTED ? 'bg-orange-100 text-orange-700' :
                          project.status === ProjectStatus.REJECTED ? 'bg-red-100 text-red-700' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {project.status}
                        </span>
                      </td>
                      <td className="p-3 text-sm text-slate-600 dark:text-slate-400">
                        {allSupervisors.find(s => s.id === project.supervisorId)?.name || 
                          <span className="text-orange-500 italic">-</span>
                        }
                      </td>
                      <td className="p-3 text-xs text-slate-400">{project.submissionDate || '-'}</td>
                    </tr>
                  ))}
                  {!filteredProjects.length && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                        No student projects found for this faculty and department.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </DashboardCard>
        </div>
      )}
    </div>
  );
};

type SimilarityRiskLevel = 'Low' | 'Medium' | 'High';

interface SimilarityComparisonRow {
  id: string;
  firstProjectTitle: string;
  secondProjectTitle: string;
  similarityPercentage: number;
  riskLevel: SimilarityRiskLevel;
  riskLabel: string;
  comparisonDate: string;
  firstFacultyName?: string;
  firstDepartmentName?: string;
  secondFacultyName?: string;
  secondDepartmentName?: string;
}

interface SimilarityAnalysisData {
  summary: {
    totalComparisons: number;
    averageSimilarity: number;
    highestSimilarity: number;
    lowestSimilarity: number;
    medianSimilarity: number;
    standardDeviation: number;
    riskCounts: Record<SimilarityRiskLevel, number>;
  };
  riskCategories: Array<{
    riskLevel: SimilarityRiskLevel;
    label: string;
    range: string;
    count: number;
    percentage: number;
    explanation: string;
  }>;
  comparisons: SimilarityComparisonRow[];
  charts: {
    riskBar: Array<{ name: string; count: number; riskLevel: SimilarityRiskLevel }>;
    riskDistribution: Array<{ name: string; value: number; percentage: number; riskLevel: SimilarityRiskLevel }>;
    topPairs: Array<{ pair: string; similarityPercentage: number; riskLevel: SimilarityRiskLevel }>;
  };
  decisionSupportNotice?: string;
}

interface AllProjectsComparisonRow {
  id: string;
  project1Title: string;
  project2Title: string;
  similarityPercentage: number;
  riskLevel: SimilarityRiskLevel;
  riskLabel: string;
  faculty: string;
  department: string;
  academicYear: string;
  comparisonDate: string;
}

interface AllProjectsAnalysisData {
  summary: {
    totalProjectsAnalysed: number;
    expectedUniqueComparisons: number;
    actualComparisonsCompleted: number;
    filteredComparisons: number;
    isComplete: boolean;
    completionWarning?: string;
    averageSimilarity: number;
    medianSimilarity: number;
    highestSimilarity: number;
    lowestSimilarity: number;
    standardDeviation: number;
    riskCounts: Record<SimilarityRiskLevel, number>;
    generatedAt?: string;
  };
  riskCategories: Array<{
    riskLevel: SimilarityRiskLevel;
    label: string;
    range: string;
    count: number;
    percentage: number;
    explanation: string;
  }>;
  comparisons: AllProjectsComparisonRow[];
  images?: {
    heatmap?: string;
    topPairsBar?: string;
    riskDistribution?: string;
    histogram?: string;
  };
  exports?: {
    comparisonsCsv?: string;
    matrixCsv?: string;
    heatmapPng?: string;
    topPairsPng?: string;
    riskDistributionPng?: string;
    histogramPng?: string;
    pdfReport?: string;
  };
  decisionSupportNotice?: string;
}

const emptySimilarityAnalysis: SimilarityAnalysisData = {
  summary: {
    totalComparisons: 0,
    averageSimilarity: 0,
    highestSimilarity: 0,
    lowestSimilarity: 0,
    medianSimilarity: 0,
    standardDeviation: 0,
    riskCounts: { Low: 0, Medium: 0, High: 0 },
  },
  riskCategories: [],
  comparisons: [],
  charts: { riskBar: [], riskDistribution: [], topPairs: [] },
};

const emptyAllProjectsAnalysis: AllProjectsAnalysisData = {
  summary: {
    totalProjectsAnalysed: 0,
    expectedUniqueComparisons: 0,
    actualComparisonsCompleted: 0,
    filteredComparisons: 0,
    isComplete: true,
    averageSimilarity: 0,
    medianSimilarity: 0,
    highestSimilarity: 0,
    lowestSimilarity: 0,
    standardDeviation: 0,
    riskCounts: { Low: 0, Medium: 0, High: 0 },
  },
  riskCategories: [],
  comparisons: [],
  images: {},
  exports: {},
};

// --- 6. SIMILARITY RESULTS PAGE ---
export const AdminSimilarityResults: React.FC = () => {
  const { theme, faculties, departments } = useStore();
  const [analysis, setAnalysis] = useState<SimilarityAnalysisData>(emptySimilarityAnalysis);
  const [allProjectsAnalysis, setAllProjectsAnalysis] = useState<AllProjectsAnalysisData>(emptyAllProjectsAnalysis);
  const [isLoading, setIsLoading] = useState(false);
  const [isAllProjectsLoading, setIsAllProjectsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [allProjectsErrorMessage, setAllProjectsErrorMessage] = useState('');
  const [filters, setFilters] = useState({
    riskLevel: '',
    title: '',
    facultyId: '',
    departmentId: '',
    startDate: '',
    endDate: '',
  });

  const activeFaculties = faculties.filter(faculty => faculty.isActive !== false);
  const departmentOptions = departments.filter(department => (
    department.isActive !== false && (!filters.facultyId || refId(department.facultyId) === filters.facultyId)
  ));

  const riskColor = (risk: SimilarityRiskLevel) => {
    if (risk === 'High') return '#ef4444';
    if (risk === 'Medium') return '#f59e0b';
    return '#22c55e';
  };

  const riskBadgeClass = (risk: SimilarityRiskLevel) => {
    if (risk === 'High') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    if (risk === 'Medium') return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-300';
    return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
  };

  const cleanFilters = (sourceFilters = filters) => Object.fromEntries(
    Object.entries(sourceFilters).filter(([, value]) => value)
  );

  const loadAnalysis = async (sourceFilters = filters) => {
    setIsLoading(true);
    setErrorMessage('');
    try {
      const response = await similarityResultsAPI.getAnalysis(cleanFilters(sourceFilters));
      setAnalysis(response.data || emptySimilarityAnalysis);
    } catch (error: any) {
      setErrorMessage(error?.response?.data?.message || error?.message || 'Could not load similarity analysis.');
      setAnalysis(emptySimilarityAnalysis);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllProjectsAnalysis = async (sourceFilters = filters) => {
    setIsAllProjectsLoading(true);
    setAllProjectsErrorMessage('');
    try {
      const response = await similarityResultsAPI.getAllProjectsAnalysis(cleanFilters(sourceFilters));
      setAllProjectsAnalysis(response.data || emptyAllProjectsAnalysis);
    } catch (error: any) {
      setAllProjectsErrorMessage(error?.response?.data?.message || error?.message || 'Could not load all-project similarity visual analysis.');
      setAllProjectsAnalysis(emptyAllProjectsAnalysis);
    } finally {
      setIsAllProjectsLoading(false);
    }
  };

  useEffect(() => {
    void loadAnalysis();
  }, []);

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const exportCsv = () => {
    const headers = [
      'First Project Title',
      'Second Project Title',
      'Similarity Percentage',
      'Risk Level',
      'Comparison Date',
      'First Faculty',
      'First Department',
      'Second Faculty',
      'Second Department',
    ];
    const escapeCsv = (value: any) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = analysis.comparisons.map(row => [
      row.firstProjectTitle,
      row.secondProjectTitle,
      row.similarityPercentage,
      row.riskLabel,
      formatDate(row.comparisonDate),
      row.firstFacultyName || '',
      row.firstDepartmentName || '',
      row.secondFacultyName || '',
      row.secondDepartmentName || '',
    ]);
    const csv = [headers, ...rows].map(row => row.map(escapeCsv).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `similarity-results-${new Date().toISOString().split('T')[0]}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const downloadFile = (url?: string) => {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const topPairsData = analysis.charts.topPairs.map((item, index) => ({
    ...item,
    label: `${index + 1}. ${item.pair}`,
  }));
  const hasAllProjectsReport = allProjectsAnalysis.summary.totalProjectsAnalysed > 0;

  const SimilarityTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    const item = payload[0]?.payload || {};
    return (
      <div className="similarity-chart-tooltip bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl rounded-xl p-3">
        <p className="font-bold text-slate-900 dark:text-white">{item.pair || label}</p>
        <p className="text-sm text-blue-600 dark:text-blue-400 font-black mt-1">
          Similarity: {item.similarityPercentage ?? payload[0]?.value}%
        </p>
        {item.riskLevel && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{item.riskLevel} Risk</p>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Similarity Intelligence</p>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white mt-1">Similarity Results</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            Analysis of existing project comparison results. Risk levels support review decisions; they are not automatic plagiarism decisions.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCsv}
          disabled={!analysis.comparisons.length}
          className="px-4 py-2 bg-slate-900 dark:bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700 transition-colors disabled:opacity-50"
        >
          <Download size={18} /> Export CSV
        </button>
      </div>

      <DashboardCard className="p-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void loadAnalysis();
          }}
          className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-3 gap-4"
        >
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Risk Level</label>
            <select
              value={filters.riskLevel}
              onChange={event => setFilters({ ...filters, riskLevel: event.target.value })}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white outline-none"
            >
              <option value="">All Risk Levels</option>
              <option value="Low">Low Risk</option>
              <option value="Medium">Medium Risk</option>
              <option value="High">High Risk</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Project Title</label>
            <input
              value={filters.title}
              onChange={event => setFilters({ ...filters, title: event.target.value })}
              placeholder="Search either project title"
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Faculty</label>
            <select
              value={filters.facultyId}
              onChange={event => setFilters({ ...filters, facultyId: event.target.value, departmentId: '' })}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white outline-none"
            >
              <option value="">All Faculties</option>
              {activeFaculties.map(faculty => (
                <option key={refId(faculty)} value={refId(faculty)}>{faculty.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Department</label>
            <select
              value={filters.departmentId}
              onChange={event => setFilters({ ...filters, departmentId: event.target.value })}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white outline-none"
            >
              <option value="">All Departments</option>
              {departmentOptions.map(department => (
                <option key={refId(department)} value={refId(department)}>{department.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">From Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={event => setFilters({ ...filters, startDate: event.target.value })}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">To Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={event => setFilters({ ...filters, endDate: event.target.value })}
              className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white outline-none"
            />
          </div>
          <div className="flex gap-3 col-span-full">
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700">
              {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />} Apply Filters
            </button>
            <button
              type="button"
              onClick={() => {
                const emptyFilters = { riskLevel: '', title: '', facultyId: '', departmentId: '', startDate: '', endDate: '' };
                setFilters(emptyFilters);
                void loadAnalysis(emptyFilters);
              }}
              className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2"
            >
              <RefreshCw size={18} /> Reset
            </button>
          </div>
        </form>
      </DashboardCard>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
          {errorMessage}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
        {[
          ['Total Comparisons', analysis.summary.totalComparisons],
          ['Average Similarity', `${analysis.summary.averageSimilarity}%`],
          ['Highest Similarity', `${analysis.summary.highestSimilarity}%`],
          ['Lowest Similarity', `${analysis.summary.lowestSimilarity}%`],
          ['Median Score', `${analysis.summary.medianSimilarity}%`],
          ['Std. Deviation', analysis.summary.standardDeviation],
        ].map(([label, value]) => (
          <DashboardCard key={label} className="admin-dashboard-mini-card p-4 text-center">
            <p className="admin-dashboard-mini-value text-3xl font-black text-blue-600">{value}</p>
            <p className="text-xs text-slate-500 uppercase font-bold">{label}</p>
          </DashboardCard>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {analysis.riskCategories.map(category => (
          <DashboardCard key={category.riskLevel} className="p-5">
            <div className="flex items-center justify-between mb-2">
              <span className={`px-3 py-1 rounded-full text-xs font-black ${riskBadgeClass(category.riskLevel)}`}>
                {category.label}
              </span>
              <span className="text-sm font-bold text-slate-500">{category.range}</span>
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white">{category.count}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{category.explanation}</p>
          </DashboardCard>
        ))}
      </div>

      <DashboardCard className="p-4 border-l-4 border-l-blue-500">
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {analysis.decisionSupportNotice || 'Similarity risk is decision-support information only. Supervisors and administrators make the final academic decision.'}
        </p>
      </DashboardCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DashboardCard className="p-6">
          <h3 className="font-bold text-lg dark:text-white mb-4">Comparisons by Risk Category</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analysis.charts.riskBar}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                <XAxis dataKey="name" tick={{ fill: theme === 'dark' ? '#cbd5e1' : '#475569', fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: theme === 'dark' ? '#cbd5e1' : '#475569', fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                  {analysis.charts.riskBar.map(item => <Cell key={item.riskLevel} fill={riskColor(item.riskLevel)} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>

        <DashboardCard className="p-6">
          <h3 className="font-bold text-lg dark:text-white mb-4">Risk Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={analysis.charts.riskDistribution.filter(item => item.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={86}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percentage }) => `${name}: ${percentage}%`}
                >
                  {analysis.charts.riskDistribution.map(item => <Cell key={item.riskLevel} fill={riskColor(item.riskLevel)} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </DashboardCard>
      </div>

      <DashboardCard className="p-6">
        <h3 className="font-bold text-lg dark:text-white mb-4">Highest Similarity Project Pairs</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={topPairsData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
              <XAxis type="number" domain={[0, 100]} tick={{ fill: theme === 'dark' ? '#cbd5e1' : '#475569', fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="label"
                width={210}
                tick={{ fill: theme === 'dark' ? '#cbd5e1' : '#475569', fontSize: 11 }}
                tickFormatter={(value) => value.length > 26 ? `${value.slice(0, 26)}...` : value}
              />
              <Tooltip content={<SimilarityTooltip />} wrapperStyle={{ outline: 'none', maxWidth: 360 }} />
              <Bar dataKey="similarityPercentage" radius={[0, 6, 6, 0]}>
                {topPairsData.map(item => <Cell key={item.label} fill={riskColor(item.riskLevel)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </DashboardCard>

      <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400">Optional Python Visual Report</p>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">Full Archive Pairwise Analysis</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              This optional report is not the stored-results total above. It compares every valid project against every other valid project, so 100 projects create 4,950 possible pairs.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadAllProjectsAnalysis()}
            className="px-4 py-2 bg-blue-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-blue-700"
          >
            {isAllProjectsLoading ? <Loader2 size={18} className="animate-spin" /> : <RefreshCw size={18} />} Generate Optional Pairwise Report
          </button>
        </div>

        <DashboardCard className="p-4 border-l-4 border-l-amber-500 bg-amber-50/70 dark:bg-amber-900/10">
          <p className="text-sm font-bold text-amber-900 dark:text-amber-200">
            Stored similarity results: {analysis.summary.totalComparisons} comparisons. Optional full archive pairs: {allProjectsAnalysis.summary.expectedUniqueComparisons || 'not generated'}.
          </p>
          <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
            Use the charts above for the real stored similarity-result data. Generate this optional section only when you want a complete archive-wide pairwise analysis.
          </p>
        </DashboardCard>

        {allProjectsErrorMessage && (
          <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
            {allProjectsErrorMessage}
          </div>
        )}

        {allProjectsAnalysis.summary.completionWarning && (
          <div className="p-4 rounded-xl bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border border-yellow-200 dark:border-yellow-300">
            {allProjectsAnalysis.summary.completionWarning}
          </div>
        )}

        {!hasAllProjectsReport ? (
          <DashboardCard className="p-8 text-center">
            <div className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 dark:text-blue-300">
              {isAllProjectsLoading ? <Loader2 className="animate-spin" size={24} /> : <BarChart3 size={24} />}
            </div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white">
              {isAllProjectsLoading ? 'Generating optional pairwise report...' : 'Optional pairwise report not generated'}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-2xl mx-auto">
              The stored-results report above is the real database result count: {analysis.summary.totalComparisons} comparisons.
              This optional report creates all possible project pairs only when you press the generate button.
            </p>
          </DashboardCard>
        ) : (
          <>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4">
          {[
            ['Projects Analysed', allProjectsAnalysis.summary.totalProjectsAnalysed],
            ['Expected Comparisons', allProjectsAnalysis.summary.expectedUniqueComparisons],
            ['Actual Completed', allProjectsAnalysis.summary.actualComparisonsCompleted],
            ['Filtered Rows', allProjectsAnalysis.summary.filteredComparisons],
            ['Average Similarity', `${allProjectsAnalysis.summary.averageSimilarity}%`],
            ['Median Score', `${allProjectsAnalysis.summary.medianSimilarity}%`],
            ['Highest Score', `${allProjectsAnalysis.summary.highestSimilarity}%`],
            ['Lowest Score', `${allProjectsAnalysis.summary.lowestSimilarity}%`],
            ['Std. Deviation', allProjectsAnalysis.summary.standardDeviation],
          ].map(([label, value]) => (
            <DashboardCard key={label} className="admin-dashboard-mini-card p-4 text-center">
              <p className="admin-dashboard-mini-value text-3xl font-black text-blue-600">{value}</p>
              <p className="text-xs text-slate-500 uppercase font-bold">{label}</p>
            </DashboardCard>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {allProjectsAnalysis.riskCategories.map(category => (
            <DashboardCard key={`all-${category.riskLevel}`} className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className={`px-3 py-1 rounded-full text-xs font-black ${riskBadgeClass(category.riskLevel)}`}>
                  {category.label}
                </span>
                <span className="text-sm font-bold text-slate-500">{category.range}</span>
              </div>
              <p className="text-2xl font-black text-slate-900 dark:text-white">{category.count}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{category.explanation}</p>
            </DashboardCard>
          ))}
        </div>

        <DashboardCard className="p-4 border-l-4 border-l-blue-500">
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {allProjectsAnalysis.decisionSupportNotice || 'High Risk does not automatically mean plagiarism or duplication. The final academic decision belongs to the supervisor or administrator.'}
          </p>
        </DashboardCard>

        <DashboardCard className="p-5">
          <div className="flex flex-wrap gap-3">
            {[
              ['Pairwise CSV', allProjectsAnalysis.exports?.comparisonsCsv],
              ['Matrix CSV', allProjectsAnalysis.exports?.matrixCsv],
              ['Heatmap PNG', allProjectsAnalysis.exports?.heatmapPng],
              ['Top Pairs PNG', allProjectsAnalysis.exports?.topPairsPng],
              ['Risk Chart PNG', allProjectsAnalysis.exports?.riskDistributionPng],
              ['Histogram PNG', allProjectsAnalysis.exports?.histogramPng],
              ['PDF Report', allProjectsAnalysis.exports?.pdfReport],
            ].map(([label, url]) => (
              <button
                key={label}
                type="button"
                onClick={() => downloadFile(url)}
                disabled={!url}
                className="px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2 disabled:opacity-50"
              >
                <Download size={16} /> {label}
              </button>
            ))}
          </div>
        </DashboardCard>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <DashboardCard className="p-5">
            <h3 className="font-bold text-lg dark:text-white mb-4">Similarity Matrix Heatmap</h3>
            {allProjectsAnalysis.images?.heatmap ? (
              <img src={allProjectsAnalysis.images.heatmap} alt="All projects similarity matrix heatmap" className="similarity-report-image" />
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                {isAllProjectsLoading ? 'Generating heatmap...' : 'No heatmap generated yet.'}
              </div>
            )}
          </DashboardCard>

          <DashboardCard className="p-5">
            <h3 className="font-bold text-lg dark:text-white mb-4">Top 10 Highest Similarity Pairs</h3>
            {allProjectsAnalysis.images?.topPairsBar ? (
              <img src={allProjectsAnalysis.images.topPairsBar} alt="Top ten highest similarity project pairs" className="similarity-report-image" />
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                {isAllProjectsLoading ? 'Generating top-pairs chart...' : 'No top-pairs chart generated yet.'}
              </div>
            )}
          </DashboardCard>

          <DashboardCard className="p-5">
            <h3 className="font-bold text-lg dark:text-white mb-4">Risk Distribution Chart</h3>
            {allProjectsAnalysis.images?.riskDistribution ? (
              <img src={allProjectsAnalysis.images.riskDistribution} alt="Risk distribution chart" className="similarity-report-image" />
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                {isAllProjectsLoading ? 'Generating risk chart...' : 'No risk chart generated yet.'}
              </div>
            )}
          </DashboardCard>

          <DashboardCard className="p-5">
            <h3 className="font-bold text-lg dark:text-white mb-4">Similarity Score Distribution Histogram</h3>
            {allProjectsAnalysis.images?.histogram ? (
              <img src={allProjectsAnalysis.images.histogram} alt="Similarity score distribution histogram" className="similarity-report-image" />
            ) : (
              <div className="h-64 flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
                {isAllProjectsLoading ? 'Generating histogram...' : 'No histogram generated yet.'}
              </div>
            )}
          </DashboardCard>
        </div>

        <DashboardCard className="overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h3 className="font-bold text-lg dark:text-white">All Unique Project Comparisons</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400">Self-comparisons and reverse duplicates are excluded.</p>
            </div>
            <span className="text-sm font-bold text-slate-500">{allProjectsAnalysis.comparisons.length} rows</span>
          </div>
          <div className="overflow-x-auto max-h-[300px] overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase">Project 1</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase">Project 2</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase">Similarity</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase">Risk</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase">Faculty</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase">Department</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase">Academic Year</th>
                  <th className="p-4 text-xs font-black text-slate-500 uppercase">Comparison Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {allProjectsAnalysis.comparisons.map(row => (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                    <td className="p-4 align-top font-bold text-slate-900 dark:text-white">{row.project1Title}</td>
                    <td className="p-4 align-top font-bold text-slate-900 dark:text-white">{row.project2Title}</td>
                    <td className="p-4 align-top text-lg font-black text-blue-600">{row.similarityPercentage}%</td>
                    <td className="p-4 align-top">
                      <span className={`px-3 py-1 rounded-full text-xs font-black ${riskBadgeClass(row.riskLevel)}`}>{row.riskLabel}</span>
                    </td>
                    <td className="p-4 align-top text-sm text-slate-600 dark:text-slate-400">{row.faculty}</td>
                    <td className="p-4 align-top text-sm text-slate-600 dark:text-slate-400">{row.department}</td>
                    <td className="p-4 align-top text-sm text-slate-600 dark:text-slate-400">{row.academicYear}</td>
                    <td className="p-4 align-top text-sm text-slate-600 dark:text-slate-400">{formatDate(row.comparisonDate)}</td>
                  </tr>
                ))}
                {!allProjectsAnalysis.comparisons.length && (
                  <tr>
                    <td colSpan={8} className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                      {isAllProjectsLoading ? 'Generating all-project comparison results...' : 'No all-project comparisons match these filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </DashboardCard>
          </>
        )}
      </div>

      <DashboardCard className="overflow-hidden">
        <div className="p-5 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h3 className="font-bold text-lg dark:text-white">Comparison Results</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">Sorted from highest similarity score to lowest.</p>
          </div>
          <span className="text-sm font-bold text-slate-500">{analysis.comparisons.length} rows</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 dark:bg-slate-900">
              <tr>
                <th className="p-4 text-xs font-black text-slate-500 uppercase">First Project</th>
                <th className="p-4 text-xs font-black text-slate-500 uppercase">Second Project</th>
                <th className="p-4 text-xs font-black text-slate-500 uppercase">Similarity</th>
                <th className="p-4 text-xs font-black text-slate-500 uppercase">Risk</th>
                <th className="p-4 text-xs font-black text-slate-500 uppercase">Comparison Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
              {analysis.comparisons.map(row => (
                <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                  <td className="p-4 align-top">
                    <p className="font-bold text-slate-900 dark:text-white">{row.firstProjectTitle}</p>
                    <p className="text-xs text-slate-500 mt-1">{row.firstFacultyName || '-'} / {row.firstDepartmentName || '-'}</p>
                  </td>
                  <td className="p-4 align-top">
                    <p className="font-bold text-slate-900 dark:text-white">{row.secondProjectTitle}</p>
                    <p className="text-xs text-slate-500 mt-1">{row.secondFacultyName || '-'} / {row.secondDepartmentName || '-'}</p>
                  </td>
                  <td className="p-4 align-top">
                    <span className="text-lg font-black text-blue-600">{row.similarityPercentage}%</span>
                  </td>
                  <td className="p-4 align-top">
                    <span className={`px-3 py-1 rounded-full text-xs font-black ${riskBadgeClass(row.riskLevel)}`}>{row.riskLabel}</span>
                  </td>
                  <td className="p-4 align-top text-sm text-slate-600 dark:text-slate-400">{formatDate(row.comparisonDate)}</td>
                </tr>
              ))}
              {!analysis.comparisons.length && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
                    {isLoading ? 'Loading similarity results...' : 'No stored similarity comparison results match these filters.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </div>
  );
};

// --- 6. USERS PAGE ---
export const AdminUsers: React.FC = () => {
  const { users, currentUser, faculties, departments } = useStore();
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [filterRole, setFilterRole] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: UserRole.STUDENT as UserRole,
    facultyId: '',
    departmentId: '',
    department: ''
  });
  const newUserDepartments = departmentsForFaculty(departments, newUser.facultyId);
  const selectedUserDepartments = departmentsForFaculty(departments, selectedUser?.facultyId);

  // Filter users based on role and search
  const filteredUsers = users.filter(u => {
    const matchesRole = filterRole === 'all' || u.role === filterRole;
    const matchesSearch = u.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          u.email.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesRole && matchesSearch;
  });

  // Stats
  const stats = {
    total: users.length,
    students: users.filter(u => u.role === UserRole.STUDENT).length,
    supervisors: users.filter(u => u.role === UserRole.SUPERVISOR).length,
    admins: users.filter(u => u.role === UserRole.ADMIN).length
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUser.name || !newUser.email || !newUser.password) return;
    
    setIsSubmitting(true);
    try {
      // Call register API
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUser.name,
          email: newUser.email,
          password: newUser.password,
          role: newUser.role.toLowerCase(),
          facultyId: newUser.facultyId || undefined,
          departmentId: newUser.departmentId || undefined,
          department: newUser.department || undefined
        })
      });
      
      if (response.ok) {
        setShowAddModal(false);
        setNewUser({ name: '', email: '', password: '', role: UserRole.STUDENT, facultyId: '', departmentId: '', department: '' });
        // Refresh page to get updated users
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to create user');
      }
    } catch (error) {
      console.error('Error creating user:', error);
      alert('Failed to create user');
    }
    setIsSubmitting(false);
  };

  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    setShowEditModal(true);
  };

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    setIsSubmitting(true);
    try {
      const response = await fetch(`http://localhost:5000/api/users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          name: selectedUser.name,
          facultyId: refId(selectedUser.facultyId),
          departmentId: refId(selectedUser.departmentId),
          department: selectedUser.department,
          role: selectedUser.role
        })
      });
      
      if (response.ok) {
        setShowEditModal(false);
        setSelectedUser(null);
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to update user');
      }
    } catch (error) {
      console.error('Error updating user:', error);
      alert('Failed to update user');
    }
    setIsSubmitting(false);
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`Are you sure you want to delete user "${userName}"? This action cannot be undone.`)) return;
    
    try {
      const response = await fetch(`http://localhost:5000/api/users/${userId}`, {
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (response.ok) {
        window.location.reload();
      } else {
        const error = await response.json();
        alert(error.message || 'Failed to delete user');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('Failed to delete user');
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">User Management</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Manage all system users, roles, and permissions</p>
        </div>
        <button 
          type="button" 
          onClick={() => setShowAddModal(true)}
          className="bg-blue-600 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all"
        >
          <UserPlus size={18}/> Add New User
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <DashboardCard className="admin-dashboard-mini-card p-4 text-center">
          <p className="admin-dashboard-mini-value text-3xl font-black text-slate-700 dark:text-white">{stats.total}</p>
          <p className="text-xs text-slate-500 uppercase font-bold">Total Users</p>
        </DashboardCard>
        <DashboardCard className="admin-dashboard-mini-card p-4 text-center border-l-4 border-l-blue-500">
          <p className="admin-dashboard-mini-value text-3xl font-black text-blue-600">{stats.students}</p>
          <p className="text-xs text-slate-500 uppercase font-bold">Students</p>
        </DashboardCard>
        <DashboardCard className="admin-dashboard-mini-card p-4 text-center border-l-4 border-l-purple-500">
          <p className="admin-dashboard-mini-value text-3xl font-black text-purple-600">{stats.supervisors}</p>
          <p className="text-xs text-slate-500 uppercase font-bold">Supervisors</p>
        </DashboardCard>
        <DashboardCard className="admin-dashboard-mini-card p-4 text-center border-l-4 border-l-red-500">
          <p className="admin-dashboard-mini-value text-3xl font-black text-red-600">{stats.admins}</p>
          <p className="text-xs text-slate-500 uppercase font-bold">Admins</p>
        </DashboardCard>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none min-w-[150px]"
        >
          <option value="all">All Roles</option>
          <option value={UserRole.STUDENT}>Students</option>
          <option value={UserRole.SUPERVISOR}>Supervisors</option>
          <option value={UserRole.ADMIN}>Admins</option>
        </select>
      </div>

      {/* Users Table */}
      <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-sm">
        <table className="w-full text-left">
          <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-700">
            <tr>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Identity</th>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Role</th>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Department</th>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Status</th>
              <th className="p-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
             {filteredUsers.length === 0 ? (
               <tr>
                 <td colSpan={5} className="p-8 text-center text-slate-400">
                   No users found matching your criteria
                 </td>
               </tr>
             ) : (
               filteredUsers.map(u => (
                 <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                   <td className="p-4">
                     <div className="flex items-center gap-3">
                       <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold shadow-sm ${
                         u.role === UserRole.ADMIN ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                         u.role === UserRole.SUPERVISOR ? 'bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400' :
                         'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
                       }`}>{u.name.charAt(0)}</div>
                       <div>
                         <span className="block font-bold text-slate-700 dark:text-white">{u.name}</span>
                         <span className="text-[10px] text-slate-400 uppercase tracking-tighter">{u.email}</span>
                       </div>
                     </div>
                   </td>
                   <td className="p-4">
                     <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                       u.role === UserRole.ADMIN ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 
                       u.role === UserRole.SUPERVISOR ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 
                       'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                     }`}>
                       {u.role}
                     </span>
                   </td>
                   <td className="p-4 text-sm text-slate-500 dark:text-slate-400">{u.department || 'N/A'}</td>
                   <td className="p-4">
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-xs font-bold text-green-600">Active</span>
                      </div>
                   </td>
                   <td className="p-4">
                     <div className="flex items-center justify-end gap-2">
                       <button
                         type="button"
                         onClick={() => handleEditUser(u)}
                         className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                         title="Edit User"
                       >
                         <Settings2 size={16} />
                       </button>
                       {u.id !== currentUser?.id && (
                         <button
                           type="button"
                           onClick={() => handleDeleteUser(u.id, u.name)}
                           className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                           title="Delete User"
                         >
                           <Trash2 size={16} />
                         </button>
                       )}
                     </div>
                   </td>
                 </tr>
               ))
             )}
          </tbody>
        </table>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <UserPlus size={24} className="text-blue-600" /> Add New User
              </h2>
            </div>
            <form onSubmit={handleAddUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Full Name</label>
                <input
                  required
                  type="text"
                  value={newUser.name}
                  onChange={(e) => setNewUser({...newUser, name: e.target.value})}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Email</label>
                <input
                  required
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="john@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Password</label>
                <input
                  required
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="••••••••"
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Role</label>
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({...newUser, role: e.target.value as UserRole})}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value={UserRole.STUDENT}>Student</option>
                  <option value={UserRole.SUPERVISOR}>Supervisor</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </select>
              </div>
              {newUser.role !== UserRole.ADMIN && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Faculty</label>
                    <select
                      value={newUser.facultyId}
                      onChange={(e) => setNewUser({...newUser, facultyId: e.target.value, departmentId: '', department: ''})}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Select Faculty</option>
                      {faculties.map(faculty => (
                        <option key={refId(faculty)} value={refId(faculty)}>{faculty.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Department</label>
                    <select
                      value={newUser.departmentId}
                      onChange={(e) => {
                        const department = departments.find(item => refId(item) === e.target.value);
                        setNewUser({...newUser, departmentId: e.target.value, department: department?.name || ''});
                      }}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      disabled={!newUser.facultyId}
                    >
                      <option value="">Select Department</option>
                      {newUserDepartments.map(department => (
                        <option key={refId(department)} value={refId(department)}>{department.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <UserPlus size={18} />}
                  {isSubmitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && selectedUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowEditModal(false)}>
          <div className="bg-white dark:bg-slate-800 rounded-2xl max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Settings2 size={24} className="text-blue-600" /> Edit User
              </h2>
            </div>
            <form onSubmit={handleUpdateUser} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Full Name</label>
                <input
                  required
                  type="text"
                  value={selectedUser.name}
                  onChange={(e) => setSelectedUser({...selectedUser, name: e.target.value})}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Email</label>
                <input
                  type="email"
                  value={selectedUser.email}
                  disabled
                  className="w-full p-3 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 cursor-not-allowed"
                />
                <p className="text-[10px] text-slate-400 mt-1">Email cannot be changed</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Role</label>
                <select
                  value={selectedUser.role}
                  onChange={(e) => setSelectedUser({...selectedUser, role: e.target.value as UserRole})}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  disabled={selectedUser.id === currentUser?.id}
                >
                  <option value={UserRole.STUDENT}>Student</option>
                  <option value={UserRole.SUPERVISOR}>Supervisor</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </select>
                {selectedUser.id === currentUser?.id && (
                  <p className="text-[10px] text-orange-500 mt-1">You cannot change your own role</p>
                )}
              </div>
              {selectedUser.role !== UserRole.ADMIN && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Faculty</label>
                    <select
                      value={refId(selectedUser.facultyId)}
                      onChange={(e) => setSelectedUser({...selectedUser, facultyId: e.target.value, departmentId: '', department: ''})}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                      <option value="">Select Faculty</option>
                      {faculties.map(faculty => (
                        <option key={refId(faculty)} value={refId(faculty)}>{faculty.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Department</label>
                    <select
                      value={refId(selectedUser.departmentId)}
                      onChange={(e) => {
                        const department = departments.find(item => refId(item) === e.target.value);
                        setSelectedUser({...selectedUser, departmentId: e.target.value, department: department?.name || ''});
                      }}
                      className="w-full p-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                      disabled={!refId(selectedUser.facultyId)}
                    >
                      <option value="">Select Department</option>
                      {selectedUserDepartments.map(department => (
                        <option key={refId(department)} value={refId(department)}>{department.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => { setShowEditModal(false); setSelectedUser(null); }}
                  className="flex-1 py-3 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-bold hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                  {isSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
