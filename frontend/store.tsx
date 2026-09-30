
import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole, ProjectProposal, ProjectStatus, Message, ArchivedProject, AIProjectIdea, CuratedIdea, Announcement, Guideline, Faculty, Department, Program, ResearchDomain, ProjectCategory, AcademicYear, TaxonomySummary } from './types';
import { authAPI, ideasAPI, projectsAPI, usersAPI, announcementsAPI, guidelinesAPI, messagesAPI, taxonomyAPI } from './services/apiService';
import { refId, refName } from './utils/taxonomy';

const MOCK_USERS: User[] = [
  { id: 's1', name: 'Ahmed Ali', email: 'ahmed@hormuud.edu.so', role: UserRole.STUDENT, facultyId: 'faculty-computing', departmentId: 'dept-cs', programId: 'program-cs', department: 'Computer Science' },
  { id: 's2', name: 'Khalid Omar', email: 'khalid@hormuud.edu.so', role: UserRole.STUDENT, facultyId: 'faculty-computing', departmentId: 'dept-cs', programId: 'program-cs', department: 'Computer Science' },
  { id: 's3', name: 'Sara Mohamed', email: 'sara@hormuud.edu.so', role: UserRole.STUDENT, facultyId: 'faculty-computing', departmentId: 'dept-it', programId: 'program-it', department: 'IT' },
  { id: 's4', name: 'Yusuf Ibrahim', email: 'yusuf@hormuud.edu.so', role: UserRole.STUDENT, facultyId: 'faculty-computing', departmentId: 'dept-cs', programId: 'program-cs', department: 'Computer Science' },
  { 
    id: 'sup1', 
    name: 'Dr. Fatima Hassan', 
    email: 'fatima@hormuud.edu.so', 
    role: UserRole.SUPERVISOR, 
    facultyId: 'faculty-computing',
    departmentId: 'dept-it',
    programId: 'program-it',
    department: 'IT',
    expertise: ['Cloud Computing', 'IoT', 'Network Security'],
    cvSummary: 'PhD in IoT Security. 10 years experience in sensor networks.',
    performanceMetrics: { projectsSupervised: 12, avgResponseTimeHours: 24, studentSatisfactionScore: 4.8 }
  },
  { 
    id: 'sup2', 
    name: 'Prof. Abdi Wahab', 
    email: 'abdi@hormuud.edu.so', 
    role: UserRole.SUPERVISOR, 
    facultyId: 'faculty-computing',
    departmentId: 'dept-cs',
    programId: 'program-cs',
    department: 'Computer Science',
    expertise: ['Artificial Intelligence', 'Machine Learning', 'Data Science', 'Python'],
    cvSummary: 'Published 20 papers on ML algorithms. Expert in NLP.',
    performanceMetrics: { projectsSupervised: 8, avgResponseTimeHours: 48, studentSatisfactionScore: 4.5 }
  },
  { 
    id: 'sup3', 
    name: 'Eng. Mariam Noor', 
    email: 'mariam@hormuud.edu.so', 
    role: UserRole.SUPERVISOR, 
    facultyId: 'faculty-computing',
    departmentId: 'dept-se',
    programId: 'program-se',
    department: 'Software Engineering',
    expertise: ['Web Development', 'React', 'Mobile Apps', 'UX/UI'],
    cvSummary: 'Senior Software Engineer with industry experience in Fintech.',
    performanceMetrics: { projectsSupervised: 15, avgResponseTimeHours: 12, studentSatisfactionScore: 4.9 }
  },
  { id: 'a1', name: 'System Admin', email: 'admin@hormuud.edu.so', role: UserRole.ADMIN }
];

const MOCK_ARCHIVE: ArchivedProject[] = [
  { id: 'arc1', title: 'IoT Based Smart Home Automation', studentName: 'Mohamed Abdi', year: 2023, facultyId: 'faculty-computing', departmentId: 'dept-cs', department: 'Computer Science', technologies: ['Arduino', 'C++', 'IoT Cloud'], abstract: 'A comprehensive system for automating home appliances using IoT protocols.' },
  { id: 'arc2', title: 'Blockchain Voting System', studentName: 'Amina Nur', year: 2023, facultyId: 'faculty-computing', departmentId: 'dept-it', department: 'IT', technologies: ['Solidity', 'Ethereum', 'React'], abstract: 'Secure and transparent voting mechanism utilizing Ethereum blockchain.' },
  { id: 'arc3', title: 'Somali Language Chatbot', studentName: 'Hassan Yare', year: 2022, facultyId: 'faculty-computing', departmentId: 'dept-cs', department: 'Computer Science', technologies: ['Python', 'NLP', 'TensorFlow'], abstract: 'An AI chatbot capable of understanding and responding in Somali language for customer support.' },
  { id: 'arc4', title: 'University Library Management System', studentName: 'Safia Farah', year: 2022, facultyId: 'faculty-computing', departmentId: 'dept-it', department: 'IT', technologies: ['PHP', 'MySQL', 'Bootstrap'], abstract: 'Digitalizing the library checkout and inventory process.' },
];

