import React, { useState } from 'react';
import { useStore } from '../store';
import { AlertOctagon, Bell, BookOpen, ChevronDown, ChevronUp, Info, X } from 'lucide-react';

export const AnnouncementsBanner: React.FC = () => {
  const { announcements } = useStore();
  const [isExpanded, setIsExpanded] = useState(true);
  const [dismissedIds, setDismissedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem('dismissedAnnouncements');
    return saved ? JSON.parse(saved) : [];
  });

  // Filter active announcements that haven't been dismissed
  const activeAnnouncements = announcements.filter(a => {
    if (!a.isActive) return false;
    if (dismissedIds.includes(a.id)) return false;
    // Check if expired
    if (a.expiresAt && new Date(a.expiresAt) < new Date()) return false;
    return true;
  });

  const dismissAnnouncement = (id: string) => {
    const newDismissed = [...dismissedIds, id];
    setDismissedIds(newDismissed);
    localStorage.setItem('dismissedAnnouncements', JSON.stringify(newDismissed));
  };

  if (activeAnnouncements.length === 0) return null;

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'urgent':
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          icon: <AlertOctagon size={18} className="text-red-500" />,
          badge: 'bg-red-100 text-red-700'
        };
      case 'warning':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          icon: <Bell size={18} className="text-yellow-500" />,
          badge: 'bg-yellow-100 text-yellow-700'
        };
      case 'guideline':
        return {
          bg: 'bg-purple-50 dark:bg-purple-900/20',
          border: 'border-purple-200 dark:border-purple-800',
          icon: <BookOpen size={18} className="text-purple-500" />,
          badge: 'bg-purple-100 text-purple-700'
        };
      default:
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-800',
          icon: <Info size={18} className="text-blue-500" />,
          badge: 'bg-blue-100 text-blue-700'
        };
    }
  };

  // Get the most urgent announcement type for the header
  const hasUrgent = activeAnnouncements.some(a => a.type === 'urgent');
  const hasWarning = activeAnnouncements.some(a => a.type === 'warning');
  const headerColor = hasUrgent ? 'bg-red-500' : hasWarning ? 'bg-yellow-500' : 'bg-blue-500';

  return (
    <div className="mb-6">
      {/* Header */}
      <div 
        className={`${headerColor} text-white px-4 py-2 rounded-t-xl flex items-center justify-between cursor-pointer`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Bell size={18} />
          <span className="font-bold text-sm">
            {activeAnnouncements.length} Active Announcement{activeAnnouncements.length > 1 ? 's' : ''}
          </span>
        </div>
        <button type="button" className="p-1 hover:bg-white/20 rounded transition-colors">
          {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {/* Announcements List */}
      {isExpanded && (
        <div className="bg-white dark:bg-slate-800 border border-t-0 border-slate-200 dark:border-slate-700 rounded-b-xl divide-y divide-slate-100 dark:divide-slate-700">
          {activeAnnouncements.map(announcement => {
            const styles = getTypeStyles(announcement.type);
            return (
              <div 
                key={announcement.id} 
                className={`p-4 ${styles.bg} first:rounded-t-none last:rounded-b-xl`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">{styles.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${styles.badge}`}>
                        {announcement.type}
                      </span>
                      <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                        {announcement.title}
                      </h4>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                      {announcement.content}
                    </p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                      <span>{new Date(announcement.createdAt).toLocaleDateString()}</span>
                      {announcement.expiresAt && (
                        <span className="text-orange-500">Expires: {announcement.expiresAt}</span>
                      )}
                    </div>
                  </div>
                  <button 
                    type="button"
                    onClick={(e) => { e.stopPropagation(); dismissAnnouncement(announcement.id); }}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors"
                    title="Dismiss"
                  >
                    <X size={16} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AnnouncementsBanner;
