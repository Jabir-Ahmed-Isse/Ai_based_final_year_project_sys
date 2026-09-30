import axios from 'axios';

// Base URLs for backend and AI services
const API_BASE_URL = 'http://localhost:5000/api';
const AI_SERVICE_URLS = [
  'http://localhost:5001/api/ai',
  'http://localhost:5002/api/ai',
];

// Create axios instances
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

const requestAI = async (
  method: 'get' | 'post' | 'delete',
  path: string,
  data?: any,
  config: any = {}
) => {
  let lastError: any;

  for (const baseURL of AI_SERVICE_URLS) {
    try {
      return await axios.request({
        ...config,
        method,
        baseURL,
        url: path,
        data,
        headers: {
          'Content-Type': 'application/json',
          ...(config.headers || {}),
        },
      });
    } catch (error: any) {
      const status = error.response?.status;
      const canRetry = !status || status === 404 || status >= 500;
      lastError = error;
      if (!canRetry) break;
    }
  }

  return Promise.reject(lastError);
};

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access (e.g., redirect to login)
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (credentials: { email: string; password: string }) =>
    apiClient.post('/auth/login', credentials),
  register: (userData: any) => apiClient.post('/auth/register', userData),
  getCurrentUser: () => apiClient.get('/auth/me'),
  logout: () => apiClient.post('/auth/logout'),
};

// Projects API
export const projectsAPI = {
  getAll: (params?: Record<string, any>) => apiClient.get('/projects', { params }),
  getById: (id: string) => apiClient.get(`/projects/${id}`),
  create: (projectData: any) => apiClient.post('/projects', projectData),
  update: (id: string, projectData: any) =>
    apiClient.put(`/projects/${id}`, projectData),
  delete: (id: string) => apiClient.delete(`/projects/${id}`),
  submit: (id: string) => apiClient.put(`/projects/${id}/submit`),
  assignSupervisor: (id: string, supervisorId: string) =>
    apiClient.put(`/projects/${id}/assign-supervisor`, { supervisorId }),
  getSimilarProjects: (projectData: any) =>
    apiClient.post('/projects/similar', projectData),
  getArchived: (filters?: { department?: string; facultyId?: string; departmentId?: string; categoryId?: string; domainId?: string; search?: string }) => {
    const params = new URLSearchParams();
    if (filters?.department && filters.department !== 'All') params.append('department', filters.department);
    if (filters?.facultyId) params.append('facultyId', filters.facultyId);
    if (filters?.departmentId) params.append('departmentId', filters.departmentId);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    if (filters?.domainId) params.append('domainId', filters.domainId);
    if (filters?.search) params.append('search', filters.search);
    return apiClient.get(`/projects/archived?${params.toString()}`);
  },
  createArchived: (projectData: {
    title: string;
    description: string;
    features: string[];
    studentName: string;
    department: string;
    facultyId?: string;
    departmentId?: string;
    programId?: string;
    categoryId?: string;
    researchDomainIds?: string[];
    year: number;
    technologies: string[];
    toolsOrMethods?: string[];
  }) => apiClient.post('/projects/archived', projectData),
};

export const similarityResultsAPI = {
  getAnalysis: (filters?: {
    riskLevel?: string;
    title?: string;
    facultyId?: string;
    departmentId?: string;
    startDate?: string;
    endDate?: string;
  }) => apiClient.get('/similarity-results', { params: filters }),
  getAllProjectsAnalysis: (filters?: {
    riskLevel?: string;
    title?: string;
    facultyId?: string;
    departmentId?: string;
    startDate?: string;
    endDate?: string;
  }) => apiClient.get('/similarity-results/all-projects', { params: filters }),
};

// Academic taxonomy API
export const taxonomyAPI = {
  getSummary: () => apiClient.get('/taxonomy/summary'),
  getFaculties: () => apiClient.get('/taxonomy/faculties'),
  createFaculty: (data: any) => apiClient.post('/taxonomy/faculties', data),
  updateFaculty: (id: string, data: any) => apiClient.put(`/taxonomy/faculties/${id}`, data),
  getDepartments: (facultyId?: string) => apiClient.get('/taxonomy/departments', { params: { facultyId } }),
  createDepartment: (data: any) => apiClient.post('/taxonomy/departments', data),
  updateDepartment: (id: string, data: any) => apiClient.put(`/taxonomy/departments/${id}`, data),
  getPrograms: (departmentId?: string, facultyId?: string) => apiClient.get('/taxonomy/programs', { params: { departmentId, facultyId } }),
  createProgram: (data: any) => apiClient.post('/taxonomy/programs', data),
  updateProgram: (id: string, data: any) => apiClient.put(`/taxonomy/programs/${id}`, data),
  getDomains: (facultyId?: string) => apiClient.get('/taxonomy/domains', { params: { facultyId } }),
  createDomain: (data: any) => apiClient.post('/taxonomy/domains', data),
  updateDomain: (id: string, data: any) => apiClient.put(`/taxonomy/domains/${id}`, data),
  getProjectCategories: (facultyId?: string, departmentId?: string) => apiClient.get('/taxonomy/project-categories', { params: { facultyId, departmentId } }),
  createProjectCategory: (data: any) => apiClient.post('/taxonomy/project-categories', data),
  updateProjectCategory: (id: string, data: any) => apiClient.put(`/taxonomy/project-categories/${id}`, data),
  getAcademicYears: () => apiClient.get('/taxonomy/academic-years'),
  createAcademicYear: (data: any) => apiClient.post('/taxonomy/academic-years', data),
};

