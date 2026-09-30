const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Keep seeding offline and deterministic. The application similarity workflow is unchanged.
process.env.DISABLE_TRANSFORMER_SIMILARITY = process.env.DISABLE_TRANSFORMER_SIMILARITY || 'true';

const Project = require('../src/models/Project');
const SimilarityReport = require('../src/models/SimilarityReport');
const Faculty = require('../src/models/Faculty');
const Department = require('../src/models/Department');
const {
  calculateSimilarity,
  calculateProjectSimilarity
} = require('../src/services/similarityService');

const TARGET_PROJECT_COUNT = 100;
const TARGET_LOW_COMPARISONS = 50;
const TARGET_MEDIUM_COMPARISONS = 50;
const SEED_TAG = 'chart-seed-2026';

const originalWarn = console.warn;
console.warn = (...args) => {
  if (String(args[0] || '').includes('Using fallback semantic embedding')) return;
  originalWarn(...args);
};

const studentNames = [
  'Ayan Mohamed', 'Yusuf Abdullahi', 'Hodan Ali', 'Abdirahman Hassan', 'Najma Ahmed',
  'Omar Farah', 'Sahra Muse', 'Khadar Ismail', 'Fatima Abdi', 'Mustafa Salad',
  'Ibrahim Yusuf', 'Maryan Osman', 'Hamza Noor', 'Fadumo Warsame', 'Mohamed Jama',
  'Nimco Said', 'Abdalla Mohamud', 'Zahra Ahmed', 'Khalid Hassan', 'Ifrah Ali'
];

function pick(list, index) {
  return list[index % list.length];
}

function buildDepartmentLookup(departments) {
  const byName = new Map();
  for (const department of departments) {
    byName.set(department.name.toLowerCase(), department);
  }
  return byName;
}

function departmentFor(byName, preferredNames, departments) {
  for (const name of preferredNames) {
    const match = byName.get(name.toLowerCase());
    if (match) return match;
  }
  return departments[0];
}

function clusterProjects(cluster, byName, departments) {
  const department = departmentFor(byName, cluster.departments, departments);
  const faculty = department.facultyId;

  return cluster.titles.map((title, index) => {
    const variant = cluster.variants[index % cluster.variants.length];
    const year = 2023 + (index % 4);
    const month = (index % 12);
    const createdAt = new Date(Date.UTC(year, month, 8 + (index % 18)));

    return {
      title,
      abstract: `${cluster.abstract} This project focuses on ${variant.toLowerCase()} and applies ${cluster.methods.join(', ')} to produce measurable academic and operational outcomes. The work includes requirements analysis, system design, implementation, validation, and reporting for final year project assessment.`,
      features: [
        ...cluster.features,
        `${variant} dashboard`,
        'Role-based reporting and review workflow'
      ],
      problemStatement: `${cluster.problem} Existing manual or fragmented processes make review, monitoring, and evidence-based decisions difficult for students, supervisors, and administrators.`,
      objectives: [
        `Design a reliable ${cluster.domain.toLowerCase()} solution`,
        `Improve data visibility for ${variant.toLowerCase()}`,
        'Evaluate the system using realistic final year project scenarios'
      ],
      expectedOutputs: [
        'Working web or mobile prototype',
        'Database-backed reporting module',
        'Evaluation summary with measurable indicators'
      ],
      toolsOrMethods: cluster.methods,
      technologies: cluster.technologies,
      status: 'completed',
      facultyId: faculty?._id,
      departmentId: department._id,
      department: department.name,
      keywords: [...cluster.keywords, SEED_TAG],
      archivedStudentName: pick(studentNames, title.length + index),
      archivedYear: year,
      submissionDate: createdAt,
      createdAt,
      updatedAt: createdAt
    };
  });
}

