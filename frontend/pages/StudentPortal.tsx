
import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useStore } from '../store';
import { SimilarProject } from '../services/geminiService';
import { aiServiceAPI, projectsAPI } from '../services/apiService';
import { ProjectStatus, ProjectProposal, AIProjectIdea } from '../types';
import { AnnouncementsBanner } from '../components/AnnouncementsBanner';
import {
  Lightbulb,
  Send,
  CheckCircle,
  AlertCircle,
  Loader2,
  Sparkles,
  FileText,
  Clock,
  ArrowRight,
  BookOpen,
  MessageSquare,
  ShieldCheck,
  Calendar,
  XCircle,
  History,
  ChevronRight,
  Plus,
  Trash2,
  BrainCircuit,
  User as UserIcon,
  Bot,
  PanelLeftClose,
  PanelLeft,
  Star
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { categoriesForFaculty, domainsForFaculty, refId, refName } from '../utils/taxonomy';

export const StudentLanding: React.FC = () => {
  const { currentUser, projects } = useStore();
  const navigate = useNavigate();

  const myProjects = projects
    .filter(p => p.studentId === currentUser?.id)
    .sort((a, b) => new Date(b.submissionDate).getTime() - new Date(a.submissionDate).getTime());

  const latestProject = myProjects[0];

  const Step = ({ num, title, desc, active, done, failed }: any) => (
    <div className={`flex flex-col items-center text-center relative z-10 w-1/4`}>
      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg mb-3 transition-colors ${failed ? 'bg-red-500 text-white' :
          done ? 'bg-green-500 text-white' :
            active ? 'bg-blue-600 text-white ring-4 ring-blue-100 dark:ring-blue-900' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
        }`}>
        {failed ? <XCircle size={20} /> : done ? <CheckCircle size={20} /> : num}
      </div>
      <h4 className={`font-bold text-sm ${failed ? 'text-red-600 dark:text-red-400' : active ? 'text-blue-900 dark:text-blue-400' : 'text-slate-600 dark:text-slate-500'}`}>{title}</h4>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-12">
      <div className="bg-gradient-to-r from-blue-900 via-blue-800 to-indigo-900 text-white pb-24 pt-12 px-8 rounded-b-[3rem] shadow-xl">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="md:w-1/2 space-y-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-800/50 border border-blue-700 text-blue-200 text-xs font-semibold backdrop-blur-sm">
              <Sparkles size={14} /> Graduation Project Portal
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold leading-tight">Innovate. Create. <br /> <span className="text-blue-400">Graduate.</span></h1>
            <div className="flex flex-col sm:flex-row gap-4 pt-4">
              {!latestProject || latestProject.status === ProjectStatus.REJECTED ? (
                <button type="button" onClick={() => navigate('/student/submit')} className="bg-white text-blue-900 px-6 py-3 rounded-xl font-bold hover:bg-blue-50 transition-colors flex items-center justify-center gap-2">Start Proposal <ArrowRight size={18} /></button>
              ) : (
                <button type="button" onClick={() => navigate('/chat')} className="bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-500 transition-colors flex items-center justify-center gap-2">Contact Supervisor <MessageSquare size={18} /></button>
              )}
              <button type="button" onClick={() => navigate('/student/ideas')} className="bg-blue-800/50 text-white border border-blue-700 px-6 py-3 rounded-xl font-bold hover:bg-blue-800 transition-colors">Get Ideas</button>
            </div>
          </div>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 md:px-6 -mt-16 relative z-10">
        {/* Announcements Banner */}
        <AnnouncementsBanner />

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-100 dark:border-slate-700 p-6 md:p-8 mb-12">
          {latestProject && (
            <div className="mb-10">
              <div className={`relative overflow-hidden p-6 md:p-8 rounded-2xl border-2 shadow-md transition-all ${latestProject.status === ProjectStatus.APPROVED || latestProject.status === ProjectStatus.IN_PROGRESS || latestProject.status === ProjectStatus.COMPLETED ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' : latestProject.status === ProjectStatus.REJECTED ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800' : 'bg-white dark:bg-slate-800 border-blue-200 dark:border-blue-900'
                }`}>
                <div className="relative z-10">
                  <h2 className="text-2xl font-bold dark:text-white mb-2">{latestProject.title}</h2>
                  <p className="text-lg text-slate-500 font-bold uppercase text-xs">{latestProject.status.replace('_', ' ')}</p>
                </div>
              </div>
            </div>
          )}
          <div className="relative flex justify-between items-start mb-8 px-4">
            <div className="absolute top-5 left-0 w-full h-1 bg-slate-100 dark:bg-slate-700 -z-0"></div>
            <Step num="1" title="Proposal" done={!!latestProject} active={!latestProject} />
            <Step num="2" title="Review" done={latestProject?.status === ProjectStatus.APPROVED} active={latestProject?.status === ProjectStatus.UNDER_REVIEW} />
            <Step num="3" title="Development" active={latestProject?.status === ProjectStatus.IN_PROGRESS} />
            <Step num="4" title="Defense" />
          </div>
        </div>
      </div>
    </div>
  );
};

export const IdeaGenerator: React.FC = () => {
  const { ideaHistory, curatedIdeas, addIdeaToHistory, clearIdeaHistory, fetchCuratedIdeas, currentUser } = useStore();
  const navigate = useNavigate();
  const [interests, setInterests] = useState('');
  const [loading, setLoading] = useState(false);
  const [currentChat, setCurrentChat] = useState<{ prompt: string, ideas: AIProjectIdea[], message?: string, role?: string }[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const facultyName = refName(currentUser?.facultyId).toLowerCase();
  const starterTags = facultyName.includes('medicine')
    ? ['AI Telehealth', 'Maternal Health Study', 'Clinical Decision Support']
    : facultyName.includes('engineering')
      ? ['Solar Microgrid', 'Smart Bridge Monitoring', 'Water Pump Design']
      : facultyName.includes('business')
        ? ['Digital Finance Risk', 'SME Market Analysis', 'Mobile Money Adoption']
        : facultyName.includes('education')
          ? ['Adaptive Learning', 'Curriculum Assessment', 'Teacher Feedback System']
          : facultyName.includes('agriculture')
            ? ['Smart Irrigation', 'Crop Disease Detection', 'Agribusiness Value Chain']
            : ['Blockchain Logistics', 'AI Telehealth', 'Smart Irrigation'];

  // Fetch curated ideas on mount
  useEffect(() => { fetchCuratedIdeas(); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [currentChat, loading]);

  const [error, setError] = useState<string | null>(null);

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!interests.trim() || loading) return;
    const userPrompt = interests;
    setInterests('');
    setLoading(true);
    setError(null);
    setCurrentChat(prev => [...prev, { prompt: userPrompt, ideas: [], role: 'user' }]);

    try {
      if (projectId) {
        // Chat with PDF
        const response = await aiServiceAPI.chatWithProject(projectId, userPrompt);
        setCurrentChat(prev => [...prev, { prompt: "", ideas: [], message: response.data.answer, role: 'assistant' }]);
      } else {
        // Idea generation
        const response = await aiServiceAPI.generateIdeasSmart(userPrompt, curatedIdeas);
        const result = response.data.ideas as AIProjectIdea[];
        const message = response.data.message as string | undefined;

        setCurrentChat(prev => {
          // Remove user prompt placeholder if we want to show it differently, 
          // but here we keep it and add assistant response
          return [...prev, { prompt: "", ideas: result, message: message, role: 'assistant' }];
        });

        if (result.length > 0) {
          addIdeaToHistory(userPrompt, result);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to process request. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post('http://localhost:5001/api/ai/project/create', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        }
      });

      setProjectId(response.data.project_id);
      setCurrentChat([{ prompt: `Analyzed ${file.name}`, ideas: [], message: `I've analyzed **${file.name}**. You can now ask me questions about it!`, role: 'system' }]);
    } catch (err: any) {
      setError('Failed to upload PDF. Please ensure the AI service is running.');
      console.error(err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="h-[calc(100vh-4rem)] md:h-[calc(100vh-2rem)] flex overflow-hidden m-0 md:m-4 bg-white dark:bg-slate-800 rounded-none md:rounded-2xl border border-slate-200 dark:border-slate-700 shadow-xl">
      <div className={`${isSidebarOpen ? 'w-80 border-r' : 'w-0'} bg-slate-50 dark:bg-slate-900 transition-all duration-300 flex flex-col overflow-hidden border-slate-200 dark:border-slate-700 shrink-0`}>
        <div className="p-4 flex justify-between items-center border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2"><History size={18} /> History</h2>
          <button type="button" onClick={() => { setCurrentChat([]); setProjectId(null); }} className="p-2 text-blue-600 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800"><Plus size={20} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {ideaHistory.map(item => (
            <button type="button" key={item.id} onClick={() => setCurrentChat([{ prompt: item.prompt, ideas: item.ideas }])} className="w-full text-left p-3 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors truncate">
              <div className="text-sm font-medium dark:text-white truncate">{item.prompt}</div>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => { clearIdeaHistory(); setCurrentChat([]); setProjectId(null); }} className="m-4 py-2 text-xs font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"><Trash2 size={14} className="inline mr-2" /> Clear History</button>
      </div>

      <div className="flex-1 flex flex-col bg-white dark:bg-slate-800 relative">
        <div className="p-4 border-b dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-500 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">{isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeft size={20} />}</button>
            <h2 className="font-bold dark:text-white flex items-center gap-2"><Sparkles className="text-blue-500" /> Hormuud AcademicAI</h2>
          </div>
          <button type="button" onClick={() => setCurrentChat([])} className="md:hidden text-blue-600 font-bold text-xs">New Chat</button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-10 scroll-smooth no-scrollbar">
          {currentChat.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-6">
              <Sparkles size={48} className="text-blue-600 animate-pulse" />
              <h1 className="text-3xl font-extrabold dark:text-white">Hormuud Innovation Hub</h1>
              <p className="text-slate-500 max-w-sm">Powered by university strategic goals and advanced AI reasoning.</p>
              <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                {starterTags.map(tag => (
                  <button key={tag} type="button" onClick={() => setInterests(tag)} className="px-4 py-2 bg-slate-50 dark:bg-slate-900 border dark:border-slate-700 rounded-full text-xs font-bold hover:border-blue-500 dark:text-slate-300">#{tag}</button>
                ))}
              </div>
            </div>
          ) : (
            currentChat.map((turn, tIdx) => (
              <div key={tIdx} className="space-y-8 max-w-4xl mx-auto animate-fade-in">
                <div className="flex gap-4 justify-end"><div className="bg-blue-600 text-white px-6 py-3 rounded-2xl rounded-tr-none text-sm font-medium shadow-md">{turn.prompt}</div></div>
                <div className="flex gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 shadow-lg ${turn.role === 'system' ? 'bg-green-600' : 'bg-indigo-600'}`}>
                    {turn.role === 'system' ? <FileText size={20} /> : <Bot size={20} />}
                  </div>
                  <div className="flex-1 space-y-6">
                    {turn.ideas.length === 0 && loading && !turn.message ? (
                      <div className="flex items-center gap-3 text-slate-400 italic py-4"><Loader2 className="animate-spin" /> Thinking...</div>
                    ) : (
                      <>
                        {/* Display conversational message */}
                        {turn.message && (
                          <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl">
                            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">{turn.message}</p>
                          </div>
                        )}
                        {/* Display project ideas */}
                        {turn.ideas.length > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {turn.ideas.map((idea, idx) => (
                              <div key={idx} className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 p-6 rounded-2xl hover:border-blue-400 dark:hover:border-blue-500 transition-all shadow-sm group">
                                <div className="flex justify-between items-start mb-3">
                                  <h3 className="text-lg font-bold dark:text-white leading-tight group-hover:text-blue-600 transition-colors">{idea.title}</h3>
                                  {idea.isCurated && (
                                    <span className="flex items-center gap-1 bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ring-1 ring-indigo-200"><Star size={10} fill="currentColor" /> Strategic</span>
                                  )}
                                </div>
                                <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 leading-relaxed line-clamp-3">{idea.description}</p>
                                <button type="button" onClick={() => navigate('/student/submit')} className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-md transition-all">Select Topic</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
        <div className="p-4 md:p-8 bg-gradient-to-t from-white dark:from-slate-800">
          {error && (
            <div className="max-w-4xl mx-auto mb-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-amber-700 dark:text-amber-300 text-sm flex items-center gap-2">
              <span>⏳</span> {error}
              <button type="button" onClick={() => setError(null)} className="ml-auto text-amber-500 hover:text-amber-700">✕</button>
            </div>
          )}
          <form onSubmit={handleGenerate} className="max-w-4xl mx-auto flex items-center bg-slate-50 dark:bg-slate-900 border dark:border-slate-700 rounded-2xl p-1 shadow-lg focus-within:ring-2 focus-within:ring-blue-500/20">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading || uploading}
              className="p-3 text-slate-400 hover:text-blue-600 transition-colors"
              title="Upload PDF to chat with"
            >
              {uploading ? <Loader2 className="animate-spin" size={20} /> : <FileText size={20} />}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf"
              onChange={handleFileUpload}
            />
            <input
              value={interests}
              onChange={e => setInterests(e.target.value)}
              placeholder={projectId ? "Ask questions about your PDF..." : "Enter a field (e.g., IoT, ML)..."}
              className="flex-1 bg-transparent p-4 text-sm dark:text-white outline-none"
              disabled={loading || uploading}
            />
            <button type="submit" disabled={loading || uploading || !interests.trim()} className="p-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/30 transition-all"><Send size={20} /></button>
          </form>
          <p className="text-[10px] text-center text-slate-400 mt-4 font-bold uppercase tracking-widest">Hormuud University AI Research Assistant {projectId && '• PDF Mode Active'}</p>
        </div>
      </div>
    </div>
  );
};

export const SubmitProposal: React.FC = () => {
  const { addProject, currentUser, academicYears } = useStore();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [problemStatement, setProblemStatement] = useState('');
  const [objectives, setObjectives] = useState('');
  const [features, setFeatures] = useState('');
  const [technologies, setTechnologies] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [similarityResult, setSimilarityResult] = useState<{ score: number; risk: string; analysis: string; mostSimilarProject?: string; similarProjects: SimilarProject[] } | null>(null);
  const [done, setDone] = useState(false);
  const facultyId = refId(currentUser?.facultyId);
  const departmentId = refId(currentUser?.departmentId);
  const programId = refId(currentUser?.programId);
  const activeAcademicYear = academicYears.find(year => year.isActive) || academicYears[0];
  const runSimilarityCheck = async () => {
    const featuresArray = features.split('\n').map(f => f.trim()).filter(Boolean);
    const techArray = technologies.split(',').map(t => t.trim()).filter(Boolean);
    const objectiveArray = objectives.split('\n').map(value => value.trim()).filter(Boolean);

    try {
      const response = await projectsAPI.getSimilarProjects({
        title,
        abstract: desc,
        description: desc,
        features: featuresArray,
        problemStatement,
        objectives: objectiveArray,
        toolsOrMethods: techArray,
        technologies: techArray,
        facultyId,
        departmentId,
        programId
      });

      const data = response.data;
      const score = Math.round(Number(data.displayedScore ?? data.score ?? data.overallScore ?? 0));
      const similarProjects = (data.similarProjects || []).map((project: any) => ({
        title: project.title || '',
        description: project.description || project.abstract || project.reason || '',
        studentName: project.studentName,
        technologies: project.technologies || project.toolsOrMethods || [],
        similarityScore: Math.round(Number(project.similarityScore ?? project.displayedPercentage ?? project.score ?? project.similarity ?? 0)),
        matchedSections: project.matchedSections || [],
        modelScores: project.modelScores || {},
        fieldScores: project.fieldScores || {}
      }));

      const backendResult = {
        score,
        risk: (data.risk || data.riskLevel || (score >= 70 ? 'High' : score >= 40 ? 'Medium' : 'Low')) as 'Low' | 'Medium' | 'High',
        analysis: data.analysis || `${data.similarityLabel || 'Similarity'}: ${score}%`,
        mostSimilarProject: data.mostSimilarProject || similarProjects[0]?.title,
        similarProjects
      };

      return backendResult;
    } catch (error) {
      console.warn('Recorded-project research similarity is unavailable:', error);
      throw error;
    }
  };

  // Check similarity before submission
  const handleCheckSimilarity = async () => {
    if (!title.trim() || !desc.trim() || !problemStatement.trim() || !objectives.trim() || !features.trim() || !technologies.trim()) {
      alert('Please complete all six project fields before checking similarity.');
      return;
    }
    setChecking(true);
    setSimilarityResult(null);
    try {
      const check = await runSimilarityCheck();
      setSimilarityResult(check);
    } catch (error) {
      console.error('Similarity check error:', error);
      setSimilarityResult({ score: 0, risk: 'Low', analysis: 'Could not check the recorded research dataset. Please ensure the research AI service is running.', similarProjects: [] });
    }
    setChecking(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    // If similarity not checked yet, check first
    if (!similarityResult) {
      setSubmitting(true);
      try {
        const check = await runSimilarityCheck();
        setSimilarityResult(check);
        setSubmitting(false);

        // If high similarity, show warning and don't auto-submit
        if (check.risk === 'High') {
          return;
        }
      } catch (error) {
        console.error('Similarity check error:', error);
        setSimilarityResult({
          score: 0,
          risk: 'Low',
          analysis: 'Submission paused because the recorded-project similarity check could not run.',
          similarProjects: []
        });
        setSubmitting(false);
        return;
      }
    }

    // If high similarity, require confirmation
    if (similarityResult?.risk === 'High') {
      const confirmed = window.confirm(
        `⚠️ HIGH SIMILARITY WARNING (${similarityResult.score}%)\n\n` +
        `Your project is very similar to "${similarityResult.mostSimilarProject}".\n\n` +
        `Are you sure you want to submit anyway? This may be flagged for review.`
      );
      if (!confirmed) return;
    }

    setSubmitting(true);
    const featuresArray = features.split('\n').map(f => f.trim()).filter(f => f);
    const techArray = technologies.split(',').map(t => t.trim()).filter(t => t);
    const objectiveArray = objectives.split('\n').map(value => value.trim()).filter(Boolean);
    const finalCheck = similarityResult || { score: 0, risk: 'Low' };

    try {
      await addProject({
        id: Math.random().toString(36).substr(2, 9),
        studentId: currentUser!.id,
        studentName: currentUser!.name,
        title,
        description: desc,
        features: featuresArray,
        problemStatement,
        objectives: objectiveArray,
        expectedOutputs: featuresArray,
        toolsOrMethods: techArray,
        technologies: techArray,
        facultyId,
        departmentId,
        programId,
        academicYearId: activeAcademicYear?._id || activeAcademicYear?.id,
        department: currentUser?.department || refName(currentUser?.departmentId),
        status: ProjectStatus.UNDER_REVIEW,
        submissionDate: new Date().toISOString().split('T')[0],
        similarityScore: finalCheck.score,
        similarityRisk: finalCheck.risk as any
      });
      setDone(true);
    } catch (error) {
      console.error('Project submission failed:', error);
      alert('Project could not be submitted to the server. Please check your login and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) return (
    <div className="p-12 text-center h-[60vh] flex flex-col items-center justify-center animate-fade-in">
      <CheckCircle size={80} className="text-green-500 mb-6" />
      <h2 className="text-3xl font-extrabold dark:text-white">Submission Successful</h2>
      <p className="text-slate-500 mt-2">Your topic is now in the academic review queue.</p>
      {similarityResult && (
        <div className={`mt-4 p-4 rounded-xl ${similarityResult.risk === 'High' ? 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800' :
            similarityResult.risk === 'Medium' ? 'bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800' :
              'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
          }`}>
          <p className={`text-sm font-medium ${similarityResult.risk === 'High' ? 'text-red-700 dark:text-red-300' :
              similarityResult.risk === 'Medium' ? 'text-yellow-700 dark:text-yellow-300' :
                'text-green-700 dark:text-green-300'
            }`}>
            Similarity Score: {similarityResult.score}% ({similarityResult.risk} Risk)
          </p>
        </div>
      )}
      <button type="button" onClick={() => navigate('/student')} className="mt-8 bg-blue-600 text-white px-8 py-3 rounded-xl font-bold">Return Home</button>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto bg-white dark:bg-slate-800 rounded-3xl p-8 md:p-12 my-8 border border-slate-200 dark:border-slate-700 shadow-xl animate-fade-in">
      <h2 className="text-2xl font-black dark:text-white mb-2">Project Proposal</h2>
      <p className="text-slate-500 mb-10 font-medium">Submit your formal research abstract for board evaluation.</p>
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Author Info */}
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
          <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
            <span className="font-bold">Author:</span> {currentUser?.name} ({currentUser?.email})
          </p>
          {(currentUser?.department || currentUser?.facultyId) && (
            <p className="text-xs text-blue-600 dark:text-blue-300 mt-1">
              {refName(currentUser?.facultyId)} {currentUser?.department || refName(currentUser?.departmentId)}
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Project Title *</label>
          <input required value={title} onChange={e => setTitle(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="A comprehensive study on..." />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Description *</label>
          <textarea required rows={4} value={desc} onChange={e => setDesc(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Describe the project and its purpose..." />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Problem Statement *</label>
          <textarea required rows={3} value={problemStatement} onChange={e => setProblemStatement(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="What academic or practical problem will this project address?" />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Research Objectives * (one per line)</label>
          <textarea required rows={4} value={objectives} onChange={e => setObjectives(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Design the proposed solution&#10;Evaluate its effectiveness&#10;Document the research findings" />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Features * (one per line)</label>
          <textarea required rows={5} value={features} onChange={e => setFeatures(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Prototype or study output&#10;Analysis report&#10;Validation or testing evidence" />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-black text-slate-400 uppercase tracking-widest">Technologies and Tools * (comma-separated)</label>
          <input required value={technologies} onChange={e => setTechnologies(e.target.value)} className="w-full p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="React, Node.js, Python, MongoDB..." />
        </div>

        {/* Similarity Check Button */}
        <button
          type="button"
          onClick={handleCheckSimilarity}
          disabled={checking || !title.trim() || !desc.trim() || !problemStatement.trim() || !objectives.trim() || !features.trim() || !technologies.trim()}
          className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-slate-400 text-white py-4 rounded-xl font-bold flex items-center justify-center gap-3 transition-all"
        >
          {checking ? <Loader2 className="animate-spin" size={20} /> : <AlertCircle size={20} />}
          {checking ? 'Checking Similarity...' : 'Check Similarity Before Submitting'}
        </button>

        {/* Similarity Result Display */}
        {similarityResult && (
          <div className="space-y-4">
            {/* Main Result Card */}
            <div className={`p-5 rounded-xl border-2 ${similarityResult.risk === 'High'
                ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-700'
                : similarityResult.risk === 'Medium'
                  ? 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-700'
                  : 'bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700'
              }`}>
              <div className="flex items-center gap-3 mb-3">
                {similarityResult.risk === 'High' ? (
                  <XCircle className="text-red-500" size={28} />
                ) : similarityResult.risk === 'Medium' ? (
                  <AlertCircle className="text-yellow-500" size={28} />
                ) : (
                  <CheckCircle className="text-green-500" size={28} />
                )}
                <div>
                  <h4 className={`font-bold text-lg ${similarityResult.risk === 'High' ? 'text-red-700 dark:text-red-300' :
                      similarityResult.risk === 'Medium' ? 'text-yellow-700 dark:text-yellow-300' :
                        'text-green-700 dark:text-green-300'
                    }`}>
                    Similarity: {similarityResult.score}% ({similarityResult.risk} Risk)
                  </h4>
                  {similarityResult.mostSimilarProject && (
                    <p className="text-sm text-slate-600 dark:text-slate-400">
                      Most similar to: <span className="font-semibold">{similarityResult.mostSimilarProject}</span>
                    </p>
                  )}
                </div>
              </div>
              <p className={`text-sm ${similarityResult.risk === 'High' ? 'text-red-600 dark:text-red-400' :
                  similarityResult.risk === 'Medium' ? 'text-yellow-600 dark:text-yellow-400' :
                    'text-green-600 dark:text-green-400'
                }`}>
                {similarityResult.analysis}
              </p>
            </div>

            {/* Similar Projects List */}
            {similarityResult.similarProjects && similarityResult.similarProjects.length > 0 && (
              <div className="bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                <h4 className="font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                  <FileText size={18} />
                  Similar Projects Found ({similarityResult.similarProjects.length})
                </h4>
                <div className="space-y-3 max-h-64 overflow-y-auto">
                  {similarityResult.similarProjects.map((project, index) => (
                    <div
                      key={index}
                      className={`p-3 rounded-lg border ${project.similarityScore >= 70
                          ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'
                          : project.similarityScore >= 40
                            ? 'bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-800'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }`}
                    >
                      <div className="flex justify-between items-start mb-1">
                        <h5 className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                          {project.title}
                        </h5>
                        <span className={`text-xs font-bold px-2 py-1 rounded-full ${project.similarityScore >= 70
                            ? 'bg-red-500 text-white'
                            : project.similarityScore >= 40
                              ? 'bg-yellow-500 text-white'
                              : 'bg-green-500 text-white'
                          }`}>
                          {project.similarityScore}%
                        </span>
                      </div>
                      {project.studentName && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">
                          By: {project.studentName}
                        </p>
                      )}
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">
                        {project.description}
                      </p>
                      {project.modelScores && Object.keys(project.modelScores).length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {Object.entries(project.modelScores).map(([model, value]) => (
                            <span key={model} className="text-[11px] bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                              {model === 'tfidf' ? 'TF-IDF' : model === 'sentence_bert' ? 'Sentence-BERT' : model === 'bge_m3' ? 'BGE-M3' : model}: {Math.round(Number(value))}%
                            </span>
                          ))}
                        </div>
                      )}
                      {project.technologies && project.technologies.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {project.technologies.slice(0, 4).map((tech, i) => (
                            <span key={i} className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                              {tech}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No similar projects message */}
            {similarityResult.similarProjects && similarityResult.similarProjects.length === 0 && similarityResult.risk === 'Low' && (
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-4 text-center">
                <CheckCircle className="text-green-500 mx-auto mb-2" size={32} />
                <p className="text-green-700 dark:text-green-300 font-medium">
                  No similar projects found! Your idea appears to be unique.
                </p>
              </div>
            )}
          </div>
        )}

        <button type="submit" disabled={submitting || checking} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-400 text-white py-5 rounded-2xl font-black text-lg shadow-lg shadow-blue-500/20 flex items-center justify-center gap-3 transition-all">
          {submitting ? <Loader2 className="animate-spin" /> : <ShieldCheck />}
          {submitting ? 'Submitting...' : 'Certify & Submit'}
        </button>
      </form>
    </div>
  );
};
