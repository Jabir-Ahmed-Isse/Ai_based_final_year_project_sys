const Faculty = require('../models/Faculty');
const Department = require('../models/Department');
const Program = require('../models/Program');
const ResearchDomain = require('../models/ResearchDomain');
const ProjectCategory = require('../models/ProjectCategory');
const AcademicYear = require('../models/AcademicYear');

const facultyDefinitions = [
  {
    code: 'COMP',
    name: 'Faculty of Computing',
    description: 'Computing, information systems, software, data, networks, and AI.',
    departments: [
      { code: 'CS', name: 'Computer Science', programs: ['BSc Computer Science'] },
      { code: 'IT', name: 'Information Technology', programs: ['BSc Information Technology'] },
      { code: 'SE', name: 'Software Engineering', programs: ['BSc Software Engineering'] },
      { code: 'DS', name: 'Data Science', programs: ['BSc Data Science'] },
      { code: 'CYB', name: 'Cybersecurity', programs: ['BSc Cybersecurity'] }
    ],
    categories: [
      {
        name: 'Software System',
        description: 'A software, AI, data, mobile, web, or information system final year project.',
        expectedOutputs: ['Working prototype', 'Source code', 'Technical report', 'Testing evidence'],
        requiredProposalFields: ['title', 'abstract', 'problemStatement', 'objectives', 'features', 'toolsOrMethods'],
        outputLabel: 'Features / expected outputs',
        toolsLabel: 'Technologies used'
      },
      {
        name: 'Research Study',
        description: 'Computing research based on algorithms, data, models, or comparative analysis.',
        expectedOutputs: ['Research report', 'Dataset or experiment results', 'Analysis'],
        requiredProposalFields: ['title', 'abstract', 'problemStatement', 'objectives', 'keywords'],
        outputLabel: 'Research outputs',
        toolsLabel: 'Tools, datasets, or methods'
      }
    ]
  },
  {
    code: 'ENG',
    name: 'Faculty of Engineering',
    description: 'Civil, electrical, mechanical, and related engineering design projects.',
    departments: [
      { code: 'CE', name: 'Civil Engineering', programs: ['BEng Civil Engineering'] },
      { code: 'EE', name: 'Electrical Engineering', programs: ['BEng Electrical Engineering'] },
      { code: 'ME', name: 'Mechanical Engineering', programs: ['BEng Mechanical Engineering'] }
    ],
    categories: [
      {
        name: 'Engineering Design Project',
        description: 'Design, prototype, simulation, testing, or engineering analysis project.',
        expectedOutputs: ['Design specification', 'Prototype or simulation', 'Testing report', 'Safety considerations'],
        requiredProposalFields: ['title', 'abstract', 'problemStatement', 'objectives', 'expectedOutputs'],
        outputLabel: 'Design outputs',
        toolsLabel: 'Tools, materials, or methods'
      }
    ]
  },
  {
    code: 'MED',
    name: 'Faculty of Medicine',
    description: 'Health, clinical, public health, and medical research projects.',
    departments: [
      { code: 'MED', name: 'Medicine', programs: ['MBBS Medicine'] },
      { code: 'PH', name: 'Public Health', programs: ['BSc Public Health'] },
      { code: 'NUR', name: 'Nursing', programs: ['BSc Nursing'] }
    ],
    categories: [
      {
        name: 'Health Research Study',
        description: 'Clinical, public health, case-study, or health systems research.',
        expectedOutputs: ['Research report', 'Ethics-aware methodology', 'Findings and recommendations'],
        requiredProposalFields: ['title', 'abstract', 'problemStatement', 'objectives', 'keywords'],
        outputLabel: 'Study outputs',
        toolsLabel: 'Study methods or instruments'
      }
    ]
  },
  {
    code: 'BUS',
    name: 'Faculty of Business',
    description: 'Business, management, accounting, finance, and entrepreneurship projects.',
    departments: [
      { code: 'ACC', name: 'Accounting', programs: ['BBA Accounting'] },
      { code: 'FIN', name: 'Finance', programs: ['BBA Finance'] },
      { code: 'MGT', name: 'Management', programs: ['BBA Management'] }
    ],
    categories: [
      {
        name: 'Business Research Project',
        description: 'Market, financial, operational, entrepreneurship, or management research.',
        expectedOutputs: ['Business analysis', 'Findings', 'Recommendations'],
        requiredProposalFields: ['title', 'abstract', 'problemStatement', 'objectives', 'keywords'],
        outputLabel: 'Business outputs',
        toolsLabel: 'Analysis methods or tools'
      }
    ]
  },
  {
    code: 'EDU',
    name: 'Faculty of Education',
    description: 'Teaching, curriculum, assessment, and educational research projects.',
    departments: [
      { code: 'CUR', name: 'Curriculum and Instruction', programs: ['BEd Curriculum and Instruction'] },
      { code: 'ELM', name: 'Educational Leadership', programs: ['BEd Educational Leadership'] }
    ],
    categories: [
      {
        name: 'Education Research Project',
        description: 'Pedagogy, curriculum, teaching intervention, or learner outcome research.',
        expectedOutputs: ['Intervention plan', 'Assessment evidence', 'Educational recommendations'],
        requiredProposalFields: ['title', 'abstract', 'problemStatement', 'objectives', 'keywords'],
        outputLabel: 'Educational outputs',
        toolsLabel: 'Teaching methods or research instruments'
      }
    ]
  },
  {
    code: 'AGR',
    name: 'Faculty of Agriculture',
    description: 'Agriculture, agribusiness, soil, crop, livestock, and field research projects.',
    departments: [
      { code: 'AGS', name: 'Agricultural Science', programs: ['BSc Agricultural Science'] },
      { code: 'AGB', name: 'Agribusiness', programs: ['BSc Agribusiness'] }
    ],
    categories: [
      {
        name: 'Agriculture Research Project',
        description: 'Field, crop, livestock, soil, water, productivity, or agribusiness research.',
        expectedOutputs: ['Field findings', 'Productivity analysis', 'Recommendations'],
        requiredProposalFields: ['title', 'abstract', 'problemStatement', 'objectives', 'keywords'],
        outputLabel: 'Field or research outputs',
        toolsLabel: 'Methods, inputs, or tools'
      }
    ]
  }
];

