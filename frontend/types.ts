
export enum UserRole {
  STUDENT = 'STUDENT',
  SUPERVISOR = 'SUPERVISOR',
  ADMIN = 'ADMIN'
}

export enum ProjectStatus {
  DRAFT = 'DRAFT',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  CHANGES_REQUESTED = 'CHANGES_REQUESTED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED'
}

export interface TaxonomyRef {
  _id?: string;
  id?: string;
  name: string;
  code?: string;
}

export type RefValue = string | TaxonomyRef;

export interface Faculty {
  _id: string;
  id?: string;
  name: string;
  code: string;
  description?: string;
  isActive: boolean;
}

export interface Department {
  _id: string;
  id?: string;
  facultyId: RefValue;
  name: string;
  code: string;
  isActive: boolean;
}

export interface Program {
  _id: string;
  id?: string;
  facultyId: RefValue;
  departmentId: RefValue;
  name: string;
  level?: string;
  code: string;
  isActive: boolean;
}

export interface ResearchDomain {
  _id: string;
  id?: string;
  name: string;
  aliases?: string[];
  keywords?: string[];
  facultyIds?: RefValue[];
  isActive: boolean;
}

export interface ProjectCategory {
  _id: string;
  id?: string;
  facultyId: RefValue;
  departmentId?: RefValue;
  name: string;
  description?: string;
  expectedOutputs?: string[];
  requiredProposalFields?: string[];
  outputLabel?: string;
  toolsLabel?: string;
  isActive: boolean;
}

export interface AcademicYear {
  _id: string;
  id?: string;
  label: string;
  startsAt?: string;
  endsAt?: string;
  isActive: boolean;
}

export interface TaxonomySummary {
  faculties: Faculty[];
  departments: Department[];
  programs: Program[];
  domains: ResearchDomain[];
  categories: ProjectCategory[];
  academicYears: AcademicYear[];
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  facultyId?: RefValue;
  departmentId?: RefValue;
  programId?: RefValue;
  department?: string;
  avatar?: string;
  expertise?: string[];
  researchInterests?: string[];
  areasOfExpertise?: string[];
  academicSpecialization?: string;
  skills?: string[];
  supervisorTechnologies?: string[];
  previousSupervisedProjectTopics?: string[];
  publicationKeywords?: string[];
  expertiseDomainIds?: RefValue[];
  cvSummary?: string; 
  studentId?: string;
  maxProjects?: number;
  currentProjects?: number;
  crossFacultyEligible?: boolean;
  availableForAssignment?: boolean;
  performanceMetrics?: {
    projectsSupervised: number;
    avgResponseTimeHours: number;
    studentSatisfactionScore: number;
  }
}

export interface ProjectProposal {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  description: string;
  features?: string[];
  objectives: string[];
  technologies: string[];
  problemStatement?: string;
  expectedOutputs?: string[];
  toolsOrMethods?: string[];
  facultyId?: RefValue;
  departmentId?: RefValue;
  programId?: RefValue;
  academicYearId?: RefValue;
  categoryId?: RefValue;
  researchDomainIds?: RefValue[];
  department?: string;
  status: ProjectStatus;
  similarityScore?: number;
  similarityRisk?: 'Low' | 'Medium' | 'High';
  supervisorId?: string;
  feedback?: string;
  submissionDate: string;
}

export interface AIProjectIdea {
  title: string;
  description: string;
  difficulty: string;
  technologies: string[];
  toolsOrMethods?: string[];
  isCurated?: boolean; // New flag for admin-seeded ideas
}

export interface CuratedIdea {
  id: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  technologies: string[];
  toolsOrMethods?: string[];
  facultyId?: RefValue;
  departmentId?: RefValue;
  programId?: RefValue;
  categoryId?: RefValue;
  researchDomainIds?: RefValue[];
  category?: string;
}

export interface SupervisorRecommendation {
  supervisorId: string;
  supervisorName: string;
  matchScore: number;
  reason: string;
}

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  timestamp: string;
  read: boolean;
  fileAttachment?: {
    name: string;
    url: string;
    type: string;
    size: number;
  };
}

export interface ArchivedProject {
  id: string;
  title: string;
  studentName: string;
  year: number;
  abstract: string;
  features?: string[];
  technologies: string[];
  toolsOrMethods?: string[];
  facultyId?: RefValue;
  departmentId?: RefValue;
  programId?: RefValue;
  categoryId?: RefValue;
  researchDomainIds?: RefValue[];
  department: string;
}

export interface Announcement {
  id: string;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'urgent' | 'guideline';
  createdAt: string;
  expiresAt?: string;
  createdBy: string;
  isActive: boolean;
}

export interface Guideline {
  id: string;
  title: string;
  description: string;
  category: 'research' | 'proposal' | 'submission' | 'defense' | 'general';
  pdfUrl?: string;
  pdfFileName?: string;
  createdBy: string;
  isActive: boolean;
  order: number;
  createdAt: string;
}
