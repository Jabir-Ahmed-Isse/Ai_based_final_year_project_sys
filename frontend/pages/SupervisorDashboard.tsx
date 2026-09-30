import React, { useState } from 'react';
import { useStore } from '../store';
import { ProjectStatus, ProjectProposal } from '../types';
import { useNavigate } from 'react-router-dom';
import { AnnouncementsBanner } from '../components/AnnouncementsBanner';
import { 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Search,
  MessageSquare,
  FileText,
  ShieldCheck,
  Inbox,
  Users,
  Layout,
  Clock,
  ArrowRight,
  TrendingUp,
  Calendar
} from 'lucide-react';

export const SupervisorLanding: React.FC = () => {
  const { currentUser, projects } = useStore();
  const navigate = useNavigate();

  // Metrics Calculation
  const myProjects = projects.filter(p => p.supervisorId === currentUser?.id);
  const pendingReviews = projects.filter(p => 
    (p.status === ProjectStatus.SUBMITTED || p.status === ProjectStatus.UNDER_REVIEW) && 
    p.supervisorId === currentUser?.id
  ).length;
  
  const activeStudents = myProjects.filter(p => 
    p.status === ProjectStatus.APPROVED || p.status === ProjectStatus.IN_PROGRESS
  ).length;

  const completedProjects = myProjects.filter(p => p.status === ProjectStatus.COMPLETED).length;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-12">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-900 to-indigo-900 text-white pb-24 pt-12 px-8 rounded-b-[3rem] shadow-xl">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="md:w-1/2 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-800/50 border border-blue-700 text-blue-200 text-xs font-semibold backdrop-blur-sm">
              <ShieldCheck size={14} /> Supervisor Portal
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">
              Academic <br/> <span className="text-blue-400">Excellence.</span>
            </h1>
            <p className="text-blue-100 text-lg leading-relaxed max-w-lg">
              Welcome, {currentUser?.name}. Manage student research, ensure academic integrity, and guide the next generation of innovators at Hormuud University.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              <button 
                type="button"
                onClick={() => navigate('/supervisor/reviews')}
                className="bg-white text-blue-900 px-6 py-3 rounded-xl font-bold hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
              >
                Review Proposals <Inbox size={18} />
              </button>
              <button 
                type="button"
                onClick={() => navigate('/supervisor/students')}
                className="bg-blue-800/50 text-white border border-blue-700 px-6 py-3 rounded-xl font-bold hover:bg-blue-800 transition-colors flex items-center justify-center gap-2"
              >
                My Students <Users size={18} />
              </button>
            </div>
          </div>
          
          <div className="hidden md:block md:w-5/12 bg-white/10 backdrop-blur-sm border border-white/20 p-6 rounded-2xl shadow-2xl">
            <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
              <TrendingUp size={20} className="text-blue-300"/> Key Metrics
            </h3>
            <div className="grid grid-cols-2 gap-4">
               <div className="bg-blue-900/50 p-4 rounded-xl border border-blue-800">
                  <p className="text-xs text-blue-300 uppercase">Pending Reviews</p>
                  <p className="text-3xl font-bold mt-1">{pendingReviews}</p>
               </div>
               <div className="bg-blue-900/50 p-4 rounded-xl border border-blue-800">
                  <p className="text-xs text-blue-300 uppercase">Active Students</p>
                  <p className="text-3xl font-bold mt-1">{activeStudents}</p>
               </div>
               <div className="bg-blue-900/30 p-4 rounded-xl border border-blue-800/50 col-span-2 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-blue-300 uppercase">Projects Completed</p>
                    <p className="text-xl font-bold mt-1">{completedProjects}</p>
                  </div>
                  <div className="h-10 w-10 bg-green-500/20 rounded-full flex items-center justify-center text-green-400">
                    <CheckCircle size={20} />
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 -mt-16 relative z-10">
        {/* Announcements Banner */}
        <AnnouncementsBanner />
        
        {/* Quick Access Grid */}
        <div className="grid md:grid-cols-3 gap-6">
          <button 
            type="button"
            onClick={() => navigate('/supervisor/reviews')} 
            className="group bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:shadow-lg transition-all text-left"
          >
            <div className="w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-4 group-hover:scale-110 transition-transform">
              <Inbox size={24} />
            </div>
            <div className="flex justify-between items-start">
               <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Proposal Inbox</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm">Review new submissions, check AI similarity scores, and approve topics.</p>
               </div>
               {pendingReviews > 0 && (
                   <span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">{pendingReviews}</span>
               )}
            </div>
          </button>

          <button 
             type="button"
             onClick={() => navigate('/supervisor/students')} 
             className="group bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-purple-400 hover:shadow-lg transition-all text-left"
          >
            <div className="w-12 h-12 bg-purple-50 dark:bg-purple-900/30 rounded-xl flex items-center justify-center text-purple-600 dark:text-purple-400 mb-4 group-hover:scale-110 transition-transform">
              <Users size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">My Students</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Track progress, update milestones, and view project documentation.</p>
          </button>

          <button 
             type="button"
             onClick={() => navigate('/chat')} 
             className="group bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 hover:border-green-400 hover:shadow-lg transition-all text-left"
          >
            <div className="w-12 h-12 bg-green-50 dark:bg-green-900/30 rounded-xl flex items-center justify-center text-green-600 dark:text-green-400 mb-4 group-hover:scale-110 transition-transform">
              <MessageSquare size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Communications</h3>
            <p className="text-slate-500 dark:text-slate-400 text-sm">Chat with your assigned students to provide feedback and guidance.</p>
          </button>
        </div>

        {/* Recent Activity / Timeline */}
        <div className="mt-12 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm p-8">
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
                <Clock size={24} className="text-slate-400" /> Recent System Activity
            </h3>
            <div className="space-y-6">
                <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <div className="w-0.5 h-full bg-slate-100 dark:bg-slate-700 mt-2"></div>
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Today</p>
                        <p className="text-slate-800 dark:text-slate-200 mt-1">New semester constraints updated by System Admin.</p>
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                        <div className="w-3 h-3 bg-slate-300 dark:bg-slate-600 rounded-full"></div>
                        <div className="w-0.5 h-full bg-slate-100 dark:bg-slate-700 mt-2"></div>
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Yesterday</p>
                        <p className="text-slate-800 dark:text-slate-200 mt-1">Project proposal deadline extended to Oct 25th.</p>
                    </div>
                </div>
                <div className="flex gap-4">
                    <div className="flex flex-col items-center">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">Oct 15, 2023</p>
                        <p className="text-slate-800 dark:text-slate-200 mt-1">System maintenance completed successfully.</p>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export const SupervisorDashboard: React.FC = () => {
  const { projects, updateProject, currentUser } = useStore();
  const [filter, setFilter] = useState('ALL');
  const [selectedProject, setSelectedProject] = useState<ProjectProposal | null>(null);
  const [feedback, setFeedback] = useState('');

  // Filter for INCOMING proposals
  const incomingProjects = projects.filter(p => 
    (p.status === ProjectStatus.SUBMITTED || 
     p.status === ProjectStatus.UNDER_REVIEW || 
     p.status === ProjectStatus.CHANGES_REQUESTED) &&
    p.supervisorId === currentUser?.id
  );

  const filteredProjects = filter === 'ALL' 
    ? incomingProjects 
    : incomingProjects.filter(p => p.status === filter);

  const handleStatusUpdate = (status: ProjectStatus) => {
    if (selectedProject) {
      updateProject(selectedProject.id, { 
        status, 
        feedback
      });
      setSelectedProject(null);
      setFeedback('');
    }
  };

  return (
    <div className="supervisor-review-layout flex flex-col md:flex-row gap-6">
      {/* Project List */}
      <div className="supervisor-review-list w-full bg-white dark:bg-slate-800 border md:border-r border-slate-200 dark:border-slate-700 flex flex-col rounded-xl md:rounded-l-2xl md:rounded-r-none mb-6 md:mb-0">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
             <Inbox size={20} className="text-blue-600 dark:text-blue-400"/> Proposal Inbox
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Review incoming student proposals</p>
          
          <div className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder="Search student or title..." 
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 dark:text-white"
            />
          </div>
          <div className="flex gap-2 mt-4 overflow-x-auto pb-2 no-scrollbar">
            {['ALL', ProjectStatus.UNDER_REVIEW, ProjectStatus.CHANGES_REQUESTED].map(f => (
              <button
                type="button"
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
                  filter === f ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {f.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto max-h-[300px] md:max-h-none">
          {filteredProjects.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
                <ShieldCheck size={48} className="mx-auto mb-2 opacity-20"/>
                <p className="text-sm">No pending reviews</p>
            </div>
          ) : (
            filteredProjects.map(p => (
                <button
                type="button"
                key={p.id}
                onClick={() => setSelectedProject(p)}
                className={`w-full text-left p-4 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors ${
                    selectedProject?.id === p.id ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-600' : ''
                }`}
                >
                <h3 className="font-semibold text-slate-900 dark:text-white text-sm truncate">{p.title}</h3>
                <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400">{p.studentName}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                    p.similarityRisk === 'High' ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' : 
                    p.similarityRisk === 'Medium' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
                    }`}>
                    Risk: {p.similarityRisk}
                    </span>
                </div>
                </button>
            ))
          )}
        </div>
      </div>

      {/* Detail View */}
      <div className="supervisor-review-detail flex-1 bg-white dark:bg-slate-800 rounded-xl md:rounded-r-2xl md:rounded-l-none shadow-sm border border-slate-200 dark:border-slate-700 p-8 overflow-y-auto">
        {selectedProject ? (
          <div className="max-w-3xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-bold rounded uppercase">
                        {selectedProject.status.replace('_', ' ')}
                    </span>
                </div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{selectedProject.title}</h1>
                <p className="text-slate-500 dark:text-slate-400 mt-1">Submitted by {selectedProject.studentName}</p>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-sm text-slate-400">Similarity Score</span>
                <span className={`text-2xl font-bold ${
                  selectedProject.similarityScore! > 50 ? 'text-red-600' : 'text-green-600'
                }`}>
                  {selectedProject.similarityScore}%
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="md:col-span-2 space-y-6">
                <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-xl">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-3">Description</h3>
                  <p className="text-slate-700 dark:text-slate-300 leading-relaxed">{selectedProject.description}</p>
                </div>
                {selectedProject.features && selectedProject.features.length > 0 && (
                  <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-xl">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-3">Features</h3>
                    <ul className="space-y-2">
                      {selectedProject.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                          <span className="w-5 h-5 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-xs font-bold flex-shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white uppercase tracking-wide mb-3">Technologies</h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedProject.technologies.map(t => (
                      <span key={t} className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm rounded-lg border border-slate-200 dark:border-slate-600">{t}</span>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                 <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-xl shadow-sm">
                   <h3 className="font-bold text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                     <AlertTriangle size={16} className="text-orange-500"/> AI Analysis
                   </h3>
                   <p className="text-xs text-slate-600 dark:text-slate-400">
                     The AI has detected a {selectedProject.similarityRisk} level of similarity with archived projects. Review carefully before approval.
                   </p>
                 </div>
              </div>
            </div>

            <div className="border-t border-slate-200 dark:border-slate-700 pt-8">
              <h3 className="font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                <MessageSquare size={18} /> Feedback & Decision
              </h3>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Enter feedback for the student (required for rejection/changes)..."
                className="w-full p-4 border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white rounded-xl mb-4 focus:ring-2 focus:ring-blue-500 outline-none"
                rows={4}
              />
              <div className="flex flex-col md:flex-row gap-4">
                <button
                  type="button"
                  onClick={() => handleStatusUpdate(ProjectStatus.APPROVED)}
                  className="flex-1 bg-green-600 text-white py-3 rounded-lg font-bold hover:bg-green-700 flex justify-center items-center gap-2"
                >
                  <CheckCircle size={18} /> Approve
                </button>
                <button
                   type="button"
                   onClick={() => handleStatusUpdate(ProjectStatus.CHANGES_REQUESTED)}
                   className="flex-1 bg-orange-500 text-white py-3 rounded-lg font-bold hover:bg-orange-600 flex justify-center items-center gap-2"
                >
                  <FileText size={18} /> Request Changes
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusUpdate(ProjectStatus.REJECTED)}
                  className="flex-1 bg-red-600 text-white py-3 rounded-lg font-bold hover:bg-red-700 flex justify-center items-center gap-2"
                >
                  <XCircle size={18} /> Reject
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400 flex-col gap-4 py-12">
            <Inbox size={64} className="opacity-20"/>
            <p>Select a proposal from the inbox to review.</p>
          </div>
        )}
      </div>
    </div>
  );
};