// Users API
export const usersAPI = {
  getAll: () => apiClient.get('/users'),
  getSupervisors: () => apiClient.get('/users/supervisors'),
  getById: (id: string) => apiClient.get(`/users/${id}`),
  update: (id: string, userData: any) => apiClient.put(`/users/${id}`, userData),
  delete: (id: string) => apiClient.delete(`/users/${id}`),
};

// Announcements API
export const announcementsAPI = {
  getAll: (activeOnly?: boolean) => 
    apiClient.get(`/announcements${activeOnly ? '?activeOnly=true' : ''}`),
  getById: (id: string) => apiClient.get(`/announcements/${id}`),
  create: (data: { title: string; content: string; type: string; expiresAt?: string; createdBy: string }) => 
    apiClient.post('/announcements', data),
  update: (id: string, data: any) => apiClient.put(`/announcements/${id}`, data),
  toggle: (id: string) => apiClient.patch(`/announcements/${id}/toggle`),
  delete: (id: string) => apiClient.delete(`/announcements/${id}`),
};

// Guidelines API
export const guidelinesAPI = {
  getAll: (activeOnly?: boolean) => 
    apiClient.get(`/guidelines${activeOnly ? '?activeOnly=true' : ''}`),
  getById: (id: string) => apiClient.get(`/guidelines/${id}`),
  create: (formData: FormData) => 
    apiClient.post('/guidelines', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  update: (id: string, formData: FormData) => 
    apiClient.put(`/guidelines/${id}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    }),
  toggle: (id: string) => apiClient.patch(`/guidelines/${id}/toggle`),
  delete: (id: string) => apiClient.delete(`/guidelines/${id}`),
  getPdfUrl: (filename: string) => `${API_BASE_URL}/guidelines/pdf/${filename}`,
};

// Messages API
export const messagesAPI = {
  getAll: () => apiClient.get('/messages/all'),
  getByUser: (userId: string) => apiClient.get(`/messages/user/${userId}`),
  getConversation: (userId1: string, userId2: string) => 
    apiClient.get(`/messages/conversation/${userId1}/${userId2}`),
  send: (data: { 
    senderId: string; 
    senderName: string; 
    receiverId: string; 
    receiverName?: string;
    content: string; 
    fileAttachment?: { name: string; url: string; type: string; size: number } 
  }) => apiClient.post('/messages', data),
  markAsRead: (senderId: string, receiverId: string) => 
    apiClient.patch('/messages/read', { senderId, receiverId }),
  getUnreadCount: (userId: string) => apiClient.get(`/messages/unread/${userId}`),
  delete: (id: string) => apiClient.delete(`/messages/${id}`),
};

// Curated Ideas API
export const ideasAPI = {
  getAll: (search?: string, category?: string, filters?: { facultyId?: string; departmentId?: string; programId?: string; categoryId?: string; domainId?: string }) => {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (category) params.append('category', category);
    if (filters?.facultyId) params.append('facultyId', filters.facultyId);
    if (filters?.departmentId) params.append('departmentId', filters.departmentId);
    if (filters?.programId) params.append('programId', filters.programId);
    if (filters?.categoryId) params.append('categoryId', filters.categoryId);
    if (filters?.domainId) params.append('domainId', filters.domainId);
    return apiClient.get(`/ideas?${params.toString()}`);
  },
  create: (ideaData: any) => apiClient.post('/ideas', ideaData),
  createBulk: (ideas: any[]) => apiClient.post('/ideas/bulk', { ideas }),
  update: (id: string, ideaData: any) => apiClient.put(`/ideas/${id}`, ideaData),
  delete: (id: string) => apiClient.delete(`/ideas/${id}`),
  search: (query: string) => apiClient.get(`/ideas/search/${encodeURIComponent(query)}`),
};

// AI Service API
export const aiServiceAPI = {
  // Text similarity analysis
  checkSimilarity: (text1: string, text2: string) =>
    requestAI('post', '/similarity', { text1, text2 }),

  // Generate project ideas
  generateIdeas: (interests: string) =>
    requestAI('post', '/generate-ideas', { interests }),

  // Get supervisor recommendations
  recommendSupervisors: (projectData: any) =>
    requestAI('post', '/recommend-supervisors', projectData),

  // Process document for similarity check
  processDocument: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return requestAI('post', '/process-document', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  
  // Smart AI Chat - Create project knowledge base
  createProjectKnowledge: (projectName: string, projectDetails: string) =>
    requestAI('post', '/project/create', { project_name: projectName, project_details: projectDetails }),
  
  // Smart AI Chat - Chat with project
  chatWithProject: (projectId: string, question: string) =>
    requestAI('post', '/project/chat', { project_id: projectId, question }),
  
  // Smart AI Chat - List projects
  listProjects: () => requestAI('get', '/project/list'),
  
  // Smart AI Chat - Delete project
  deleteProject: (projectId: string) => requestAI('delete', `/project/${projectId}`),
  
  // Generate ideas using Python AI (no rate limits!)
  generateIdeasSmart: (interests: string, curatedIdeas: any[] = []) =>
    requestAI('post', '/generate-ideas-smart', { interests, curated_ideas: curatedIdeas }),
};

// File Upload API
export const fileAPI = {
  upload: (file: File, onUploadProgress?: (progressEvent: any) => void) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiClient.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      onUploadProgress,
    });
  },
  getFile: (fileId: string) => apiClient.get(`/files/${fileId}`, { responseType: 'blob' }),
  deleteFile: (fileId: string) => apiClient.delete(`/files/${fileId}`),
};

export const researchAPI = {
  getOverview: () => apiClient.get('/research/overview'),
  getAnalytics: () => apiClient.get('/research/analytics'),
  getImportRuns: (params?: any) => apiClient.get('/research/import-runs', { params }),
  getTestProjects: (params?: any) => apiClient.get('/research/test-projects', { params }),
  getTestUsers: (params?: any) => apiClient.get('/research/test-users', { params }),
  getSupervisorProfiles: (params?: any) => apiClient.get('/research/supervisor-profiles', { params }),
  getExperimentRuns: (params?: any) => apiClient.get('/research/experiment-runs', { params }),
  getPairScores: (params?: any) => apiClient.get('/research/pair-scores', { params }),
  getRecordedPairComparison: (firstProjectId: string, secondProjectId: string) =>
    apiClient.get(`/research/pair-comparison/${firstProjectId}/${secondProjectId}`),
  getSupervisorScores: (params?: any) => apiClient.get('/research/supervisor-scores', { params }),
  getAssignments: (params?: any) => apiClient.get('/research/assignments', { params }),
  getActivityLogs: (params?: any) => apiClient.get('/research/activity-logs', { params }),
  getAnnotationQueue: (params?: any) => apiClient.get('/research/annotation-queue', { params }),
  getAnnotationConsensus: (params?: any) => apiClient.get('/research/annotation-consensus', { params }),
  saveSupervisorGroundTruth: (data: any) => apiClient.post('/research/supervisor-ground-truth', data),
  getSupervisorGroundTruth: (params?: any) => apiClient.get('/research/supervisor-ground-truth', { params }),
  getModels: () => apiClient.get('/research/models'),
  getConfiguration: () => apiClient.get('/research/configuration'),
  updateConfiguration: (data: any) => apiClient.put('/research/configuration', data),
  runComparison: (firstProjectId: string, secondProjectId: string) =>
    apiClient.post('/research/comparisons', { firstProjectId, secondProjectId }),
  getComparisons: (params?: any) => apiClient.get('/research/comparisons', { params }),
  getLabels: (params?: any) => apiClient.get('/research/labels', { params }),
  saveLabel: (data: any) => apiClient.post('/research/labels', data),
  getExperiments: () => apiClient.get('/research/experiments'),
  createExperiment: (data: any) => apiClient.post('/research/experiments', data),
  runExperiment: (id: string) => apiClient.post(`/research/experiments/${id}/run`),
  getReports: () => apiClient.get('/research/reports'),
  generateReport: (data: any) => apiClient.post('/research/reports', data),
  exportUrl: (id: string, format: string) => `${API_BASE_URL}/research/reports/${id}/export/${format}`,
  rawExportUrl: (resource: string, format: 'csv' | 'json', params?: Record<string, string>) => {
    const query = new URLSearchParams(params || {}).toString();
    return `${API_BASE_URL}/research/raw-export/${resource}/${format}${query ? `?${query}` : ''}`;
  },
  downloadRawExport: (resource: string, format: 'csv' | 'json', params?: Record<string, string>) =>
    apiClient.get(`/research/raw-export/${resource}/${format}`, { params, responseType: 'blob' }),
};

// WebSocket service for real-time updates
export const setupWebSocket = (onMessage: (data: any) => void) => {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
  const wsUrl = `${wsProtocol}${window.location.host}/ws`;
  const socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('WebSocket connected');
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };

  socket.onclose = () => {
    console.log('WebSocket disconnected');
  };

  return {
    close: () => socket.close(),
    send: (data: any) => socket.send(JSON.stringify(data)),
  };
};

export default {
  auth: authAPI,
  projects: projectsAPI,
  similarityResults: similarityResultsAPI,
  users: usersAPI,
  ideas: ideasAPI,
  taxonomy: taxonomyAPI,
  ai: aiServiceAPI,
  files: fileAPI,
  announcements: announcementsAPI,
  guidelines: guidelinesAPI,
  research: researchAPI,
  setupWebSocket,
};
