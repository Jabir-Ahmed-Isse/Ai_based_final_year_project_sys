import React, { useMemo, useState } from 'react';
import { useStore } from '../store';
import { User, Save, Briefcase, FileText, Award, CheckCircle } from 'lucide-react';
import { departmentsForFaculty, domainsForFaculty, refId } from '../utils/taxonomy';

export const SupervisorProfile: React.FC = () => {
  const { currentUser, updateUserProfile, faculties, departments, researchDomains } = useStore();
  const [isSaving, setIsSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  
  const [formData, setFormData] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    facultyId: refId(currentUser?.facultyId),
    departmentId: refId(currentUser?.departmentId),
    department: currentUser?.department || 'Computer Science',
    expertise: currentUser?.expertise?.join(', ') || '',
    researchInterests: currentUser?.researchInterests?.join(', ') || '',
    areasOfExpertise: currentUser?.areasOfExpertise?.join(', ') || currentUser?.expertise?.join(', ') || '',
    academicSpecialization: currentUser?.academicSpecialization || '',
    skills: currentUser?.skills?.join(', ') || '',
    supervisorTechnologies: currentUser?.supervisorTechnologies?.join(', ') || '',
    previousSupervisedProjectTopics: currentUser?.previousSupervisedProjectTopics?.join('\n') || '',
    publicationKeywords: currentUser?.publicationKeywords?.join(', ') || '',
    expertiseDomainIds: (currentUser?.expertiseDomainIds || []).map(refId).filter(Boolean),
    cvSummary: currentUser?.cvSummary || '',
    crossFacultyEligible: currentUser?.crossFacultyEligible || false
  });
  const availableDepartments = useMemo(() => departmentsForFaculty(departments, formData.facultyId), [departments, formData.facultyId]);
  const availableDomains = useMemo(() => domainsForFaculty(researchDomains, formData.facultyId), [researchDomains, formData.facultyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    const commaList = (value: string) => value.split(',').map(item => item.trim()).filter(Boolean);
    const topicList = formData.previousSupervisedProjectTopics.split('\n').map(item => item.trim()).filter(Boolean);
    const expertiseArray = commaList(formData.areasOfExpertise);
    
    await updateUserProfile({
      name: formData.name,
      facultyId: formData.facultyId,
      departmentId: formData.departmentId,
      department: formData.department,
      expertise: expertiseArray,
      researchInterests: commaList(formData.researchInterests),
      areasOfExpertise: expertiseArray,
      academicSpecialization: formData.academicSpecialization,
      skills: commaList(formData.skills),
      supervisorTechnologies: commaList(formData.supervisorTechnologies),
      previousSupervisedProjectTopics: topicList,
      publicationKeywords: commaList(formData.publicationKeywords),
      expertiseDomainIds: formData.expertiseDomainIds,
      crossFacultyEligible: formData.crossFacultyEligible,
      cvSummary: formData.cvSummary
    });
    
    setIsSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <User className="text-blue-600 dark:text-blue-400" />
          My Profile
        </h1>
        <p className="text-slate-500 dark:text-slate-400 mt-2">
          Update your expertise and CV to help the AI match you with suitable projects.
        </p>
      </div>

      {saved && (
        <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl flex items-center gap-3 text-green-700 dark:text-green-400">
          <CheckCircle size={20} />
          <span className="font-medium">Profile updated successfully!</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <div className="p-6 md:p-8 space-y-6">
          {/* Basic Info */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Dr. Ahmed Mohamed"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Email
              </label>
              <input
                type="email"
                value={formData.email}
                disabled
                className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-500 dark:text-slate-400 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Faculty
              </label>
              <select
                value={formData.facultyId}
                onChange={e => setFormData(prev => ({ ...prev, facultyId: e.target.value, departmentId: '', department: '' }))}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select Faculty</option>
                {faculties.map(faculty => (
                  <option key={refId(faculty)} value={refId(faculty)}>{faculty.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Department
              </label>
              <select
                value={formData.departmentId}
                onChange={e => {
                  const selected = departments.find(dept => refId(dept) === e.target.value);
                  setFormData(prev => ({ ...prev, departmentId: e.target.value, department: selected?.name || '' }));
                }}
                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                disabled={!formData.facultyId}
              >
                <option value="">Select Department</option>
                {availableDepartments.map(department => (
                  <option key={refId(department)} value={refId(department)}>{department.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              Research Domains
            </label>
            <select
              multiple
              value={formData.expertiseDomainIds}
              onChange={e => setFormData(prev => ({ ...prev, expertiseDomainIds: Array.from(e.currentTarget.selectedOptions, (option: HTMLOptionElement) => option.value) }))}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableDomains.map(domain => (
                <option key={refId(domain)} value={refId(domain)}>{domain.name}</option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-2">
              Hold Ctrl or Cmd to select multiple research domains.
            </p>
          </div>

          <label className="flex items-center gap-3 p-4 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl">
            <input
              type="checkbox"
              checked={formData.crossFacultyEligible}
              onChange={e => setFormData(prev => ({ ...prev, crossFacultyEligible: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Available for cross-faculty supervision when expertise matches
            </span>
          </label>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Research Interests *</label>
            <input required value={formData.researchInterests} onChange={e => setFormData(prev => ({ ...prev, researchInterests: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Artificial intelligence, health informatics, educational technology" />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              <Award size={16} className="text-blue-500" />
              Areas of Expertise * (comma-separated)
            </label>
            <input
              type="text"
              required
              value={formData.areasOfExpertise}
              onChange={e => setFormData(prev => ({ ...prev, areasOfExpertise: e.target.value, expertise: e.target.value }))}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Machine Learning, Web Development, IoT, Cybersecurity"
            />
            <p className="text-xs text-slate-400 mt-2">
              Enter your areas of expertise separated by commas. This helps the AI recommend you for matching projects.
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Academic Specialization *</label>
            <input required value={formData.academicSpecialization} onChange={e => setFormData(prev => ({ ...prev, academicSpecialization: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Computer Science — Artificial Intelligence" />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Skills * (comma-separated)</label>
            <input required value={formData.skills} onChange={e => setFormData(prev => ({ ...prev, skills: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Research design, machine learning, data analysis, system architecture" />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Technologies * (comma-separated)</label>
            <input required value={formData.supervisorTechnologies} onChange={e => setFormData(prev => ({ ...prev, supervisorTechnologies: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500" placeholder="Python, TensorFlow, React, Node.js, MongoDB" />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Previous Supervised Project Topics * (one per line)</label>
            <textarea required rows={5} value={formData.previousSupervisedProjectTopics} onChange={e => setFormData(prev => ({ ...prev, previousSupervisedProjectTopics: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="AI-based student performance prediction&#10;Hospital appointment management system" />
          </div>

          <div>
            <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Publications or Research Keywords (where available)</label>
            <textarea rows={3} value={formData.publicationKeywords} onChange={e => setFormData(prev => ({ ...prev, publicationKeywords: e.target.value }))} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500 resize-none" placeholder="deep learning, semantic similarity, information retrieval" />
          </div>

          {/* Current Expertise Tags Preview */}
          {formData.areasOfExpertise && (
            <div>
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
                Expertise Preview
              </label>
              <div className="flex flex-wrap gap-2">
                {formData.areasOfExpertise.split(',').map(e => e.trim()).filter(e => e).map((exp, idx) => (
                  <span 
                    key={idx} 
                    className="px-3 py-1.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-sm rounded-lg border border-blue-200 dark:border-blue-800"
                  >
                    {exp}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 md:px-8 py-4 bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-700 rounded-b-2xl">
          <button
            type="submit"
            disabled={isSaving}
            className="w-full md:w-auto px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save size={18} />
                Save Profile
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