const domainDefinitions = [
  { name: 'Artificial Intelligence', aliases: ['AI', 'Machine Learning'], keywords: ['ai', 'machine learning', 'deep learning', 'nlp', 'computer vision'], faculties: ['COMP', 'MED', 'ENG', 'AGR', 'BUS', 'EDU'] },
  { name: 'Software Engineering', aliases: ['Software', 'Web Systems'], keywords: ['software', 'web', 'mobile', 'requirements', 'testing'], faculties: ['COMP'] },
  { name: 'Cybersecurity', aliases: ['Security'], keywords: ['security', 'network security', 'privacy', 'authentication'], faculties: ['COMP', 'BUS'] },
  { name: 'Data Science', aliases: ['Analytics'], keywords: ['data', 'analytics', 'statistics', 'prediction'], faculties: ['COMP', 'BUS', 'MED', 'AGR', 'EDU'] },
  { name: 'Public Health', aliases: ['Healthcare'], keywords: ['health', 'patient', 'clinical', 'disease', 'epidemiology'], faculties: ['MED'] },
  { name: 'Biomedical Devices', aliases: ['Medical Engineering'], keywords: ['device', 'sensor', 'diagnostic', 'biomedical'], faculties: ['MED', 'ENG', 'COMP'] },
  { name: 'Renewable Energy', aliases: ['Energy Systems'], keywords: ['solar', 'wind', 'energy', 'power'], faculties: ['ENG', 'AGR'] },
  { name: 'Structural Design', aliases: ['Civil Design'], keywords: ['structure', 'building', 'construction', 'materials'], faculties: ['ENG'] },
  { name: 'Finance', aliases: ['Financial Analysis'], keywords: ['finance', 'banking', 'investment', 'risk'], faculties: ['BUS'] },
  { name: 'Entrepreneurship', aliases: ['Business Innovation'], keywords: ['startup', 'business model', 'market', 'innovation'], faculties: ['BUS'] },
  { name: 'Curriculum Design', aliases: ['Pedagogy'], keywords: ['curriculum', 'teaching', 'learning', 'assessment'], faculties: ['EDU'] },
  { name: 'Agribusiness', aliases: ['Agricultural Economics'], keywords: ['agribusiness', 'value chain', 'market', 'farm income'], faculties: ['AGR', 'BUS'] },
  { name: 'Soil and Crop Science', aliases: ['Crop Production'], keywords: ['soil', 'crop', 'irrigation', 'yield'], faculties: ['AGR'] }
];