function buildCatalog(departments) {
  const byName = buildDepartmentLookup(departments);
  const clusters = [
    {
      domain: 'Graduation Project Lifecycle Management',
      departments: ['Software Engineering', 'Computer Science', 'Information Technology'],
      abstract: 'A web-based academic platform manages graduation project proposal submission, supervisor assignment, semantic similarity checking, progress review, feedback, and final approval.',
      problem: 'Universities need a structured way to coordinate final year projects and reduce repeated project ideas.',
      methods: ['MERN Stack', 'semantic similarity analysis', 'role-based access control'],
      technologies: ['React', 'Node.js', 'MongoDB', 'Python', 'NumPy'],
      keywords: ['graduation projects', 'similarity checking', 'supervisor assignment', 'academic workflow'],
      features: ['Proposal submission', 'Supervisor matching', 'Similarity score visualization'],
      variants: ['AI supervisor allocation', 'semantic proposal comparison', 'admin reporting', 'student progress tracking'],
      titles: [
        'AI-Based Final Year Project Lifecycle Management System',
        'AI-Driven Graduation Project Administration and Semantic Similarity Platform',
        'Smart Supervisor Allocation System for Final Year Project Management',
        'Semantic Similarity Based Academic Project Proposal Review System',
        'Web-Based Graduation Project Tracking and Approval Portal'
      ]
    },
    {
      domain: 'Hospital and Patient Management',
      departments: ['Medicine', 'Medicine and Surgery', 'Public Health', 'Software Engineering'],
      abstract: 'A healthcare information system supports patient registration, appointments, diagnosis records, laboratory requests, prescription tracking, and medical reporting.',
      problem: 'Clinics and hospitals often rely on paper-based patient records that delay service delivery and reporting.',
      methods: ['database design', 'clinical workflow modelling', 'secure web application development'],
      technologies: ['React', 'Express', 'MongoDB', 'REST API'],
      keywords: ['hospital', 'patient records', 'appointments', 'healthcare'],
      features: ['Patient registration', 'Appointment scheduling', 'Clinical report generation'],
      variants: ['outpatient workflow', 'laboratory result tracking', 'medicine prescription control', 'doctor appointment management'],
      titles: [
        'Hospital Appointment and Patient Record Management System',
        'Clinic Patient Registration and Medical History Tracking Platform',
        'Electronic Health Record System for Outpatient Departments',
        'Laboratory Request and Patient Result Management System',
        'Digital Prescription and Pharmacy Queue Management System'
      ]
    },
    {
      domain: 'Retail Inventory and Sales',
      departments: ['Business Administration', 'Accounting', 'Software Engineering', 'Information Technology'],
      abstract: 'A business management application handles product stock, sales transactions, supplier records, purchase orders, customer invoices, and profit analytics.',
      problem: 'Small retail businesses lose revenue because manual inventory and sales records are inaccurate.',
      methods: ['inventory analytics', 'transaction processing', 'dashboard reporting'],
      technologies: ['React', 'Node.js', 'MongoDB', 'Chart.js'],
      keywords: ['inventory', 'sales', 'retail', 'stock management'],
      features: ['Stock monitoring', 'Sales invoice generation', 'Supplier management'],
      variants: ['low stock alerts', 'daily sales analytics', 'supplier order tracking', 'profit margin reports'],
      titles: [
        'Inventory and Sales Management System for Retail Stores',
        'Point of Sale and Stock Control Platform for Small Businesses',
        'Supplier Purchase Order and Inventory Tracking System',
        'Retail Sales Analytics Dashboard with Stock Forecasting',
        'Barcode-Based Product Inventory Management Application'
      ]
    },
    {
      domain: 'E-Learning and Academic Assessment',
      departments: ['Curriculum and Instruction', 'Educational Leadership', 'Computer Science', 'Information Technology'],
      abstract: 'An online learning environment manages courses, lessons, assignments, quizzes, grading, attendance, and student performance analytics.',
      problem: 'Students and lecturers need better digital tools for course delivery, assessment, and academic feedback.',
      methods: ['learning management system design', 'assessment analytics', 'responsive web development'],
      technologies: ['React', 'Firebase', 'Node.js', 'MongoDB'],
      keywords: ['e-learning', 'courses', 'assessment', 'student performance'],
      features: ['Course content management', 'Online quizzes', 'Performance reports'],
      variants: ['quiz auto-grading', 'course progress tracking', 'lecturer feedback workflow', 'attendance analytics'],
      titles: [
        'E-Learning Management System with Online Assessment',
        'Student Course Progress Tracking and Quiz Platform',
        'Digital Classroom Attendance and Assignment Submission System',
        'Lecturer Feedback and Continuous Assessment Portal',
        'Learning Analytics Dashboard for University Courses'
      ]
    },
    {
      domain: 'Library and Digital Archive',
      departments: ['Information Technology', 'Database Systems and Administration', 'Computer Science'],
      abstract: 'A library and archive system manages book catalogues, borrowing records, digital documents, overdue notices, reservations, and search discovery.',
      problem: 'Manual library records make it hard to track resources, borrowers, and digital academic materials.',
      methods: ['information retrieval', 'catalogue indexing', 'database administration'],
      technologies: ['React', 'Express', 'MongoDB', 'Elasticsearch'],
      keywords: ['library', 'archive', 'borrowing', 'catalogue'],
      features: ['Book catalogue search', 'Borrowing history', 'Digital document archive'],
      variants: ['book reservation', 'digital thesis archive', 'overdue notification', 'catalogue discovery'],
      titles: [
        'Digital Library Borrowing and Book Reservation System',
        'University Thesis Archive and Search Management Platform',
        'Library Catalogue Discovery System with Borrower Tracking',
        'Academic Digital Repository for Final Year Project Reports',
        'Overdue Book Notification and Library Inventory System'
      ]
    },
    {
      domain: 'Cybersecurity and Network Monitoring',
      departments: ['Cybersecurity', 'Networking', 'Computer Science'],
      abstract: 'A security monitoring system analyses network events, login attempts, suspicious traffic, device status, alerts, and incident response records.',
      problem: 'Organizations need early detection of suspicious network activity and better incident documentation.',
      methods: ['network traffic analysis', 'rule-based detection', 'security dashboarding'],
      technologies: ['Python', 'Flask', 'React', 'Scikit-learn'],
      keywords: ['cybersecurity', 'network monitoring', 'intrusion detection', 'alerts'],
      features: ['Threat alert dashboard', 'Traffic log analysis', 'Incident ticketing'],
      variants: ['intrusion alert scoring', 'login anomaly detection', 'network uptime monitoring', 'incident response workflow'],
      titles: [
        'Network Intrusion Detection and Alert Management System',
        'Login Anomaly Detection Platform for University Networks',
        'Real-Time Network Device Monitoring Dashboard',
        'Cybersecurity Incident Reporting and Response System',
        'Firewall Log Analysis System for Threat Detection'
      ]
    },
    {
      domain: 'Agriculture and Food Security',
      departments: ['Agricultural Science', 'Crop Production', 'Agribusiness', 'Soil and Water Management'],
      abstract: 'An agricultural decision-support platform helps farmers monitor crops, soil moisture, irrigation needs, market prices, disease symptoms, and production records.',
      problem: 'Farmers need accessible tools for crop monitoring, irrigation planning, and disease prevention.',
      methods: ['IoT sensing', 'image-based crop analysis', 'agricultural advisory modelling'],
      technologies: ['Python', 'React Native', 'TensorFlow', 'IoT Sensors'],
      keywords: ['agriculture', 'crop disease', 'irrigation', 'farm management'],
      features: ['Crop advisory records', 'Irrigation scheduling', 'Farm analytics'],
      variants: ['crop disease detection', 'soil moisture monitoring', 'market price advisory', 'farm production tracking'],
      titles: [
        'Smart Crop Disease Detection System for Local Farmers',
        'IoT-Based Soil Moisture and Irrigation Monitoring Platform',
        'Farm Production and Market Price Advisory Application',
        'Agribusiness Record Keeping System for Smallholder Farmers',
        'Mobile Crop Advisory System for Food Security Planning'
      ]
    },
    {
      domain: 'Finance and Fraud Analytics',
      departments: ['Finance', 'Accounting', 'Economics', 'Data Science'],
      abstract: 'A financial analytics system supports transaction monitoring, budget tracking, loan assessment, fraud alerts, expense categorization, and management reports.',
      problem: 'Financial institutions and small businesses need data-driven controls to reduce risk and improve decisions.',
      methods: ['financial data analysis', 'risk scoring', 'dashboard visualization'],
      technologies: ['Python', 'Pandas', 'React', 'MongoDB'],
      keywords: ['finance', 'fraud detection', 'loan scoring', 'budget tracking'],
      features: ['Transaction categorization', 'Risk score calculation', 'Financial report export'],
      variants: ['mobile money fraud alerts', 'loan repayment scoring', 'budget variance tracking', 'expense analytics'],
      titles: [
        'Mobile Money Fraud Detection and Transaction Monitoring System',
        'Microfinance Loan Eligibility and Repayment Scoring Platform',
        'Small Business Expense Tracking and Budget Analysis System',
        'Financial Transaction Dashboard for Suspicious Activity Review',
        'Accounting Report Automation System for Local Businesses'
      ]
    },
    {
      domain: 'Public Health and Community Services',
      departments: ['Public Health', 'Nursing', 'Medical Laboratory', 'Midwifery'],
      abstract: 'A public health platform records community cases, vaccination follow-up, maternal health visits, laboratory screening, referrals, and outreach reports.',
      problem: 'Community health workers need reliable tools to follow up patients and report public health indicators.',
      methods: ['public health surveillance', 'mobile data collection', 'health indicator reporting'],
      technologies: ['React Native', 'Node.js', 'MongoDB', 'Data Visualization'],
      keywords: ['public health', 'maternal care', 'vaccination', 'community health'],
      features: ['Community case registration', 'Follow-up reminders', 'Health indicator charts'],
      variants: ['maternal visit tracking', 'vaccination schedule follow-up', 'laboratory screening records', 'community referral monitoring'],
      titles: [
        'Maternal Health Visit Tracking System for Community Clinics',
        'Vaccination Follow-Up and Child Health Reminder Platform',
        'Community Disease Surveillance and Case Reporting System',
        'Laboratory Screening Record Management for Public Health',
        'Health Outreach Referral and Follow-Up Management Application'
      ]
    },
    {
      domain: 'Environment and Disaster Response',
      departments: ['Environmental Science', 'Geography', 'Natural Resource Management', 'Civil Engineering'],
      abstract: 'An environmental management system maps risks, tracks incidents, monitors resources, supports emergency response, and visualizes geospatial indicators.',
      problem: 'Communities need better tools for disaster preparedness, environmental monitoring, and response coordination.',
      methods: ['GIS mapping', 'resource allocation modelling', 'environmental data analysis'],
      technologies: ['React', 'Leaflet', 'Python', 'MongoDB'],
      keywords: ['environment', 'disaster response', 'GIS', 'resource management'],
      features: ['Incident map', 'Resource allocation', 'Risk category reporting'],
      variants: ['flood risk mapping', 'emergency resource tracking', 'waste collection monitoring', 'natural resource reporting'],
      titles: [
        'Web-Based Disaster Response and Emergency Resource Management System',
        'GIS Flood Risk Mapping and Community Alert Platform',
        'Environmental Incident Reporting and Waste Collection Tracker',
        'Natural Resource Monitoring Dashboard for Local Authorities',
        'Emergency Shelter and Relief Item Allocation System'
      ]
    },
    {
      domain: 'Human Resource and Administration',
      departments: ['Human Resource Management', 'Management', 'Business Administration', 'Public Administration'],
      abstract: 'An administrative system manages employee records, recruitment, leave requests, payroll summaries, performance evaluation, and organizational reporting.',
      problem: 'Organizations need digital HR workflows to reduce paperwork and improve decision-making.',
      methods: ['workflow automation', 'administrative reporting', 'role-based management'],
      technologies: ['React', 'Node.js', 'MongoDB', 'REST API'],
      keywords: ['human resource', 'payroll', 'leave management', 'administration'],
      features: ['Employee profile records', 'Leave approval workflow', 'Performance reports'],
      variants: ['leave request approval', 'payroll summary reporting', 'recruitment applicant tracking', 'employee performance review'],
      titles: [
        'Employee Leave Management and Approval Workflow System',
        'Human Resource Payroll Summary and Staff Record Platform',
        'Recruitment Applicant Tracking System for Local Organizations',
        'Employee Performance Evaluation and Reporting Dashboard',
        'Public Office Document Request and Staff Administration Portal'
      ]
    },
    {
      domain: 'Islamic Studies and Social Support',
      departments: ['Islamic Studies', 'Shari’a Law', 'Da’wah and Islamic Education', 'Leadership and Governance'],
      abstract: 'A social support and Islamic education platform manages zakat records, community assistance, learning resources, case review, and transparent reporting.',
      problem: 'Community organizations need accountable systems for social support, religious education, and governance records.',
      methods: ['case management', 'transparent reporting', 'educational content management'],
      technologies: ['React', 'Node.js', 'MongoDB', 'PDF Reporting'],
      keywords: ['zakat', 'community support', 'Islamic education', 'governance'],
      features: ['Beneficiary registration', 'Case review workflow', 'Donation reporting'],
      variants: ['zakat distribution tracking', 'Islamic learning content', 'community assistance records', 'governance meeting reports'],
      titles: [
        'Zakat Collection and Beneficiary Distribution Management System',
        'Islamic Learning Resource and Student Progress Platform',
        'Community Assistance Case Review and Reporting System',
        'Governance Meeting Resolution and Action Tracking Portal',
        'Da’wah Event Registration and Outreach Reporting Application'
      ]
    },
    {
      domain: 'Engineering and Smart Infrastructure',
      departments: ['Civil Engineering', 'Electrical Engineering', 'Mechanical Engineering', 'Telecommunications Engineering'],
      abstract: 'An engineering management system supports infrastructure monitoring, maintenance scheduling, safety inspection, power usage records, and technical reporting.',
      problem: 'Engineering teams need better systems for inspection, maintenance planning, and operational safety.',
      methods: ['IoT monitoring', 'maintenance analytics', 'engineering inspection workflow'],
      technologies: ['Arduino', 'Python', 'React', 'MongoDB'],
      keywords: ['engineering', 'maintenance', 'infrastructure', 'monitoring'],
      features: ['Inspection checklist', 'Maintenance schedule', 'Technical report dashboard'],
      variants: ['building safety inspection', 'power usage monitoring', 'equipment maintenance scheduling', 'telecom tower status tracking'],
      titles: [
        'Building Site Safety Inspection and Reporting System',
        'Smart Power Usage Monitoring Dashboard for Campus Buildings',
        'Mechanical Equipment Maintenance Scheduling Platform',
        'Telecommunication Tower Fault Reporting and Status Tracker',
        'Civil Infrastructure Defect Logging and Repair Management System'
      ]
    },
    {
      domain: 'Media and Civic Participation',
      departments: ['Journalism and Media', 'International Relations', 'Sociology', 'Political Science'],
      abstract: 'A civic information platform manages news verification, community surveys, public feedback, event reports, and social research dashboards.',
      problem: 'Media and civic organizations need structured digital tools for verified reporting and community engagement.',
      methods: ['survey analysis', 'content verification workflow', 'social data visualization'],
      technologies: ['React', 'Node.js', 'MongoDB', 'Data Charts'],
      keywords: ['media', 'civic engagement', 'survey', 'community feedback'],
      features: ['Survey collection', 'Feedback analysis', 'Verified report archive'],
      variants: ['news verification workflow', 'community survey analysis', 'public feedback tracking', 'civic event reporting'],
      titles: [
        'Community Survey and Public Feedback Analysis Platform',
        'News Verification and Media Content Review System',
        'Civic Event Reporting and Attendance Tracking Application',
        'Social Research Data Collection Dashboard',
        'Public Opinion Polling and Visualization System'
      ]
    },
    {
      domain: 'Transport and Service Delivery',
      departments: ['Software Engineering', 'Information Technology', 'Business Administration'],
      abstract: 'A service delivery platform coordinates customer requests, routing, dispatch, driver activity, delivery status, and satisfaction reporting.',
      problem: 'Service providers need faster digital coordination of orders, delivery staff, and customer communication.',
      methods: ['route management', 'service workflow design', 'customer analytics'],
      technologies: ['React Native', 'Node.js', 'MongoDB', 'Maps API'],
      keywords: ['delivery', 'transport', 'service requests', 'routing'],
      features: ['Request dispatch', 'Delivery tracking', 'Customer feedback'],
      variants: ['food delivery dispatch', 'parcel route tracking', 'customer request queues', 'driver activity reporting'],
      titles: [
        'Food Delivery Dispatch and Driver Tracking System',
        'Parcel Route Management and Delivery Confirmation Platform',
        'Customer Service Request Queue and Assignment System',
        'Transport Booking and Trip Status Tracking Application',
        'Driver Performance and Delivery Feedback Dashboard'
      ]
    },
    {
      domain: 'AI Chatbots and Knowledge Assistants',
      departments: ['Artificial Intelligence', 'Data Science', 'Computer Science'],
      abstract: 'An intelligent assistant answers user questions, retrieves knowledge from documents, classifies intents, recommends resources, and summarizes responses.',
      problem: 'Students and staff need fast access to institutional information and project guidance.',
      methods: ['natural language processing', 'retrieval augmented generation', 'intent classification'],
      technologies: ['Python', 'Sentence Transformers', 'React', 'FAISS'],
      keywords: ['AI chatbot', 'knowledge assistant', 'NLP', 'document retrieval'],
      features: ['Document question answering', 'Intent detection', 'Resource recommendations'],
      variants: ['student helpdesk chatbot', 'document knowledge retrieval', 'academic FAQ assistant', 'project idea recommendation'],
      titles: [
        'AI Student Helpdesk Chatbot for University Services',
        'Document-Based Academic Knowledge Assistant Using NLP',
        'Project Idea Recommendation Chatbot for Final Year Students',
        'FAQ Retrieval Assistant for Academic Policy Documents',
        'Natural Language Query System for University Information'
      ]
    }
  ];

  return clusters.flatMap(cluster => clusterProjects(cluster, byName, departments));
}

