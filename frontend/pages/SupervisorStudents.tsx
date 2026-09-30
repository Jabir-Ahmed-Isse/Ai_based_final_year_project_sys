import React from 'react';
import { useStore } from '../store';
import { ProjectStatus, ProjectProposal, UserRole } from '../types';
import { MessageSquare, CheckCircle, Clock, BookOpen, MoreVertical, Layout } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const SupervisorStudents: React.FC = () => {
  const { projects, currentUser, updateProject, users } = useStore();
  const navigate = useNavigate();

  // Find all supervisor IDs that could belong to current user (by matching email or name)
  const currentUserSupervisorIds = currentUser
    ? [
        currentUser.id,
        ...users.filter(u => 
          u.role === UserRole.SUPERVISOR && 
          (u.email === currentUser.email || u.name === currentUser.name)
        ).map(u => u.id)
      ]
    : [];

  // Filter for ACTIVE projects assigned to this supervisor (handles ID mismatch between mock and real users)
  const myStudents = projects.filter(p => 
    currentUserSupervisorIds.includes(p.supervisorId!) && 
    (p.status === ProjectStatus.APPROVED || 
     p.status === ProjectStatus.IN_PROGRESS || 
     p.status === ProjectStatus.COMPLETED)
  );

  const getProgress = (status: ProjectStatus) => {
    if (status === ProjectStatus.APPROVED) return 25;
    if (status === ProjectStatus.IN_PROGRESS) return 65;
    if (status === ProjectStatus.COMPLETED) return 100;
    return 0;
  };

  const handleStatusChange = (id: string, newStatus: ProjectStatus) => {
    updateProject(id, { status: newStatus });
  };

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <Layout className="text-blue-600 dark:text-blue-400" />
            My Students
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Track progress and manage your supervised projects.</p>
        </div>
      </div>

      {myStudents.length === 0 ? (
        <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-12 text-center">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
            <Layout size={32} />
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Active Students</h3>
          <p className="text-slate-500 dark:text-slate-400">Once you approve proposals, they will appear here.</p>
          <button 
            onClick={() => navigate('/supervisor/reviews')}
            className="mt-6 text-blue-600 dark:text-blue-400 font-bold hover:underline"
          >
            Go to Project Reviews &rarr;
          </button>
        </div>
      ) : (
        <div className="grid gap-6">
          {myStudents.map(project => {
            const progress = getProgress(project.status);
            return (
              <div key={project.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex flex-col md:flex-row justify-between gap-6">
                  {/* Student Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-700 dark:text-blue-400 font-bold">
                        {project.studentName.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 dark:text-white">{project.studentName}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Computer Science</p>
                      </div>
                    </div>
                    <h4 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mt-3">{project.title}</h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">{project.description}</p>
                    <div className="flex gap-2 mt-3">
                      {project.technologies.slice(0, 3).map(t => (
                        <span key={t} className="px-2 py-1 bg-slate-50 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded border border-slate-200 dark:border-slate-600">{t}</span>
                      ))}
                    </div>
                  </div>

                  {/* Progress Section */}
                  <div className="flex-1 flex flex-col justify-center px-0 md:px-4 md:border-l md:border-r border-slate-100 dark:border-slate-700">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Project Progress</span>
                      <span className={`text-sm font-bold ${
                        progress === 100 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'
                      }`}>{progress}%</span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                        }`} 
                        style={{ width: `${progress}%` }} 
                      />
                    </div>
                    <div className="flex justify-between mt-2 text-xs text-slate-400">
                      <span>Approval</span>
                      <span>Development</span>
                      <span>Defense</span>
                    </div>
                  </div>

                  {/* Actions & Status */}
                  <div className="w-full md:w-64 flex flex-col justify-between gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 uppercase mb-2">Current Status</label>
                      <select 
                        value={project.status}
                        onChange={(e) => handleStatusChange(project.id, e.target.value as ProjectStatus)}
                        className="w-full p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value={ProjectStatus.APPROVED}>Approved (Start)</option>
                        <option value={ProjectStatus.IN_PROGRESS}>In Progress</option>
                        <option value={ProjectStatus.COMPLETED}>Completed</option>
                      </select>
                    </div>

                    <div className="flex gap-2">
                       <button 
                         onClick={() => navigate('/chat')}
                         className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 text-sm font-bold transition-colors"
                        >
                         <MessageSquare size={16} /> Chat
                       </button>
                       <button className="flex-1 flex items-center justify-center gap-2 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 py-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/50 text-sm font-bold transition-colors">
                         <BookOpen size={16} /> Docs
                       </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};