async function seedTaxonomy() {
  try {
    const facultyByCode = {};
    const facultyCodeAliases = {
      COMP: ['COMP', 'CSIT'],
      MED: ['MED', 'MHS'],
      BUS: ['BUS', 'EMS'],
      EDU: ['EDU', 'FAS'],
      ENG: ['ENG'],
      AGR: ['AGR']
    };

    const findOrCreateFaculty = async (facultyDef) => {
      const codeAliases = facultyCodeAliases[facultyDef.code] || [facultyDef.code];
      let faculty = await Faculty.findOne({ code: { $in: codeAliases } });
      if (!faculty) {
        faculty = await Faculty.findOneAndUpdate(
          { code: facultyDef.code },
          {
            $set: {
              name: facultyDef.name,
              description: facultyDef.description,
              isActive: true
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      } else {
        faculty.name = faculty.name || facultyDef.name;
        faculty.description = faculty.description || facultyDef.description;
        faculty.isActive = true;
        await faculty.save();
      }
      facultyByCode[facultyDef.code] = faculty;
      return faculty;
    };

    for (const facultyDef of facultyDefinitions) {
      const faculty = await findOrCreateFaculty(facultyDef);

      for (const deptDef of facultyDef.departments) {
        let department = await Department.findOne({
          facultyId: faculty._id,
          $or: [{ code: deptDef.code }, { name: deptDef.name }]
        });

        if (department) {
          department.name = department.name || deptDef.name;
          department.code = department.code || deptDef.code;
          department.isActive = true;
          await department.save();
        } else {
          department = await Department.create({
            facultyId: faculty._id,
            code: deptDef.code,
            name: deptDef.name,
            isActive: true
          });
        }

        for (const programName of deptDef.programs) {
          await Program.findOneAndUpdate(
            { departmentId: department._id, name: programName },
            {
              $set: {
                facultyId: faculty._id,
                departmentId: department._id,
                code: `${deptDef.code}-${programName.split(' ').slice(-1)[0].replace(/[^a-z0-9]/gi, '').toUpperCase()}`,
                name: programName,
                isActive: true
              }
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
          );
        }
      }

      for (const category of facultyDef.categories) {
        await ProjectCategory.findOneAndUpdate(
          { facultyId: faculty._id, name: category.name },
          {
            $set: {
              ...category,
              facultyId: faculty._id,
              isActive: true
            }
          },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        );
      }
    }

    for (const domainDef of domainDefinitions) {
      const domainCode = domainDef.name
        .replace(/[^a-z0-9]+/gi, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 24)
        .toUpperCase();

      await ResearchDomain.findOneAndUpdate(
        { name: domainDef.name },
        {
          $set: {
            name: domainDef.name,
            code: domainCode,
            aliases: domainDef.aliases,
            keywords: domainDef.keywords,
            facultyIds: domainDef.faculties.map(code => facultyByCode[code]?._id).filter(Boolean),
            isActive: true
          }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const currentYear = new Date().getFullYear();
    await AcademicYear.findOneAndUpdate(
      { label: `${currentYear}/${currentYear + 1}` },
      {
        $set: {
          label: `${currentYear}/${currentYear + 1}`,
          startsAt: new Date(currentYear, 7, 1),
          endsAt: new Date(currentYear + 1, 6, 31),
          isActive: true
        }
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await Faculty.updateMany({}, { $set: { isActive: true } });
    await Department.updateMany({}, { $set: { isActive: true } });

    const allFaculties = await Faculty.find({ isActive: true });
    for (const faculty of allFaculties) {
      const categoryCount = await ProjectCategory.countDocuments({ facultyId: faculty._id, isActive: true });
      if (categoryCount === 0) {
        await ProjectCategory.create({
          facultyId: faculty._id,
          name: `${faculty.code} General Graduation Project`,
          description: 'Default category for graduation project proposals.',
          expectedOutputs: ['Project report', 'Findings or deliverable', 'Evaluation evidence'],
          requiredProposalFields: ['title', 'abstract', 'problemStatement', 'objectives'],
          outputLabel: 'Expected outputs',
          toolsLabel: 'Tools, methods, or instruments',
          isActive: true
        });
      }

      const departments = await Department.find({ facultyId: faculty._id, isActive: true });
      for (const department of departments) {
        const programCount = await Program.countDocuments({ departmentId: department._id, isActive: true });
        if (programCount === 0) {
          await Program.create({
            facultyId: faculty._id,
            departmentId: department._id,
            code: `${department.code}-UG`,
            name: `Undergraduate ${department.name}`,
            level: 'Undergraduate',
            isActive: true
          });
        }
      }
    }

    console.log('Ensured multi-faculty academic taxonomy');
  } catch (err) {
    console.error('Taxonomy seed error:', err.message);
  }
}

module.exports = { seedTaxonomy };
