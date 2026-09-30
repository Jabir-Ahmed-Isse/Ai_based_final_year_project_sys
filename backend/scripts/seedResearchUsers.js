const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const User = require('../src/models/User');

const TEST_TAG = 'RESEARCH_EXPERIMENT';
const TEST_PASSWORD = '12345678';

const supervisors = [
  ['SUP001', 'Dr. Sahra Abdi Nur', 'Artificial Intelligence and Natural Language Processing', 'machine learning, NLP, semantic similarity, recommender systems', 'model training, text preprocessing, embeddings, classification, evaluation', 'Python, PyTorch, TensorFlow, scikit-learn, Sentence-BERT, BGE-M3, Hugging Face', 'fake news detection, job matching, project similarity checking', 'semantic search, transformers, NLP, deep learning', 10, 5],
  ['SUP002', 'Dr. Mohamed Ali Warsame', 'Computer Vision', 'image processing, object detection, video analytics, biometric systems', 'face recognition, object tracking, image classification', 'Python, OpenCV, YOLO, TensorFlow, PyTorch', 'human counting, biometric voting, exam monitoring', 'computer vision, object detection, surveillance', 9, 5],
  ['SUP003', 'Dr. Hodan Yusuf Aden', 'Data Science and Business Analytics', 'predictive analytics, statistical analysis, data visualization', 'data cleaning, feature engineering, forecasting, reporting', 'Python, Pandas, NumPy, R, SPSS, Power BI', 'crime prediction, national examination analysis, economic digitalization', 'predictive analytics, data mining, statistics', 8, 5],
  ['SUP004', 'Dr. Abdirahman Omar Ismail', 'Cybersecurity', 'network security, application security, privacy, digital forensics', 'vulnerability assessment, penetration testing, risk analysis', 'Kali Linux, Wireshark, Nmap, Metasploit, Python', 'wireless network security, cyberattack awareness, fraud detection', 'cybersecurity, privacy, intrusion detection', 11, 4],
  ['SUP005', 'Dr. Fadumo Hassan Mire', 'Computer Networks and Telecommunications', 'routing, switching, VoIP, QoS, QoE', 'network design, simulation, traffic analysis', 'Cisco Packet Tracer, GNS3, Wireshark, TCP/IP, SIP', 'enterprise VoIP network, scalable network QoS', 'computer networks, QoS, VoIP', 12, 5],
  ['SUP006', 'Dr. Ahmed Ibrahim Jama', 'Internet of Things and Embedded Systems', 'Arduino, sensors, smart devices, embedded programming', 'circuit design, sensor integration, real-time monitoring', 'Arduino, ESP32, C/C++, MQTT, Firebase, Blynk', 'smart irrigation, energy monitoring, anti-theft alarm', 'IoT, embedded systems, smart sensors', 9, 5],
  ['SUP007', 'Dr. Amina Abdullahi Farah', 'Software Engineering', 'software architecture, requirements engineering, software testing', 'system design, UML, API design, testing, project management', 'React, Node.js, Express.js, Java, Git, Docker', 'academic management, hospital management, project lifecycle systems', 'software architecture, software quality, requirements engineering', 13, 6],
  ['SUP008', 'Dr. Bashir Mohamed Said', 'Web Application Development', 'full-stack web development, REST APIs, web security', 'frontend development, backend development, authentication', 'React, JavaScript, TypeScript, Node.js, Laravel, Django', 'e-commerce, tourism management, auction systems', 'web engineering, web applications, REST APIs', 8, 6],
  ['SUP009', 'Dr. Nasteho Ali Osman', 'Mobile Application Development', 'Android, cross-platform mobile applications, mobile UX', 'mobile API integration, notifications, offline storage', 'Flutter, Dart, Kotlin, Android Studio, Firebase', 'clinic appointment, food ordering, fish management', 'mobile computing, Android, cross-platform applications', 7, 5],
  ['SUP010', 'Dr. Hassan Sheikh Aden', 'Database and Information Systems', 'database design, information systems, transaction management', 'SQL, normalization, ERD design, query optimization', 'PostgreSQL, MySQL, MongoDB, Oracle, Supabase', 'pharmacy management, school management, retail management', 'database systems, information management', 12, 6],
  ['SUP011', 'Dr. Maryan Abdiqadir Noor', 'Human-Computer Interaction and Accessibility', 'accessibility, usability, user experience, assistive technology', 'usability testing, accessible interface design, user research', 'Figma, Flutter, React, accessibility APIs', 'currency detector for visually impaired users, health applications', 'HCI, accessibility, usability', 7, 4],
  ['SUP012', 'Dr. Mustafa Ahmed Roble', 'Financial Technology and E-Commerce', 'online payments, POS systems, transaction security', 'payment integration, transaction processing, financial reporting', 'Node.js, React, payment APIs, PostgreSQL, mobile money APIs', 'payment hub, mobile POS, online sales systems', 'FinTech, e-commerce, digital payments', 9, 5],
  ['SUP013', 'Dr. Ifrah Mohamed Duale', 'Blockchain and Distributed Systems', 'blockchain, smart contracts, distributed ledgers', 'smart contract development, decentralized application design', 'Solidity, Ethereum, Hyperledger, Web3.js, IPFS', 'blockchain land registration', 'blockchain, smart contracts, distributed systems', 8, 4],
  ['SUP014', 'Dr. Zakariye Hassan Ali', 'Health Informatics', 'hospital systems, medical records, clinical decision support', 'healthcare workflow analysis, patient-data management', 'React, Flutter, Node.js, PostgreSQL, Python', 'medical cards, hospital appointments, symptom checking', 'health informatics, clinical systems, digital health', 10, 5],
  ['SUP015', 'Dr. Roda Abdullahi Muse', 'Educational Technology', 'e-learning, assessment systems, learning analytics', 'instructional systems, online examinations, student progress tracking', 'Moodle concepts, React, Node.js, Python, Power BI', 'e-learning, QuizMe, academic and exam management', 'educational technology, learning analytics', 11, 5],
  ['SUP016', 'Dr. Liban Omar Hashi', 'Game Development and Extended Reality', 'game programming, augmented reality, virtual reality', '3D modelling, game mechanics, animation', 'Unity, C#, Blender, ARCore, Vuforia', 'university game zone, educational AR applications', 'game development, augmented reality, interactive media', 7, 4],
  ['SUP017', 'Dr. Deeqa Yusuf Mohamed', 'E-Government and Digital Transformation', 'public service systems, digital identity, digital transformation', 'public-sector workflow design, service automation', 'React, Node.js, PostgreSQL, cloud platforms', 'e-passport, complaint management, land systems', 'e-government, digital public services', 12, 5],
  ['SUP018', 'Dr. Mahad Abdi Sheikh', 'Enterprise Systems and Supply Chain', 'procurement, inventory, logistics, enterprise management', 'workflow modelling, inventory control, business reporting', 'ERP concepts, React, Node.js, PostgreSQL, Power BI', 'procurement, supermarket management, retail inventory', 'enterprise systems, supply chain, inventory', 10, 5],
  ['SUP019', 'Dr. Hibo Ahmed Nur', 'Cloud Computing and DevOps', 'cloud architecture, deployment, distributed applications', 'containerization, CI/CD, monitoring, cloud deployment', 'Docker, Kubernetes, GitHub Actions, AWS, Azure, Linux', 'edge-cloud analytics, scalable web platforms', 'cloud computing, DevOps, distributed computing', 8, 5],
  ['SUP020', 'Dr. Abdisalam Mohamed Farah', 'Research Methods and Social Computing', 'quantitative research, qualitative research, social media studies', 'questionnaire design, statistical testing, research reporting', 'SPSS, R, Python, Excel, KoboToolbox', 'digital literacy, social networking use, technology adoption', 'research methodology, social computing, digital literacy', 14, 6]
];