async function createReportForProject(project) {
  const analysis = await calculateSimilarity(project);
  const report = await SimilarityReport.create({
    projectId: project._id,
    academicContext: {
      facultyId: project.facultyId,
      departmentId: project.departmentId,
      programId: project.programId,
      categoryId: project.categoryId,
      researchDomainIds: project.researchDomainIds || []
    },
    overallScore: analysis.overallScore,
    displayedScore: analysis.displayedScore,
    rawCosine: analysis.rawCosine,
    riskLevel: analysis.riskLevel,
    similarityLabel: analysis.similarityLabel,
    breakdown: analysis.breakdown,
    matchedProjects: analysis.similarProjects,
    modelVersion: analysis.modelVersion,
    combinedText: analysis.combinedText,
    createdAt: project.createdAt,
    updatedAt: project.createdAt
  });

  project.similarityScore = analysis.displayedScore;
  project.similarityRisk = analysis.riskLevel;
  project.similarityLabel = analysis.similarityLabel;
  project.similarityReportId = report._id;
  project.similarityReport = {
    overallScore: analysis.overallScore,
    displayedScore: analysis.displayedScore,
    rawCosine: analysis.rawCosine,
    riskLevel: analysis.riskLevel,
    similarityLabel: analysis.similarityLabel,
    modelVersion: analysis.modelVersion,
    combinedText: analysis.combinedText,
    breakdown: analysis.breakdown,
    similarProjects: analysis.similarProjects
  };
  project.markModified('similarityReport');
  await project.save({ validateBeforeSave: false });

  return report;
}

