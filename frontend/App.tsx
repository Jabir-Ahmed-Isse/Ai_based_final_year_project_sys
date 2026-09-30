
import React, { useState, useEffect, useCallback } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { StoreProvider, useStore } from './store';
import { Login } from './pages/Login';
import { Register } from './pages/Register';
import { Sidebar } from './components/Sidebar';
import { StudentLanding, IdeaGenerator, SubmitProposal } from './pages/StudentPortal';
import { SupervisorDashboard, SupervisorLanding } from './pages/SupervisorDashboard';
import { SupervisorStudents } from './pages/SupervisorStudents';
import { SupervisorProfile } from './pages/SupervisorProfile';
import { 
  AdminOverview, 
  AdminAssignments, 
  AdminReports, 
  AdminSimilarityResults,
  AdminUsers, 
  AdminSettings,
  AdminStrategicIdeas
} from './pages/AdminDashboard';
import { Repository } from './pages/Repository';
import { Chat } from './pages/Chat';
import GuidelinesPage from './pages/GuidelinesPage';
import { ResearchHub } from './pages/ResearchHub';
import { SupervisorModelEvaluation } from './pages/SupervisorModelEvaluation';
import { UserRole } from './types';
import { Menu } from 'lucide-react';

const PrivateRoute: React.FC<{ children: React.ReactNode, allowedRole?: UserRole }> = ({ children, allowedRole }) => {
  const { currentUser, isLoading } = useStore();
  
  // Don't redirect while loading - prevents navigation issues
  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
    </div>;
  }
  
  if (!currentUser) return <Navigate to="/" replace />;
  if (allowedRole && currentUser.role !== allowedRole) return <Navigate to="/" replace />;
  return <>{children}</>;
};

const AppContent: React.FC = () => {
  const { currentUser, theme } = useStore();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Apply theme class to HTML element
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location]);

  return (
    <div className="app-shell flex min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition-colors duration-300">
      {currentUser && (
        <>
          {/* Mobile Header */}
          <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 z-30 flex items-center px-4 justify-between shadow-sm">
             <div className="font-bold text-lg text-blue-600 dark:text-blue-400">Hormuud GPMS</div>
             <button onClick={() => setIsSidebarOpen(true)} className="p-2 text-slate-600 dark:text-slate-300">
               <Menu />
             </button>
          </div>

          {/* Sidebar */}
          <div className={`app-sidebar-shell fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 md:translate-x-0 ${isSidebarOpen ? 'translate-x-0 is-open' : '-translate-x-full'}`}>
             <Sidebar onClose={() => setIsSidebarOpen(false)} />
          </div>

          {/* Overlay for mobile */}
          {isSidebarOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-30 md:hidden"
              onClick={() => setIsSidebarOpen(false)}
            />
          )}
        </>
      )}

      <div className={`app-main flex-1 transition-all duration-300 ${currentUser ? 'app-main-authenticated md:ml-64 pt-16 md:pt-0' : ''}`}>
        <Routes>
          <Route path="/" element={!currentUser ? <Login /> : <Navigate to={`/${currentUser.role.toLowerCase()}`} />} />
          <Route path="/register" element={!currentUser ? <Register /> : <Navigate to={`/${currentUser.role.toLowerCase()}`} />} />
          
          {/* Shared Routes */}
          <Route path="/repository" element={<PrivateRoute><Repository /></PrivateRoute>} />
          <Route path="/chat" element={<PrivateRoute><Chat /></PrivateRoute>} />
          <Route path="/guidelines" element={<PrivateRoute><GuidelinesPage /></PrivateRoute>} />

          {/* Student Routes */}
          <Route path="/student" element={<PrivateRoute allowedRole={UserRole.STUDENT}><StudentLanding /></PrivateRoute>} />
          <Route path="/student/ideas" element={<PrivateRoute allowedRole={UserRole.STUDENT}><IdeaGenerator /></PrivateRoute>} />
          <Route path="/student/submit" element={<PrivateRoute allowedRole={UserRole.STUDENT}><SubmitProposal /></PrivateRoute>} />

          {/* Supervisor Routes */}
          <Route path="/supervisor" element={<PrivateRoute allowedRole={UserRole.SUPERVISOR}><SupervisorLanding /></PrivateRoute>} />
          <Route path="/supervisor/students" element={<PrivateRoute allowedRole={UserRole.SUPERVISOR}><SupervisorStudents /></PrivateRoute>} />
          <Route path="/supervisor/reviews" element={<PrivateRoute allowedRole={UserRole.SUPERVISOR}><SupervisorDashboard /></PrivateRoute>} />
          <Route path="/supervisor/profile" element={<PrivateRoute allowedRole={UserRole.SUPERVISOR}><SupervisorProfile /></PrivateRoute>} />
          
          {/* Admin Routes */}
          <Route path="/admin" element={<PrivateRoute allowedRole={UserRole.ADMIN}><AdminOverview /></PrivateRoute>} />
          <Route path="/admin/assignments" element={<PrivateRoute allowedRole={UserRole.ADMIN}><AdminAssignments /></PrivateRoute>} />
          <Route path="/admin/reports" element={<PrivateRoute allowedRole={UserRole.ADMIN}><AdminReports /></PrivateRoute>} />
          <Route path="/admin/supervisor-model-evaluation" element={<PrivateRoute allowedRole={UserRole.ADMIN}><SupervisorModelEvaluation /></PrivateRoute>} />
          <Route path="/admin/similarity-results" element={<PrivateRoute allowedRole={UserRole.ADMIN}><AdminSimilarityResults /></PrivateRoute>} />
          <Route path="/admin/ideas" element={<PrivateRoute allowedRole={UserRole.ADMIN}><AdminStrategicIdeas /></PrivateRoute>} />
          <Route path="/admin/users" element={<PrivateRoute allowedRole={UserRole.ADMIN}><AdminUsers /></PrivateRoute>} />
          <Route path="/admin/repository" element={<PrivateRoute allowedRole={UserRole.ADMIN}><Repository /></PrivateRoute>} />
          <Route path="/admin/settings" element={<PrivateRoute allowedRole={UserRole.ADMIN}><AdminSettings /></PrivateRoute>} />
          <Route path="/admin/research/dataset" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="dataset" /></PrivateRoute>} />
          <Route path="/admin/research/import-results" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="imports" /></PrivateRoute>} />
          <Route path="/admin/research/test-users" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="users" /></PrivateRoute>} />
          <Route path="/admin/research/supervisor-profiles" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="profiles" /></PrivateRoute>} />
          <Route path="/admin/research/similarity-experiments" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="similarity-experiments" /></PrivateRoute>} />
          <Route path="/admin/research/similarity-results" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="pairs" /></PrivateRoute>} />
          <Route path="/admin/research/supervisor-experiments" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="supervisor-experiments" /></PrivateRoute>} />
          <Route path="/admin/research/supervisor-recommendations" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="recommendations" /></PrivateRoute>} />
          <Route path="/admin/research/model-comparison" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="comparison" /></PrivateRoute>} />
          <Route path="/admin/research/visualizations" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="visualizations" /></PrivateRoute>} />
          <Route path="/admin/research/annotations" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="annotations" /></PrivateRoute>} />
          <Route path="/admin/research/reports" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="reports" /></PrivateRoute>} />
          <Route path="/admin/research/activity-logs" element={<PrivateRoute allowedRole={UserRole.ADMIN}><ResearchHub view="logs" /></PrivateRoute>} />
          
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <StoreProvider>
      <HashRouter>
        <AppContent />
      </HashRouter>
    </StoreProvider>
  );
};

export default App;
