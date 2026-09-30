import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Search, BookOpen, Filter, Download, Plus, X, Calendar, User, Layers, Code } from 'lucide-react';
import { UserRole, ArchivedProject } from '../types';
import { categoriesForFaculty, departmentsForFaculty, domainsForFaculty, programsForDepartment, refId, refName } from '../utils/taxonomy';

export const Repository: React.FC = () => {
  const {
    archivedProjects,
    fetchArchivedProjects,
    addArchivedProject,
    currentUser,
    faculties,
    departments,
    programs,
    projectCategories,
    researchDomains
  } = useStore();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFacultyId, setSelectedFacultyId] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  const [isLoading, setIsLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [selectedProject, setSelectedProject] = useState<ArchivedProject | null>(null);
  const isAdmin = currentUser?.role === UserRole.ADMIN;
  const studentFacultyId = refId(currentUser?.facultyId) || refId((currentUser?.departmentId as any)?.facultyId);
  const effectiveFacultyId = isAdmin ? selectedFacultyId : studentFacultyId;

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    features: '',
    studentName: '',
    facultyId: refId(currentUser?.facultyId),
    departmentId: refId(currentUser?.departmentId),
    programId: refId(currentUser?.programId),
    categoryId: '',
    researchDomainIds: [] as string[],
    department: currentUser?.department || '',
    year: new Date().getFullYear(),
    toolsOrMethods: ''
  });

  const availableDepartments = useMemo(() => departmentsForFaculty(departments, formData.facultyId), [departments, formData.facultyId]);
  const filterDepartments = useMemo(() => departmentsForFaculty(departments, effectiveFacultyId), [departments, effectiveFacultyId]);
  const availablePrograms = useMemo(() => programsForDepartment(programs, formData.departmentId), [programs, formData.departmentId]);
  const availableCategories = useMemo(() => categoriesForFaculty(projectCategories, formData.facultyId), [projectCategories, formData.facultyId]);
  const availableDomains = useMemo(() => domainsForFaculty(researchDomains, formData.facultyId), [researchDomains, formData.facultyId]);

  useEffect(() => {
    const loadProjects = async () => {
      setIsLoading(true);
      if (!isAdmin && studentFacultyId) {
        setSelectedFacultyId(studentFacultyId);
        await fetchArchivedProjects({ facultyId: studentFacultyId });
      } else {
        await fetchArchivedProjects();
      }
      setIsLoading(false);
    };
    loadProjects();
  }, [isAdmin, studentFacultyId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setIsSubmitting(true);

    try {
      const toolsArray = formData.toolsOrMethods.split(',').map(t => t.trim()).filter(Boolean);
      const featuresArray = formData.features.split('\n').map(f => f.trim()).filter(Boolean);
      await addArchivedProject({
        title: formData.title,
        description: formData.description,
        features: featuresArray,
        studentName: formData.studentName,
        facultyId: formData.facultyId,
        departmentId: formData.departmentId,
        programId: formData.programId,
        categoryId: formData.categoryId,
        researchDomainIds: formData.researchDomainIds,
        department: formData.department,
        year: formData.year,
        technologies: toolsArray,
        toolsOrMethods: toolsArray
      });

      setFormData({
        title: '',
        description: '',
        features: '',
        studentName: '',
        facultyId: refId(currentUser?.facultyId),
        departmentId: refId(currentUser?.departmentId),
        programId: refId(currentUser?.programId),
        categoryId: '',
        researchDomainIds: [],
        department: currentUser?.department || '',
        year: new Date().getFullYear(),
        toolsOrMethods: ''
      });
      setShowAddForm(false);
    } catch (error: any) {
      setFormError(error.response?.data?.message || 'Failed to add project. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredProjects = archivedProjects.filter(project => {
    const term = searchTerm.toLowerCase();
    const projectDepartment = departments.find(department =>
      refId(department) === refId(project.departmentId) ||
      department.name === project.department ||
      department.code === project.department
    );
    const projectFacultyId =
      refId(project.facultyId) ||
      refId((project.departmentId as any)?.facultyId) ||
      refId(projectDepartment?.facultyId);
    const matchesSearch =
      project.title.toLowerCase().includes(term) ||
      project.abstract.toLowerCase().includes(term) ||
      (project.toolsOrMethods || project.technologies || []).some(tool => tool.toLowerCase().includes(term));
    const matchesFaculty = !effectiveFacultyId || projectFacultyId === effectiveFacultyId;
    const matchesDept =
      selectedDept === 'All' ||
      refId(project.departmentId) === selectedDept ||
      refId(projectDepartment) === selectedDept ||
      project.department === selectedDept ||
      projectDepartment?.name === selectedDept ||
      projectDepartment?.code === selectedDept;
    return matchesSearch && matchesFaculty && matchesDept;
  });

  const setFormFaculty = (facultyId: string) => {
    setFormData(prev => ({
      ...prev,
      facultyId,
      departmentId: '',
      programId: '',
      categoryId: '',
      researchDomainIds: [],
      department: ''
    }));
  };

  const setFormDepartment = (departmentId: string) => {
    const department = departments.find(item => refId(item) === departmentId);
    setFormData(prev => ({
      ...prev,
      departmentId,
      programId: '',
      department: department?.name || ''
    }));
  };

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <BookOpen className="text-blue-600 dark:text-blue-400" />
            Project Repository
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">Explore past graduation projects across faculties for inspiration and reference.</p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            <Plus size={20} />
            Add Project
          </button>
        )}
      </div>

      {selectedProject && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Project Details</h2>
              <button type="button" onClick={() => setSelectedProject(null)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-6">
              <div>
                <h3 className="text-2xl font-bold text-slate-900 dark:text-white">{selectedProject.title}</h3>
                <div className="flex flex-wrap gap-3 mt-3">
                  <span className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                    <Calendar size={16} />
                    {selectedProject.year}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                    <User size={16} />
                    {selectedProject.studentName}
                  </span>
                  <span className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                    <Layers size={16} />
                    {refName(selectedProject.departmentId) || selectedProject.department}
                  </span>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">Description</h4>
                <p className="text-slate-600 dark:text-slate-400">{selectedProject.abstract}</p>
              </div>

              {selectedProject.features && selectedProject.features.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2">Outputs</h4>
                  <ul className="space-y-2">
                    {selectedProject.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-2 text-slate-600 dark:text-slate-400">
                        <span className="w-6 h-6 flex items-center justify-center bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full text-xs font-bold flex-shrink-0 mt-0.5">
                          {index + 1}
                        </span>
                        {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {(selectedProject.toolsOrMethods || selectedProject.technologies || []).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wide mb-2 flex items-center gap-2">
                    <Code size={16} />
                    Tools / Methods
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {(selectedProject.toolsOrMethods || selectedProject.technologies || []).map(tool => (
                      <span key={tool} className="px-3 py-1.5 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm rounded-lg border border-slate-200 dark:border-slate-600">
                        {tool}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setSelectedProject(null)}
                className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center p-6 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Add Archived Project</h2>
              <button type="button" onClick={() => setShowAddForm(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
                  {formError}
                </div>
              )}

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Faculty *</label>
                  <select required value={formData.facultyId} onChange={e => setFormFaculty(e.target.value)} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white">
                    <option value="">Select Faculty</option>
                    {faculties.map(faculty => (
                      <option key={refId(faculty)} value={refId(faculty)}>{faculty.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Department *</label>
                  <select required value={formData.departmentId} onChange={e => setFormDepartment(e.target.value)} disabled={!formData.facultyId} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white">
                    <option value="">Select Department</option>
                    {availableDepartments.map(department => (
                      <option key={refId(department)} value={refId(department)}>{department.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Program</label>
                  <select value={formData.programId} onChange={e => setFormData(prev => ({ ...prev, programId: e.target.value }))} disabled={!formData.departmentId} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white">
                    <option value="">Select Program</option>
                    {availablePrograms.map(program => (
                      <option key={refId(program)} value={refId(program)}>{program.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
                  <select value={formData.categoryId} onChange={e => setFormData(prev => ({ ...prev, categoryId: e.target.value }))} disabled={!formData.facultyId} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white">
                    <option value="">Select Category</option>
                    {availableCategories.map(category => (
                      <option key={refId(category)} value={refId(category)}>{category.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Research Domains</label>
                <select multiple value={formData.researchDomainIds} onChange={e => setFormData(prev => ({ ...prev, researchDomainIds: Array.from(e.currentTarget.selectedOptions, (option: HTMLOptionElement) => option.value) }))} className="w-full px-4 py-2 min-h-[96px] bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white">
                  {availableDomains.map(domain => (
                    <option key={refId(domain)} value={refId(domain)}>{domain.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Project Title *</label>
                <input type="text" required value={formData.title} onChange={e => setFormData(prev => ({ ...prev, title: e.target.value }))} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" placeholder="Enter project title" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Description *</label>
                <textarea required rows={3} value={formData.description} onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none" placeholder="Enter project description" />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Outputs * (one per line)</label>
                <textarea required rows={4} value={formData.features} onChange={e => setFormData(prev => ({ ...prev, features: e.target.value }))} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white resize-none" placeholder="Prototype&#10;Research report&#10;Testing evidence" />
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Student Name *</label>
                  <input type="text" required value={formData.studentName} onChange={e => setFormData(prev => ({ ...prev, studentName: e.target.value }))} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" placeholder="Enter student name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Year *</label>
                  <input type="number" required min="2000" max={new Date().getFullYear()} value={formData.year} onChange={e => setFormData(prev => ({ ...prev, year: parseInt(e.target.value) }))} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Tools / Methods (comma-separated)</label>
                <input type="text" value={formData.toolsOrMethods} onChange={e => setFormData(prev => ({ ...prev, toolsOrMethods: e.target.value }))} className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" placeholder="React, SPSS, MATLAB, survey, field instruments" />
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={() => setShowAddForm(false)} className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={isSubmitting} className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                  {isSubmitting ? 'Adding...' : 'Add Project'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm space-y-4 md:space-y-0 md:flex gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-3.5 text-slate-400" size={20} />
          <input type="text" placeholder="Search by title, abstract, tool, or method..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 dark:text-white" />
        </div>
        <div className="w-full md:w-56 relative">
          <Filter className="absolute left-3 top-3.5 text-slate-400" size={20} />
          <select value={effectiveFacultyId} onChange={e => { setSelectedFacultyId(e.target.value); setSelectedDept('All'); }} disabled={!isAdmin} className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 appearance-none dark:text-white disabled:opacity-70 disabled:cursor-not-allowed">
            {isAdmin && <option value="">All Faculties</option>}
            {faculties.map(faculty => (
              <option key={refId(faculty)} value={refId(faculty)}>{faculty.name}</option>
            ))}
          </select>
        </div>
        <div className="w-full md:w-56 relative">
          <Filter className="absolute left-3 top-3.5 text-slate-400" size={20} />
          <select value={selectedDept} onChange={e => setSelectedDept(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-lg outline-none focus:ring-2 focus:ring-blue-500 appearance-none dark:text-white">
            <option value="All">All Departments</option>
            {filterDepartments.map(department => (
              <option key={refId(department)} value={refId(department)}>{department.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {filteredProjects.map(project => (
          <div key={project.id} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <span className="px-3 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs font-bold uppercase tracking-wide">
                {project.year} | {refName(project.departmentId) || project.department}
              </span>
              <button type="button" className="text-slate-400 hover:text-blue-600 dark:hover:text-blue-400">
                <Download size={20} />
              </button>
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-1">{project.title}</h3>
            <p className="text-sm text-blue-600 dark:text-blue-400 font-medium mb-3 flex items-center gap-1">
              <User size={14} />
              {project.studentName}
            </p>
            <p className="text-slate-600 dark:text-slate-400 text-sm mb-4 line-clamp-2">{project.abstract}</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {(project.toolsOrMethods || project.technologies || []).map(tool => (
                <span key={tool} className="px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded border border-slate-200 dark:border-slate-600">
                  {tool}
                </span>
              ))}
            </div>
            <div className="pt-4 border-t border-slate-100 dark:border-slate-700 flex items-center justify-end">
              <button type="button" onClick={() => setSelectedProject(project)} className="text-blue-600 dark:text-blue-400 text-sm font-semibold hover:underline">
                View Details
              </button>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="col-span-full py-12 text-center text-slate-400">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p>Loading projects...</p>
          </div>
        )}

        {!isLoading && filteredProjects.length === 0 && (
          <div className="col-span-full py-12 text-center text-slate-400">
            <BookOpen size={48} className="mx-auto mb-4 opacity-20" />
            <p>No projects found matching your criteria.</p>
          </div>
        )}
      </div>
    </div>
  );
};