function pairKey(projectId, matchedProjectId) {
  return [projectId.toString(), matchedProjectId.toString()].sort().join('__');
}

async function getComparisonRiskCounts() {
  const reports = await SimilarityReport.find().select('projectId matchedProjects.riskLevel matchedProjects.projectId').lean();
  const counts = { Low: 0, Medium: 0, High: 0 };
  const pairs = new Set();

  for (const report of reports) {
    for (const match of report.matchedProjects || []) {
      if (!match.projectId) continue;
      pairs.add(pairKey(report.projectId, match.projectId));
      if (counts[match.riskLevel] !== undefined) counts[match.riskLevel] += 1;
    }
  }

  return { counts, pairs };
}

async function addBalancedComparisonRows() {
  const { counts, pairs } = await getComparisonRiskCounts();
  const needed = {
    Low: Math.max(0, TARGET_LOW_COMPARISONS - counts.Low),
    Medium: Math.max(0, TARGET_MEDIUM_COMPARISONS - counts.Medium)
  };

  if (!needed.Low && !needed.Medium) {
    return { added: { Low: 0, Medium: 0 }, counts };
  }

  const reports = await SimilarityReport.find()
    .populate('projectId')
    .sort({ createdAt: 1 });
  const projects = await Project.find({
    status: { $in: ['submitted', 'under_review', 'approved', 'in_progress', 'completed'] }
  }).sort({ createdAt: 1 });

  const projectById = new Map(projects.map(project => [project._id.toString(), project]));
  const added = { Low: 0, Medium: 0 };

  for (const report of reports) {
    const sourceProject = report.projectId;
    if (!sourceProject?._id) continue;

    for (const candidate of projects) {
      if (sourceProject._id.toString() === candidate._id.toString()) continue;
      const key = pairKey(sourceProject._id, candidate._id);
      if (pairs.has(key)) continue;

      const similarity = await calculateProjectSimilarity(sourceProject, candidate, {
        persistSubmitted: true,
        persistStored: true
      });

      const targetRisk = similarity.riskLevel;
      if (!(targetRisk === 'Low' || targetRisk === 'Medium') || needed[targetRisk] <= 0) {
        continue;
      }

      report.matchedProjects.push({
        projectId: candidate._id,
        title: candidate.title,
        facultyId: candidate.facultyId,
        departmentId: candidate.departmentId,
        categoryId: candidate.categoryId,
        rawCosine: similarity.rawCosine,
        score: similarity.percentage,
        displayedPercentage: similarity.displayedPercentage,
        similarityLabel: similarity.label,
        riskLevel: similarity.riskLevel,
        matchedSections: ['semantic'],
        reason: targetRisk === 'Low'
          ? 'Low semantic similarity comparison for chart analysis'
          : 'Moderate semantic similarity comparison for chart analysis'
      });

      if (similarity.displayedPercentage > report.displayedScore) {
        report.overallScore = similarity.percentage;
        report.displayedScore = similarity.displayedPercentage;
        report.rawCosine = similarity.rawCosine;
        report.riskLevel = similarity.riskLevel;
        report.similarityLabel = similarity.label;
      }

      report.markModified('matchedProjects');
      await report.save();

      pairs.add(key);
      needed[targetRisk] -= 1;
      added[targetRisk] += 1;

      if (added.Low % 10 === 0 && added.Low > 0) console.log(`Added ${added.Low} low-risk comparison rows...`);
      if (added.Medium % 10 === 0 && added.Medium > 0) console.log(`Added ${added.Medium} medium-risk comparison rows...`);

      if (!needed.Low && !needed.Medium) {
        return { added, counts: (await getComparisonRiskCounts()).counts };
      }
    }
  }

  return { added, counts: (await getComparisonRiskCounts()).counts };
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms');

  const [faculties, departments] = await Promise.all([
    Faculty.find().lean(),
    Department.find().populate('facultyId', 'name code').lean()
  ]);

  if (!faculties.length || !departments.length) {
    throw new Error('Cannot seed projects before faculties and departments exist.');
  }

  const existingCount = await Project.countDocuments();
  const existingTitles = new Set((await Project.distinct('title')).map(title => title.toLowerCase()));
  const missingCount = Math.max(0, TARGET_PROJECT_COUNT - existingCount);
  const catalog = buildCatalog(departments)
    .filter(project => !existingTitles.has(project.title.toLowerCase()));

  const toInsert = catalog.slice(0, missingCount);
  const insertedProjects = toInsert.length ? await Project.insertMany(toInsert) : [];

  const existingReportProjectIds = new Set(
    (await SimilarityReport.distinct('projectId')).map(id => id.toString())
  );

  const seedProjectsWithoutReports = await Project.find({
    keywords: SEED_TAG,
    _id: { $nin: Array.from(existingReportProjectIds) }
  }).sort({ createdAt: 1 });

  let reportCount = 0;
  for (const project of seedProjectsWithoutReports) {
    await createReportForProject(project);
    reportCount += 1;
    if (reportCount % 10 === 0) {
      console.log(`Generated ${reportCount} similarity reports...`);
    }
  }

  const balancedComparisons = await addBalancedComparisonRows();

  const finalProjectCount = await Project.countDocuments();
  const finalReportCount = await SimilarityReport.countDocuments();
  const riskSummary = await SimilarityReport.aggregate([
    { $group: { _id: '$riskLevel', count: { $sum: 1 } } },
    { $sort: { _id: 1 } }
  ]);

  console.log(JSON.stringify({
    insertedProjects: insertedProjects.length,
    generatedReports: reportCount,
    balancedComparisons,
    finalProjectCount,
    finalReportCount,
    riskSummary
  }, null, 2));

  await mongoose.disconnect();
}

main().catch(async error => {
  console.error(error);
  await mongoose.disconnect();
  process.exit(1);
});