const split = value => value.split(',').map(item => item.trim()).filter(Boolean);

async function seedResearchUsers({ faculty, programs, projectCount, session, outputDirectory }) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Research test accounts cannot be seeded in production');
  }
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 12);
  const programPool = programs.slice(0, 5);
  if (!faculty || programPool.length < 5) throw new Error('CSIT faculty and five programs are required');

  await User.deleteMany({ testDataTag: TEST_TAG }).session(session || null);
  const administrator = {
    name: 'Research Administrator', email: 'admin.research@hu-test.local', password: passwordHash,
    role: 'admin', facultyId: faculty._id, isTestAccount: true, testDataTag: TEST_TAG, accountStatus: 'active'
  };
  const coordinator = {
    name: 'Research Project Coordinator', email: 'coordinator.research@hu-test.local', password: passwordHash,
    role: 'coordinator', facultyId: faculty._id, isTestAccount: true, testDataTag: TEST_TAG, accountStatus: 'active'
  };
  const students = Array.from({ length: projectCount }, (_, index) => {
    const number = String(index + 1).padStart(3, '0');
    const program = programPool[index % programPool.length];
    return {
      name: `Research Student ${number}`,
      email: `student${number}@hu-test.local`,
      password: passwordHash,
      role: 'student',
      facultyId: faculty._id,
      departmentId: program.departmentId,
      programId: program._id,
      department: program.departmentName,
      studentId: `HU-TEST-${number}`,
      studentProfile: { cohortYear: 2026, specialization: program.name },
      isTestAccount: true,
      testDataTag: TEST_TAG,
      accountStatus: 'active'
    };
  });
  const supervisorUsers = supervisors.map((row, index) => {
    const [identifier, name, specialization, expertise, skills, technologies, previous, keywords, years, capacity] = row;
    const program = programPool[index % programPool.length];
    return {
      researchSupervisorId: identifier,
      name,
      email: `supervisor${String(index + 1).padStart(3, '0')}@hu-test.local`,
      password: passwordHash,
      role: 'supervisor',
      facultyId: faculty._id,
      departmentId: program.departmentId,
      department: program.departmentName,
      researchInterests: split(keywords),
      areasOfExpertise: split(expertise),
      expertise: split(expertise),
      academicSpecialization: specialization,
      skills: split(skills),
      supervisorTechnologies: split(technologies),
      previousSupervisedProjectTopics: split(previous),
      publicationKeywords: split(keywords),
      yearsOfExperience: years,
      maxProjects: capacity,
      currentProjects: 0,
      availableForAssignment: true,
      isTestAccount: true,
      testDataTag: TEST_TAG,
      accountStatus: 'active'
    };
  });

  const created = await User.insertMany(
    [administrator, coordinator, ...students, ...supervisorUsers],
    { session: session || undefined, ordered: true }
  );
  const studentDocs = created.filter(user => user.role === 'student');
  const supervisorDocs = created.filter(user => user.role === 'supervisor');
  const credentials = created.map(user => ({
    email: user.email,
    role: user.role,
    temporary_password: TEST_PASSWORD,
    test_data: true
  }));
  fs.mkdirSync(outputDirectory, { recursive: true });
  const headers = ['email', 'role', 'temporary_password', 'test_data'];
  const csv = [headers, ...credentials.map(row => headers.map(key => row[key]))]
    .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  fs.writeFileSync(path.join(outputDirectory, 'test-credentials.csv'), csv, 'utf8');
  return { created, studentDocs, supervisorDocs };
}

module.exports = { seedResearchUsers, TEST_TAG, TEST_PASSWORD, supervisors };
