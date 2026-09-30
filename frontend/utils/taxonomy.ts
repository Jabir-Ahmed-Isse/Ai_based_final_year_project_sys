import { Department, Faculty, Program, ProjectCategory, RefValue, ResearchDomain } from '../types';

export const refId = (value?: RefValue | null): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value._id || value.id || '';
};

export const refName = (value?: RefValue | null): string => {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value.name || '';
};

export const findFaculty = (faculties: Faculty[], id?: RefValue | null) =>
  faculties.find(faculty => faculty._id === refId(id) || faculty.id === refId(id));

export const findDepartment = (departments: Department[], id?: RefValue | null) =>
  departments.find(department => department._id === refId(id) || department.id === refId(id));

export const findProgram = (programs: Program[], id?: RefValue | null) =>
  programs.find(program => program._id === refId(id) || program.id === refId(id));

export const findCategory = (categories: ProjectCategory[], id?: RefValue | null) =>
  categories.find(category => category._id === refId(id) || category.id === refId(id));

export const departmentsForFaculty = (departments: Department[], facultyId?: RefValue | null) => {
  const id = refId(facultyId);
  if (!id) return departments;
  const filtered = departments.filter(department => refId(department.facultyId) === id);
  return filtered.length ? filtered : departments;
};

export const programsForDepartment = (programs: Program[], departmentId?: RefValue | null) => {
  const id = refId(departmentId);
  if (!id) return programs;
  const filtered = programs.filter(program => refId(program.departmentId) === id);
  return filtered.length ? filtered : programs;
};

export const categoriesForFaculty = (categories: ProjectCategory[], facultyId?: RefValue | null) => {
  const id = refId(facultyId);
  if (!id) return categories;
  const filtered = categories.filter(category => refId(category.facultyId) === id);
  return filtered.length ? filtered : categories;
};

export const domainsForFaculty = (domains: ResearchDomain[], facultyId?: RefValue | null) => {
  const id = refId(facultyId);
  if (!id) return domains;
  const filtered = domains.filter(domain => !domain.facultyIds?.length || domain.facultyIds.some(faculty => refId(faculty) === id));
  return filtered.length ? filtered : domains;
};