const FALLBACK_TAXONOMY: TaxonomySummary = {
  faculties: [
    { _id: 'faculty-computing', name: 'Faculty of Computing', code: 'COMP', isActive: true },
    { _id: 'faculty-engineering', name: 'Faculty of Engineering', code: 'ENG', isActive: true },
    { _id: 'faculty-medicine', name: 'Faculty of Medicine', code: 'MED', isActive: true },
    { _id: 'faculty-business', name: 'Faculty of Business', code: 'BUS', isActive: true },
    { _id: 'faculty-education', name: 'Faculty of Education', code: 'EDU', isActive: true },
    { _id: 'faculty-agriculture', name: 'Faculty of Agriculture', code: 'AGR', isActive: true }
  ],
  departments: [
    { _id: 'dept-cs', facultyId: 'faculty-computing', name: 'Computer Science', code: 'CS', isActive: true },
    { _id: 'dept-it', facultyId: 'faculty-computing', name: 'Information Technology', code: 'IT', isActive: true },
    { _id: 'dept-se', facultyId: 'faculty-computing', name: 'Software Engineering', code: 'SE', isActive: true },
    { _id: 'dept-civil', facultyId: 'faculty-engineering', name: 'Civil Engineering', code: 'CE', isActive: true },
    { _id: 'dept-public-health', facultyId: 'faculty-medicine', name: 'Public Health', code: 'PH', isActive: true },
    { _id: 'dept-finance', facultyId: 'faculty-business', name: 'Finance', code: 'FIN', isActive: true },
    { _id: 'dept-curriculum', facultyId: 'faculty-education', name: 'Curriculum and Instruction', code: 'CUR', isActive: true },
    { _id: 'dept-agriculture', facultyId: 'faculty-agriculture', name: 'Agricultural Science', code: 'AGS', isActive: true }
  ],
  programs: [
    { _id: 'program-cs', facultyId: 'faculty-computing', departmentId: 'dept-cs', name: 'BSc Computer Science', code: 'BSC-CS', isActive: true },
    { _id: 'program-it', facultyId: 'faculty-computing', departmentId: 'dept-it', name: 'BSc Information Technology', code: 'BSC-IT', isActive: true },
    { _id: 'program-se', facultyId: 'faculty-computing', departmentId: 'dept-se', name: 'BSc Software Engineering', code: 'BSC-SE', isActive: true },
    { _id: 'program-civil', facultyId: 'faculty-engineering', departmentId: 'dept-civil', name: 'BEng Civil Engineering', code: 'BENG-CE', isActive: true },
    { _id: 'program-ph', facultyId: 'faculty-medicine', departmentId: 'dept-public-health', name: 'BSc Public Health', code: 'BSC-PH', isActive: true },
    { _id: 'program-finance', facultyId: 'faculty-business', departmentId: 'dept-finance', name: 'BBA Finance', code: 'BBA-FIN', isActive: true },
    { _id: 'program-education', facultyId: 'faculty-education', departmentId: 'dept-curriculum', name: 'BEd Curriculum and Instruction', code: 'BED-CUR', isActive: true },
    { _id: 'program-agriculture', facultyId: 'faculty-agriculture', departmentId: 'dept-agriculture', name: 'BSc Agricultural Science', code: 'BSC-AGS', isActive: true }
  ],
  domains: [
    { _id: 'domain-ai', name: 'Artificial Intelligence', aliases: ['AI'], keywords: ['ai', 'machine learning'], facultyIds: ['faculty-computing', 'faculty-medicine', 'faculty-engineering'], isActive: true },
    { _id: 'domain-health', name: 'Public Health', aliases: ['Healthcare'], keywords: ['health', 'clinical'], facultyIds: ['faculty-medicine'], isActive: true },
    { _id: 'domain-energy', name: 'Renewable Energy', aliases: ['Energy Systems'], keywords: ['solar', 'wind'], facultyIds: ['faculty-engineering'], isActive: true },
    { _id: 'domain-finance', name: 'Finance', aliases: ['Financial Analysis'], keywords: ['finance', 'banking'], facultyIds: ['faculty-business'], isActive: true },
    { _id: 'domain-education', name: 'Curriculum Design', aliases: ['Pedagogy'], keywords: ['teaching', 'learning'], facultyIds: ['faculty-education'], isActive: true },
    { _id: 'domain-agriculture', name: 'Soil and Crop Science', aliases: ['Crop Production'], keywords: ['crop', 'soil'], facultyIds: ['faculty-agriculture'], isActive: true }
  ],
  categories: [
    { _id: 'category-software', facultyId: 'faculty-computing', name: 'Software System', outputLabel: 'Features / expected outputs', toolsLabel: 'Technologies used', isActive: true },
    { _id: 'category-engineering', facultyId: 'faculty-engineering', name: 'Engineering Design Project', outputLabel: 'Design outputs', toolsLabel: 'Tools, materials, or methods', isActive: true },
    { _id: 'category-health', facultyId: 'faculty-medicine', name: 'Health Research Study', outputLabel: 'Study outputs', toolsLabel: 'Study methods or instruments', isActive: true },
    { _id: 'category-business', facultyId: 'faculty-business', name: 'Business Research Project', outputLabel: 'Business outputs', toolsLabel: 'Analysis methods or tools', isActive: true },
    { _id: 'category-education', facultyId: 'faculty-education', name: 'Education Research Project', outputLabel: 'Educational outputs', toolsLabel: 'Teaching methods or research instruments', isActive: true },
    { _id: 'category-agriculture', facultyId: 'faculty-agriculture', name: 'Agriculture Research Project', outputLabel: 'Field or research outputs', toolsLabel: 'Methods, inputs, or tools', isActive: true }
  ],
  academicYears: [
    { _id: 'academic-current', label: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`, isActive: true }
  ]
};

const MOCK_PROJECTS: ProjectProposal[] = [
  { id: 'p1', studentId: 's1', studentName: 'Ahmed Ali', title: 'AI Traffic Control System', description: 'Using computer vision to optimize traffic light timings in Mogadishu.', objectives: ['Reduce congestion', 'Real-time analysis'], technologies: ['Python', 'OpenCV', 'YOLO'], status: ProjectStatus.IN_PROGRESS, submissionDate: '2023-10-15', similarityScore: 8, similarityRisk: 'Low', supervisorId: 'sup2' },
  { id: 'p2', studentId: 's2', studentName: 'Khalid Omar', title: 'Hospital Management System using Blockchain', description: 'A secure system for managing patient records using Hyperledger Fabric.', objectives: ['Secure Data', 'Decentralize records'], technologies: ['React', 'Node.js', 'Hyperledger'], status: ProjectStatus.UNDER_REVIEW, submissionDate: '2023-11-20', similarityScore: 12, similarityRisk: 'Low', supervisorId: 'sup1' },
  { id: 'p3', studentId: 's3', studentName: 'Sara Mohamed', title: 'E-Learning for Rural Areas', description: 'Offline-first LMS for remote regions.', objectives: ['Offline Sync', 'Mobile First'], technologies: ['Flutter', 'Firebase'], status: ProjectStatus.APPROVED, submissionDate: '2023-11-01', similarityScore: 45, similarityRisk: 'Medium', supervisorId: 'sup3' },
  { id: 'p4', studentId: 's4', studentName: 'Yusuf Ibrahim', title: 'Smart Agriculture using Drones', description: 'Using drones to capture images of crops and analyze health using image processing.', objectives: ['Crop monitoring', 'Disease detection'], technologies: ['Python', 'DroneKit', 'Raspberry Pi'], status: ProjectStatus.SUBMITTED, submissionDate: '2023-11-25', similarityScore: 5, similarityRisk: 'Low' }
];

export interface IdeaHistoryItem {
  id: string;
  prompt: string;
  timestamp: string;
  ideas: AIProjectIdea[];
}

const normalizeId = (record: any) => {
  if (!record) return '';
  if (typeof record === 'string') return record;
  if (typeof record === 'number') return String(record);
  return record._id || record.id || '';
};
const isMongoId = (value?: string) => /^[a-f\d]{24}$/i.test(value || '');
const tokenAvailable = () => Boolean(localStorage.getItem('token'));
const tokenUser = () => {
  const token = localStorage.getItem('token');
  if (!token) return null;

  try {
    const payloadSegment = token.split('.')[1] || '';
    const base64 = payloadSegment.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
    const payload = JSON.parse(atob(padded));
    return payload.user || payload;
  } catch {
    return null;
  }
};
const backendSessionMatches = (user?: User | null) => {
  const payloadUser = tokenUser();
  return Boolean(
    user &&
    tokenAvailable() &&
    isMongoId(user.id) &&
    (!payloadUser?.id || payloadUser.id === user.id) &&
    (!payloadUser?.role || payloadUser.role.toUpperCase() === user.role)
  );
};

const mapProjectStatus = (status?: string): ProjectStatus => {
  const normalized = String(status || '').toUpperCase();
  const enumValues = Object.values(ProjectStatus) as string[];
  return enumValues.includes(normalized) ? normalized as ProjectStatus : ProjectStatus.DRAFT;
};

const backendProjectStatus = (status?: ProjectStatus | string) => {
  const normalized = String(status || '').toLowerCase();
  return normalized || undefined;
};

const mapBackendUser = (user: any): User => ({
  id: normalizeId(user),
  name: user.name,
  email: user.email,
  role: (user.role || '').toUpperCase() as UserRole,
  facultyId: user.facultyId,
  departmentId: user.departmentId,
  programId: user.programId,
  department: user.department || refName(user.departmentId),
  studentId: user.studentId,
  expertise: user.expertise || [],
  researchInterests: user.researchInterests || [],
  areasOfExpertise: user.areasOfExpertise || [],
  academicSpecialization: user.academicSpecialization || '',
  skills: user.skills || [],
  supervisorTechnologies: user.supervisorTechnologies || [],
  previousSupervisedProjectTopics: user.previousSupervisedProjectTopics || [],
  publicationKeywords: user.publicationKeywords || [],
  expertiseDomainIds: user.expertiseDomainIds || [],
  cvSummary: user.cvSummary || '',
  maxProjects: user.maxProjects,
  currentProjects: user.currentProjects,
  crossFacultyEligible: user.crossFacultyEligible,
  availableForAssignment: user.availableForAssignment
});

const mapBackendArchivedProject = (project: any): ArchivedProject => ({
  id: normalizeId(project),
  title: project.title,
  studentName: project.studentName || project.archivedStudentName || 'Unknown',
  year: project.year || project.archivedYear || new Date(project.createdAt || Date.now()).getFullYear(),
  abstract: project.abstract || project.description || '',
  features: project.features || [],
  technologies: project.technologies || [],
  toolsOrMethods: project.toolsOrMethods || project.technologies || [],
  facultyId: project.facultyId,
  departmentId: project.departmentId,
  programId: project.programId,
  categoryId: project.categoryId,
  researchDomainIds: project.researchDomainIds || [],
  department: project.department || refName(project.departmentId) || 'N/A'
});

const mapBackendProject = (project: any): ProjectProposal => {
  const student = project.student || {};
  const supervisor = project.supervisor;
  const submittedAt = project.submissionDate || project.createdAt || new Date().toISOString();
  const latestFeedback = Array.isArray(project.feedback)
    ? project.feedback[project.feedback.length - 1]?.message || ''
    : project.feedback || '';

  return {
    id: normalizeId(project),
    studentId: normalizeId(student) || project.studentId || '',
    studentName: project.studentName || student.name || project.archivedStudentName || 'Unknown',
    title: project.title || '',
    description: project.description || project.abstract || '',
    features: project.features || project.expectedOutputs || [],
    objectives: project.objectives || [],
    technologies: project.technologies || project.toolsOrMethods || [],
    problemStatement: project.problemStatement || '',
    expectedOutputs: project.expectedOutputs || project.features || [],
    toolsOrMethods: project.toolsOrMethods || project.technologies || [],
    facultyId: project.facultyId,
    departmentId: project.departmentId,
    programId: project.programId,
    academicYearId: project.academicYearId,
    categoryId: project.categoryId,
    researchDomainIds: project.researchDomainIds || [],
    department: project.department || refName(project.departmentId),
    status: mapProjectStatus(project.status),
    similarityScore: project.similarityScore,
    similarityRisk: project.similarityRisk,
    supervisorId: normalizeId(supervisor) || project.supervisorId || '',
    feedback: latestFeedback,
    submissionDate: new Date(submittedAt).toISOString().split('T')[0]
  };
};

const projectPayload = (project: ProjectProposal) => ({
  title: project.title,
  abstract: project.description,
  description: project.description,
  status: backendProjectStatus(project.status),
  feedback: project.feedback || undefined,
  features: project.features || project.expectedOutputs || [],
  problemStatement: project.problemStatement || '',
  objectives: project.objectives || [],
  expectedOutputs: project.expectedOutputs || project.features || [],
  toolsOrMethods: project.toolsOrMethods || project.technologies || [],
  technologies: project.technologies || project.toolsOrMethods || [],
  facultyId: refId(project.facultyId) || undefined,
  departmentId: refId(project.departmentId) || undefined,
  programId: refId(project.programId) || undefined,
  academicYearId: refId(project.academicYearId) || undefined,
  categoryId: refId(project.categoryId) || undefined,
  researchDomainIds: (project.researchDomainIds || []).map(refId).filter(Boolean),
  department: project.department
});

interface AppState {
  currentUser: User | null;
  projects: ProjectProposal[];
  users: User[];
  messages: Message[];
  archivedProjects: ArchivedProject[];
  ideaHistory: IdeaHistoryItem[];
  curatedIdeas: CuratedIdea[];
  faculties: Faculty[];
  departments: Department[];
  programs: Program[];
  researchDomains: ResearchDomain[];
  projectCategories: ProjectCategory[];
  academicYears: AcademicYear[];
  announcements: Announcement[];
  guidelines: Guideline[];
  theme: 'light' | 'dark';
  isLoading: boolean;
  authError: string | null;
  toggleTheme: () => void;
  loginWithCredentials: (email: string, password: string) => Promise<boolean>;
  register: (userData: { name: string; email: string; password: string; role: string; facultyId?: string; departmentId?: string; programId?: string; department?: string; studentId?: string; expertise?: string[]; expertiseDomainIds?: string[]; cvSummary?: string; crossFacultyEligible?: boolean }) => Promise<boolean>;
  login: (role: UserRole) => void;
  logout: () => void;
  clearAuthError: () => void;
  addProject: (project: ProjectProposal) => Promise<ProjectProposal | void>;
  updateProject: (id: string, updates: Partial<ProjectProposal>) => Promise<void>;
  fetchProjects: () => Promise<void>;
  sendMessage: (receiverId: string, content: string, fileAttachment?: { name: string; url: string; type: string; size: number }) => Promise<void>;
  markMessagesRead: (senderId: string) => Promise<void>;
  fetchMessages: () => Promise<void>;
  addIdeaToHistory: (prompt: string, ideas: AIProjectIdea[]) => void;
  clearIdeaHistory: () => void;
  addCuratedIdea: (idea: CuratedIdea) => void;
  deleteCuratedIdea: (id: string) => void;
  fetchCuratedIdeas: () => Promise<void>;
  addCuratedIdeaToBackend: (idea: Omit<CuratedIdea, 'id'>) => Promise<void>;
  deleteCuratedIdeaFromBackend: (id: string) => Promise<void>;
  fetchTaxonomy: () => Promise<void>;
  fetchArchivedProjects: (filters?: { department?: string; facultyId?: string; departmentId?: string; categoryId?: string; domainId?: string; search?: string }) => Promise<void>;
  addArchivedProject: (project: { title: string; description: string; features: string[]; studentName: string; department: string; facultyId?: string; departmentId?: string; programId?: string; categoryId?: string; researchDomainIds?: string[]; year: number; technologies: string[]; toolsOrMethods?: string[] }) => Promise<void>;
  updateUserProfile: (updates: Partial<User>) => Promise<void>;
  fetchSupervisors: () => Promise<void>;
  addAnnouncement: (announcement: Omit<Announcement, 'id' | 'createdAt'>) => Promise<void>;
  deleteAnnouncement: (id: string) => Promise<void>;
  toggleAnnouncementActive: (id: string) => Promise<void>;
  fetchAnnouncements: () => Promise<void>;
  addGuideline: (formData: FormData) => Promise<void>;
  deleteGuideline: (id: string) => Promise<void>;
  toggleGuidelineActive: (id: string) => Promise<void>;
  fetchGuidelines: () => Promise<void>;
}

const StoreContext = createContext<AppState | undefined>(undefined);

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('currentUser');
    if (!saved) return null;
    const parsed = JSON.parse(saved);
    const mockUser = MOCK_USERS.find(user => user.id === parsed.id || user.email === parsed.email);
    return mockUser
      ? {
          ...parsed,
          facultyId: parsed.facultyId || mockUser.facultyId,
          departmentId: parsed.departmentId || mockUser.departmentId,
          programId: parsed.programId || mockUser.programId,
          department: parsed.department || mockUser.department
        }
      : parsed;
  });

  const [projects, setProjects] = useState<ProjectProposal[]>(() => {
    const saved = localStorage.getItem('projects');
    return saved ? JSON.parse(saved) : MOCK_PROJECTS;
  });

  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = localStorage.getItem('messages');
    return saved ? JSON.parse(saved) : [];
  });

  const [ideaHistory, setIdeaHistory] = useState<IdeaHistoryItem[]>(() => {
    const saved = localStorage.getItem('ideaHistory');
    return saved ? JSON.parse(saved) : [];
  });

  const [curatedIdeas, setCuratedIdeas] = useState<CuratedIdea[]>(() => {
    const saved = localStorage.getItem('curatedIdeas');
    return saved ? JSON.parse(saved) : [
      { id: 'ci1', title: 'Blockchain for Somali Remittance', description: 'Secure and low-cost money transfer using decentralized ledger.', difficulty: 'Hard', technologies: ['Solidity', 'Ethereum', 'React'] }
    ];
  });

  const [faculties, setFaculties] = useState<Faculty[]>(FALLBACK_TAXONOMY.faculties);
  const [departments, setDepartments] = useState<Department[]>(FALLBACK_TAXONOMY.departments);
  const [programs, setPrograms] = useState<Program[]>(FALLBACK_TAXONOMY.programs);
  const [researchDomains, setResearchDomains] = useState<ResearchDomain[]>(FALLBACK_TAXONOMY.domains);
  const [projectCategories, setProjectCategories] = useState<ProjectCategory[]>(FALLBACK_TAXONOMY.categories);
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>(FALLBACK_TAXONOMY.academicYears);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>(() => {
    const saved = localStorage.getItem('users');
    if (saved) {
      const savedUsers = JSON.parse(saved);
      // Merge saved users with mock users, avoiding duplicates
      const allUsers = [...MOCK_USERS];
      savedUsers.forEach((u: User) => {
        if (!allUsers.some(existing => existing.id === u.id)) {
          allUsers.push(u);
        }
      });
      return allUsers;
    }
    return MOCK_USERS;
  });
  const [archivedProjects, setArchivedProjects] = useState<ArchivedProject[]>(MOCK_ARCHIVE);

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [guidelines, setGuidelines] = useState<Guideline[]>([]);

  useEffect(() => {
    if (currentUser) localStorage.setItem('currentUser', JSON.stringify(currentUser));
    else localStorage.removeItem('currentUser');
  }, [currentUser]);

  useEffect(() => localStorage.setItem('projects', JSON.stringify(projects)), [projects]);
  useEffect(() => localStorage.setItem('messages', JSON.stringify(messages)), [messages]);
  useEffect(() => localStorage.setItem('ideaHistory', JSON.stringify(ideaHistory)), [ideaHistory]);
  useEffect(() => localStorage.setItem('curatedIdeas', JSON.stringify(curatedIdeas)), [curatedIdeas]);
  useEffect(() => localStorage.setItem('theme', theme), [theme]);
  useEffect(() => localStorage.setItem('users', JSON.stringify(users)), [users]);
  
  // Fetch announcements and guidelines on mount
  useEffect(() => {
    fetchTaxonomy();
    fetchAnnouncements();
    fetchGuidelines();
  }, []);

  // Fetch messages when user logs in
  useEffect(() => {
    if (currentUser) {
      // Delay slightly to ensure user data is ready
      const timer = setTimeout(() => {
        fetchMessagesFromBackend();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentUser]);

  // Internal function to fetch messages (used by useEffect)
  const fetchMessagesFromBackend = async () => {
    if (!currentUser) return;
    try {
      // Fetch ALL messages to handle ID mismatches between project IDs and user IDs
      const response = await messagesAPI.getAll();
      if (response.data && Array.isArray(response.data)) {
        setMessages(response.data);
      }
    } catch (error) {
      console.error('Error fetching messages on login:', error);
    }
  };

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const login = (role: UserRole) => {
    const user = MOCK_USERS.find(u => u.role === role);
    if (user) {
      localStorage.removeItem('token');
      setCurrentUser(user);
    }
  };

  const loginWithCredentials = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const response = await authAPI.login({ email, password });
      const { token, user } = response.data;
      
      localStorage.setItem('token', token);
      
      const mappedUser = mapBackendUser(user);
      
      setCurrentUser(mappedUser);
      
      // Add user to users array if not already present
      setUsers(prev => {
        const exists = prev.some(u => u.id === mappedUser.id);
        if (!exists) {
          return [...prev, mappedUser];
        }
        return prev;
      });
      
      setIsLoading(false);
      return true;
    } catch (error: any) {
      const message = error.response?.data?.message || 'Login failed. Please try again.';
      setAuthError(message);
      setIsLoading(false);
      return false;
    }
  };

  const register = async (userData: { name: string; email: string; password: string; role: string; facultyId?: string; departmentId?: string; programId?: string; department?: string; studentId?: string; expertise?: string[]; expertiseDomainIds?: string[]; cvSummary?: string; crossFacultyEligible?: boolean }): Promise<boolean> => {
    setIsLoading(true);
    setAuthError(null);
    try {
      const response = await authAPI.register(userData);
      const { token } = response.data;
      
      localStorage.setItem('token', token);
      
      // Get user details after registration
      const userResponse = await authAPI.getCurrentUser();
      const user = userResponse.data;
      
      const mappedUser = mapBackendUser(user);
      
      setCurrentUser(mappedUser);
      
      // Add user to users array if not already present
      setUsers(prev => {
        const exists = prev.some(u => u.id === mappedUser.id);
        if (!exists) {
          return [...prev, mappedUser];
        }
        return prev;
      });
      
      setIsLoading(false);
      return true;
    } catch (error: any) {
      const message = error.response?.data?.message || 'Registration failed. Please try again.';
      setAuthError(message);
      setIsLoading(false);
      return false;
    }
  };

  const clearAuthError = () => setAuthError(null);

  const logout = () => {
    setCurrentUser(null);
    localStorage.removeItem('currentUser');
    localStorage.removeItem('token');
  };

  const fetchProjects = async () => {
    if (!backendSessionMatches(currentUser)) return;

    try {
      const response = await projectsAPI.getAll();
      const backendProjects = response.data.map(mapBackendProject);
      setProjects(backendProjects);
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  const addProject = async (project: ProjectProposal) => {
    setProjects(prev => [project, ...prev]);

    if (!backendSessionMatches(currentUser)) {
      return project;
    }

    try {
      const created = await projectsAPI.create(projectPayload(project));
      const createdId = normalizeId(created.data);
      const submitted = await projectsAPI.submit(createdId);
      const persistedProject = {
        ...mapBackendProject(submitted.data),
        studentId: project.studentId,
        studentName: project.studentName
      };

      setProjects(prev => [
        persistedProject,
        ...prev.filter(item => item.id !== project.id && item.id !== persistedProject.id)
      ]);

      return persistedProject;
    } catch (error) {
      setProjects(prev => prev.filter(item => item.id !== project.id));
      console.error('Error submitting project to backend:', error);
      throw error;
    }
  };

  const updateProject = async (id: string, updates: Partial<ProjectProposal>) => {
    const previousProject = projects.find(project => project.id === id);

    setProjects(prev => {
      const updatedProjects = prev.map(p => p.id === id ? { ...p, ...updates } : p);
      
      // If project is being APPROVED by supervisor, add it to the archive automatically
      if (updates.status === 'APPROVED') {
        const project = updatedProjects.find(p => p.id === id);
        if (project) {
          // Add to archived projects via API
          const archiveProject = async () => {
            try {
              await projectsAPI.createArchived({
                title: project.title,
                description: project.description,
                features: project.features || [],
                studentName: project.studentName,
                department: project.department || currentUser?.department || refName(project.departmentId) || 'N/A',
                facultyId: refId(project.facultyId),
                departmentId: refId(project.departmentId),
                programId: refId(project.programId),
                categoryId: refId(project.categoryId),
                researchDomainIds: (project.researchDomainIds || []).map(refId).filter(Boolean),
                year: new Date().getFullYear(),
                technologies: project.technologies || [],
                toolsOrMethods: project.toolsOrMethods || project.technologies || []
              });
              // Refresh archived projects
              fetchArchivedProjects();
            } catch (error) {
              console.error('Error archiving approved project:', error);
            }
          };
          archiveProject();
        }
      }
      
      return updatedProjects;
    });

    const isSupervisorAssignment = Boolean(
      currentUser?.role === UserRole.ADMIN &&
      updates.supervisorId &&
      updates.supervisorId !== previousProject?.supervisorId
    );
    const canPersistProject = tokenAvailable() && isMongoId(id);

    if (isSupervisorAssignment && tokenAvailable() && (!isMongoId(id) || !isMongoId(updates.supervisorId))) {
      if (previousProject) {
        setProjects(prev => prev.map(project => project.id === id ? previousProject : project));
      }
      throw new Error('This project or supervisor is local demo data, not a database record. Refresh the admin page and try again.');
    }

    if (isSupervisorAssignment && isMongoId(id)) {
      if (!tokenAvailable()) {
        if (previousProject) {
          setProjects(prev => prev.map(project => project.id === id ? previousProject : project));
        }
        throw new Error('Please login as an admin before assigning a supervisor.');
      }
    }

    if (!canPersistProject) return;

    try {
      if (isSupervisorAssignment) {
        const response = await projectsAPI.assignSupervisor(id, updates.supervisorId);
        const updatedProject = mapBackendProject(response.data);
        setProjects(prev => prev.map(project => project.id === id ? updatedProject : project));
      } else {
        const existingProject = projects.find(project => project.id === id);
        if (!existingProject) return;
        const response = await projectsAPI.update(id, projectPayload({ ...existingProject, ...updates }));
        const updatedProject = mapBackendProject(response.data);
        setProjects(prev => prev.map(project => project.id === id ? updatedProject : project));
      }
    } catch (error) {
      if (previousProject) {
        setProjects(prev => prev.map(project => project.id === id ? previousProject : project));
      }
      console.error('Error persisting project update:', error);
      throw error;
    }
  };

  useEffect(() => {
    if (backendSessionMatches(currentUser)) {
      fetchProjects();
    }
  }, [currentUser?.id]);

  const sendMessage = async (receiverId: string, content: string, fileAttachment?: { name: string; url: string; type: string; size: number }) => {
    if (!currentUser) return;
    
    // Create optimistic message for immediate UI update
    const tempId = Math.random().toString(36).substr(2, 9);
    const newMessage: Message = {
      id: tempId,
      senderId: currentUser.id,
      receiverId,
      content,
      timestamp: new Date().toISOString(),
      read: false,
      fileAttachment
    };
    
    // Add to local state immediately
    setMessages(prev => [...prev, newMessage]);
    
    // Persist to backend
    try {
      const receiverUser = users.find(u => u.id === receiverId);
      const response = await messagesAPI.send({
        senderId: currentUser.id,
        senderName: currentUser.name,
        receiverId,
        receiverName: receiverUser?.name || '',
        content,
        fileAttachment
      });
      
      // Replace the optimistic message with the permanent database record.
      setMessages(prev => prev.map(m => 
        m.id === tempId ? response.data : m
      ));
    } catch (error) {
      console.error('Error sending message to backend:', error);
      setMessages(prev => prev.filter(m => m.id !== tempId));
      throw error;
    }
  };

  const markMessagesRead = async (senderId: string) => {
    if (!currentUser) return;
    
    // Update local state immediately
    setMessages(prev => prev.map(m => 
      (m.senderId === senderId && m.receiverId === currentUser.id) ? { ...m, read: true } : m
    ));
    
    // Persist to backend
    try {
      await messagesAPI.markAsRead(senderId, currentUser.id);
    } catch (error) {
      console.error('Error marking messages as read:', error);
    }
  };

  // Fetch messages from backend - fetch all messages
  const fetchMessages = async () => {
    if (!currentUser) return;
    try {
      // Fetch ALL messages to handle ID mismatches
      const response = await messagesAPI.getAll();
      if (response.data && Array.isArray(response.data)) {
        setMessages(response.data);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const addIdeaToHistory = (prompt: string, ideas: AIProjectIdea[]) => {
    const newItem: IdeaHistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      prompt,
      timestamp: new Date().toISOString(),
      ideas
    };
    setIdeaHistory(prev => [newItem, ...prev]);
  };

  const clearIdeaHistory = () => setIdeaHistory([]);

  const addCuratedIdea = (idea: CuratedIdea) => setCuratedIdeas(prev => [idea, ...prev]);
  const deleteCuratedIdea = (id: string) => setCuratedIdeas(prev => prev.filter(i => i.id !== id));

  const fetchTaxonomy = async () => {
    try {
      const response = await taxonomyAPI.getSummary();
      const data = response.data as TaxonomySummary;
      if (data.faculties?.length) setFaculties(data.faculties);
      if (data.departments?.length) setDepartments(data.departments);
      if (data.programs?.length) setPrograms(data.programs);
      if (data.domains?.length) setResearchDomains(data.domains);
      if (data.categories?.length) setProjectCategories(data.categories);
      if (data.academicYears?.length) setAcademicYears(data.academicYears);
    } catch (error) {
      console.error('Error fetching taxonomy, using fallback data:', error);
    }
  };

  const fetchCuratedIdeas = async () => {
    try {
      const response = await ideasAPI.getAll(undefined, undefined, {
        facultyId: refId(currentUser?.facultyId),
        departmentId: refId(currentUser?.departmentId),
        programId: refId(currentUser?.programId)
      });
      const ideas = response.data.map((idea: any) => ({
        id: idea._id,
        title: idea.title,
        description: idea.description,
        difficulty: idea.difficulty,
        technologies: idea.technologies || [],
        toolsOrMethods: idea.toolsOrMethods || idea.technologies || [],
        facultyId: idea.facultyId,
        departmentId: idea.departmentId,
        programId: idea.programId,
        categoryId: idea.categoryId,
        researchDomainIds: idea.researchDomainIds || [],
        category: idea.category
      }));
      setCuratedIdeas(ideas);
    } catch (error) {
      console.error('Error fetching curated ideas:', error);
    }
  };

  const addCuratedIdeaToBackend = async (idea: Omit<CuratedIdea, 'id'>) => {
    try {
      const response = await ideasAPI.create(idea);
      const newIdea = {
        id: response.data._id,
        title: response.data.title,
        description: response.data.description,
        difficulty: response.data.difficulty,
        technologies: response.data.technologies || [],
        toolsOrMethods: response.data.toolsOrMethods || response.data.technologies || [],
        facultyId: response.data.facultyId,
        departmentId: response.data.departmentId,
        programId: response.data.programId,
        categoryId: response.data.categoryId,
        researchDomainIds: response.data.researchDomainIds || [],
        category: response.data.category
      };
      setCuratedIdeas(prev => [newIdea, ...prev]);
    } catch (error) {
      console.error('Error adding curated idea:', error);
      throw error;
    }
  };

  const deleteCuratedIdeaFromBackend = async (id: string) => {
    try {
      await ideasAPI.delete(id);
      setCuratedIdeas(prev => prev.filter(i => i.id !== id));
    } catch (error) {
      console.error('Error deleting curated idea:', error);
      throw error;
    }
  };

  const fetchArchivedProjects = async (filters?: { department?: string; facultyId?: string; departmentId?: string; categoryId?: string; domainId?: string; search?: string }) => {
    try {
      const response = await projectsAPI.getArchived(filters);
      const projects = response.data.map(mapBackendArchivedProject);
      if (Array.isArray(response.data)) {
        setArchivedProjects(projects);
      }
    } catch (error) {
      console.error('Error fetching archived projects:', error);
    }
  };

  const addArchivedProject = async (project: { title: string; description: string; features: string[]; studentName: string; department: string; facultyId?: string; departmentId?: string; programId?: string; categoryId?: string; researchDomainIds?: string[]; year: number; technologies: string[]; toolsOrMethods?: string[] }) => {
    try {
      const response = await projectsAPI.createArchived(project);
      const newProject = mapBackendArchivedProject(response.data);
      setArchivedProjects(prev => [newProject, ...prev]);
    } catch (error) {
      console.error('Error adding archived project:', error);
      throw error;
    }
  };

  const updateUserProfile = async (updates: Partial<User>) => {
    if (!currentUser) return;
    
    const updatedUser = { ...currentUser, ...updates };
    setCurrentUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    
    // Also update in users array
    setUsers(prev => prev.map(u => u.id === currentUser.id ? updatedUser : u));

    try {
      const response = await usersAPI.update(currentUser.id, updates);
      const persistedUser = mapBackendUser(response.data);
      setCurrentUser(persistedUser);
      localStorage.setItem('currentUser', JSON.stringify(persistedUser));
      setUsers(prev => prev.map(u => u.id === currentUser.id ? persistedUser : u));
    } catch (error) {
      console.error('Error persisting profile update:', error);
    }
  };

  // Fetch supervisors from database and merge with local users
  const fetchSupervisors = async () => {
    try {
      const response = await usersAPI.getSupervisors();
      const dbSupervisors = response.data;
      console.log('Fetched supervisors from database:', dbSupervisors);
      
      if (dbSupervisors && dbSupervisors.length > 0) {
        // Map database supervisors to User type
        const mappedSupervisors: User[] = dbSupervisors.map(mapBackendUser);
        
        // Merge with existing users, replacing mock supervisors with real ones
        setUsers(prev => {
          // Remove mock supervisors
          const nonMockUsers = prev.filter(u => u.role !== UserRole.SUPERVISOR || !u.id.startsWith('sup'));
          // Add database supervisors
          const allUsers = [...nonMockUsers];
          mappedSupervisors.forEach((sup: User) => {
            if (!allUsers.some(u => u.id === sup.id || u.email === sup.email)) {
              allUsers.push(sup);
            }
          });
          return allUsers;
        });
      }
    } catch (error) {
      console.error('Error fetching supervisors:', error);
    }
  };

  // Announcement functions (API-based)
  const fetchAnnouncements = async () => {
    try {
      const response = await announcementsAPI.getAll();
      const data = response.data.map((a: any) => ({
        id: a._id || a.id,
        title: a.title,
        content: a.content,
        type: a.type,
        createdAt: a.createdAt,
        expiresAt: a.expiresAt,
        createdBy: a.createdBy,
        isActive: a.isActive
      }));
      setAnnouncements(data);
    } catch (error) {
      console.error('Error fetching announcements:', error);
    }
  };

  const addAnnouncement = async (announcement: Omit<Announcement, 'id' | 'createdAt'>) => {
    try {
      const response = await announcementsAPI.create({
        title: announcement.title,
        content: announcement.content,
        type: announcement.type,
        expiresAt: announcement.expiresAt,
        createdBy: announcement.createdBy
      });
      const newAnn = response.data;
      setAnnouncements(prev => [{
        id: newAnn._id || newAnn.id,
        title: newAnn.title,
        content: newAnn.content,
        type: newAnn.type,
        createdAt: newAnn.createdAt,
        expiresAt: newAnn.expiresAt,
        createdBy: newAnn.createdBy,
        isActive: newAnn.isActive
      }, ...prev]);
    } catch (error) {
      console.error('Error creating announcement:', error);
    }
  };

  const deleteAnnouncement = async (id: string) => {
    try {
      await announcementsAPI.delete(id);
      setAnnouncements(prev => prev.filter(a => a.id !== id));
    } catch (error) {
      console.error('Error deleting announcement:', error);
    }
  };

  const toggleAnnouncementActive = async (id: string) => {
    try {
      const response = await announcementsAPI.toggle(id);
      const updated = response.data;
      setAnnouncements(prev => prev.map(a => 
        a.id === id ? { ...a, isActive: updated.isActive } : a
      ));
    } catch (error) {
      console.error('Error toggling announcement:', error);
    }
  };

  // Guideline functions (API-based)
  const fetchGuidelines = async () => {
    try {
      const response = await guidelinesAPI.getAll();
      const data = response.data.map((g: any) => ({
        id: g._id || g.id,
        title: g.title,
        description: g.description,
        category: g.category,
        pdfUrl: g.pdfUrl,
        pdfFileName: g.pdfFileName,
        createdBy: g.createdBy,
        isActive: g.isActive,
        order: g.order,
        createdAt: g.createdAt
      }));
      setGuidelines(data);
    } catch (error) {
      console.error('Error fetching guidelines:', error);
    }
  };

  const addGuideline = async (formData: FormData) => {
    try {
      const response = await guidelinesAPI.create(formData);
      const newGuide = response.data;
      setGuidelines(prev => [{
        id: newGuide._id || newGuide.id,
        title: newGuide.title,
        description: newGuide.description,
        category: newGuide.category,
        pdfUrl: newGuide.pdfUrl,
        pdfFileName: newGuide.pdfFileName,
        createdBy: newGuide.createdBy,
        isActive: newGuide.isActive,
        order: newGuide.order,
        createdAt: newGuide.createdAt
      }, ...prev]);
    } catch (error) {
      console.error('Error creating guideline:', error);
    }
  };

  const deleteGuideline = async (id: string) => {
    try {
      await guidelinesAPI.delete(id);
      setGuidelines(prev => prev.filter(g => g.id !== id));
    } catch (error) {
      console.error('Error deleting guideline:', error);
    }
  };

  const toggleGuidelineActive = async (id: string) => {
    try {
      const response = await guidelinesAPI.toggle(id);
      const updated = response.data;
      setGuidelines(prev => prev.map(g => 
        g.id === id ? { ...g, isActive: updated.isActive } : g
      ));
    } catch (error) {
      console.error('Error toggling guideline:', error);
    }
  };

  return (
    <StoreContext.Provider value={{ 
      currentUser, projects, users, messages, archivedProjects, ideaHistory, curatedIdeas,
      faculties, departments, programs, researchDomains, projectCategories, academicYears,
      announcements, guidelines, theme, 
      isLoading, authError,
      toggleTheme, loginWithCredentials, register, login, logout, clearAuthError, addProject, updateProject, fetchProjects, sendMessage, markMessagesRead, fetchMessages,
      addIdeaToHistory, clearIdeaHistory, addCuratedIdea, deleteCuratedIdea, fetchCuratedIdeas, addCuratedIdeaToBackend, deleteCuratedIdeaFromBackend, fetchTaxonomy, fetchArchivedProjects, addArchivedProject, updateUserProfile, fetchSupervisors,
      addAnnouncement, deleteAnnouncement, toggleAnnouncementActive, fetchAnnouncements,
      addGuideline, deleteGuideline, toggleGuidelineActive, fetchGuidelines
    }}>
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) throw new Error("useStore must be used within StoreProvider");
  return context;
};
