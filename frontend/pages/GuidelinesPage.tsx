import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { Guideline } from '../types';
import { 
  BookOpen, 
  FileText, 
  Search, 
  XCircle,
  Filter,
  GraduationCap,
  FileCheck,
  Send,
  Shield
} from 'lucide-react';

const GuidelinesPage: React.FC = () => {
  const { guidelines, fetchGuidelines } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewingPdf, setViewingPdf] = useState<string | null>(null);

  useEffect(() => {
    fetchGuidelines();
  }, []);

  // Filter only active guidelines
  const activeGuidelines = guidelines.filter(g => g.isActive);

  // Apply search and category filters
  const filteredGuidelines = activeGuidelines.filter(g => {
    const matchesSearch = g.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         g.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || g.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'research': return <BookOpen size={20} />;
      case 'proposal': return <FileCheck size={20} />;
      case 'submission': return <Send size={20} />;
      case 'defense': return <Shield size={20} />;
      default: return <FileText size={20} />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'research': return 'from-blue-500 to-blue-600';
      case 'proposal': return 'from-green-500 to-green-600';
      case 'submission': return 'from-yellow-500 to-orange-500';
      case 'defense': return 'from-purple-500 to-purple-600';
      default: return 'from-slate-500 to-slate-600';
    }
  };

  const getCategoryBg = (category: string) => {
    switch (category) {
      case 'research': return 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800';
      case 'proposal': return 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800';
      case 'submission': return 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800';
      case 'defense': return 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800';
      default: return 'bg-slate-50 dark:bg-slate-900/20 border-slate-200 dark:border-slate-700';
    }
  };

  const categories = [
    { id: 'all', label: 'All Guidelines' },
    { id: 'research', label: 'Research' },
    { id: 'proposal', label: 'Proposal' },
    { id: 'submission', label: 'Submission' },
    { id: 'defense', label: 'Defense' },
    { id: 'general', label: 'General' }
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 pb-12">
      {/* Hero Section */}
      <div className="bg-gradient-to-r from-purple-900 via-indigo-900 to-blue-900 text-white pb-20 pt-12 px-8 rounded-b-[3rem] shadow-xl">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-white/10 rounded-xl backdrop-blur-sm">
              <GraduationCap size={32} />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-extrabold">Academic Guidelines</h1>
              <p className="text-purple-200 mt-1">Essential documents and resources for your graduation project</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 md:px-6 -mt-12 relative z-10">
        {/* Search and Filter Bar */}
        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-4 mb-6">
          <div className="flex flex-col md:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search guidelines..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
              />
            </div>
            
            {/* Category Filter */}
            <div className="flex items-center gap-2">
              <Filter size={18} className="text-slate-400" />
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Guidelines Grid */}
        {filteredGuidelines.length === 0 ? (
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-12 text-center">
            <BookOpen size={64} className="mx-auto mb-4 text-slate-300 dark:text-slate-600" />
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">No Guidelines Found</h3>
            <p className="text-slate-500 dark:text-slate-400">
              {searchTerm || selectedCategory !== 'all' 
                ? 'Try adjusting your search or filter criteria.'
                : 'No guidelines have been published yet. Check back later.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGuidelines.map(guideline => (
              <div
                key={guideline.id}
                className={`bg-white dark:bg-slate-800 rounded-2xl shadow-lg border overflow-hidden hover:shadow-xl transition-all ${getCategoryBg(guideline.category)}`}
              >
                {/* Category Header */}
                <div className={`bg-gradient-to-r ${getCategoryColor(guideline.category)} p-4 text-white`}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-white/20 rounded-lg">
                      {getCategoryIcon(guideline.category)}
                    </div>
                    <span className="text-sm font-bold uppercase tracking-wider">{guideline.category}</span>
                  </div>
                </div>

                {/* Content */}
                <div className="p-5">
                  <h3 className="font-bold text-lg text-slate-900 dark:text-white mb-2">{guideline.title}</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4 line-clamp-3">{guideline.description}</p>
                  
                  {/* PDF Button */}
                  {guideline.pdfUrl ? (
                    <button
                      type="button"
                      onClick={() => setViewingPdf(guideline.pdfUrl || null)}
                      className="w-full py-3 bg-red-50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border border-red-200 dark:border-red-800"
                    >
                      <FileText size={18} /> Open PDF Document
                    </button>
                  ) : (
                    <div className="py-3 bg-slate-50 dark:bg-slate-900/50 text-slate-400 rounded-xl text-center text-sm">
                      No PDF attached
                    </div>
                  )}

                  {/* Meta */}
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 text-xs text-slate-400 flex justify-between">
                    <span>By: {guideline.createdBy}</span>
                    <span>{new Date(guideline.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PDF Viewer Modal */}
      {viewingPdf && (
        <div 
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4" 
          onClick={() => setViewingPdf(null)}
        >
          <div 
            className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col" 
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText size={20} className="text-red-500" /> Guideline Document
              </h3>
              <div className="flex items-center gap-2">
                <a
                  href={`http://localhost:5000${viewingPdf}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors"
                >
                  Open in New Tab
                </a>
                <button 
                  type="button"
                  onClick={() => setViewingPdf(null)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <XCircle size={24} />
                </button>
              </div>
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

export default GuidelinesPage;
