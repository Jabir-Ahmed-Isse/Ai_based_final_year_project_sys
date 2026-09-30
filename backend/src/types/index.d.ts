export declare enum UserRole {
    STUDENT = "student",
    SUPERVISOR = "supervisor",
    ADMIN = "admin"
}
export interface User {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    password?: string;
    department?: string;
    studentId?: string;
    expertise?: string[];
    researchInterests?: string[];
    areasOfExpertise?: string[];
    academicSpecialization?: string;
    skills?: string[];
    supervisorTechnologies?: string[];
    previousSupervisedProjectTopics?: string[];
    publicationKeywords?: string[];
    createdAt?: Date;
    updatedAt?: Date;
}
export interface AuthRequest extends Request {
    user?: {
        id: string;
        role: UserRole;
    };
}
//# sourceMappingURL=index.d.ts.map