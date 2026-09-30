const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');

const DATASET_TAG = 'RESEARCH_EXPERIMENT';
const DATASET_VERSION = 'project_dataset_v2_corrected_descriptions';
const ANNOTATION_VERSION = 'similarity_annotations_v2';
const SUPERVISOR_ANNOTATION_VERSION = 'supervisor_assignment_annotations_v2';
const BACKUP_REFERENCE = 'backend/backups/before-description-correction-20260804';
const apply = process.argv.includes('--apply');
const rollbackFileArg = process.argv.find(value => value.startsWith('--rollback='));

const descriptions = {
  2: 'Estate details and family relationships are entered into a rules-based calculator that determines each eligible heir’s prescribed share under Islamic inheritance principles. The result explains every allocation, flags incompatible heir combinations, and produces a printable distribution summary for families or legal advisers.',
  3: 'An Arduino-controlled mobile cleaner navigates indoor spaces while distance sensors help it avoid obstacles and detect areas that require cleaning. Operators can observe battery state, movement, and cleaning activity through a compact display or connected dashboard, making routine floor care more autonomous.',
  4: 'Using a phone camera, the application recognises supported banknote denominations and communicates the value through speech and vibration. Offline inference and accessibility-focused controls allow visually impaired users to confirm cash independently under varied lighting conditions.',
  5: 'Patients record symptoms, diagnoses, medication routines, measurements, and follow-up dates in a personal health timeline. Clinicians or authorised caregivers can review condition trends and reminders, helping users maintain continuity of care without relying on scattered paper notes.',
  6: 'Travellers browse destinations, tour packages, schedules, accommodation options, and available guides before completing a secure online booking. Tourism staff manage reservations and payments from an operational dashboard while customers receive receipts and itinerary updates.',
  7: 'Merchants publish products with prices, stock levels, photographs, and catalogue categories for customers to explore online. Shoppers build a cart, confirm delivery information, place orders, and follow fulfilment, while administrators monitor inventory and sales activity.',
  8: 'Wax Is Bar offers Somali learners a structured space for practising lessons, completing exercises, and following their progress across learning topics. Teachers organise materials and review learner activity, while simple navigation keeps educational content accessible to students at different levels.',
  9: 'Restaurant menus, item customisation, delivery addresses, and order status are brought together in a mobile ordering workflow. Customers pay electronically and receive progress notifications as kitchen staff accept, prepare, and dispatch each meal.',
  10: 'Traffic officers register vehicles, drivers, violations, penalties, incidents, and supporting evidence in a searchable record system. The service preserves case histories and produces enforcement reports so authorised staff can follow unresolved offences and recurring patterns.',
  11: 'Hormuud University Game Zone hosts recreational and educational games under student profiles with levels, achievements, and leaderboards. Session statistics and progression rewards encourage repeat play while administrators can organise available games and competitions.',
  12: 'QuizMe lets instructors assemble question banks, timed quizzes, answer keys, and scoring rules for web-based assessment. Learners receive immediate results and topic feedback, and educators analyse attempts to identify difficult questions or knowledge gaps.',
  13: 'Property owners advertise rental units, review tenant applications, issue agreements, and track rent payments through a secure housing portal. Biometric verification confirms identity before sensitive actions such as contract acceptance or payment acknowledgement, reducing impersonation disputes.',
  14: 'Voters are enrolled against an authorised register and verified biometrically before a ballot can be submitted. The election workflow prevents repeat voting, protects ballot secrecy, records auditable events, and publishes aggregated results for election officials.',
  15: 'Fishers and vendors use a mobile application to record catches, species, quantities, storage conditions, buyers, and daily sales. Stock movement and freshness information help market participants reduce spoilage and understand supply from landing point to customer.',
  16: 'Players progress through an original set of interactive levels governed by defined controls, objectives, scoring, hazards, and reward mechanics. The implementation combines visual assets, sound, saved progress, and performance testing to deliver a coherent playable game rather than a generic management portal.',
  17: 'Students submit course evaluations only after biometric identity verification confirms their eligibility and prevents duplicate responses. Aggregated, anonymous feedback gives academic managers reliable teaching indicators while protecting individual respondents.',
  18: 'Passengers search routes or events, compare schedules and available seats, reserve tickets, and receive a digital booking reference. Operators configure capacity, fares, departures, cancellations, and check-in records from a central reservation console.',
  19: 'Camera feeds are analysed to locate selected objects, maintain their identity across frames, and report movement within a monitored area. The interface highlights detections, logs notable events, and can alert an operator when an object enters a restricted zone or disappears.',
  20: 'Pharmacy staff maintain medicine batches, expiry dates, suppliers, prescriptions, purchases, and dispensing transactions. Stock warnings and sales reports support safe inventory control while a searchable patient or prescription history improves accountability.',
  21: 'Android users view clinic services and practitioner availability, then request, reschedule, or cancel a consultation from their phones. Clinic personnel manage daily queues and reminders, reducing missed visits and time spent arranging appointments manually.',
  22: 'A structured enterprise topology segments departments through planned IPv4 addressing, routing, switching, VLANs, and access controls while carrying voice traffic over IP. Simulation and testing measure connectivity, call quality, resilience, and efficient address allocation before deployment.',
  23: 'Voltage and current sensors feed an IoT meter that calculates energy consumption and estimated cost in near real time. Household or facility users inspect usage trends remotely, receive threshold alerts, and identify unusually expensive equipment or periods.',
  24: 'Retail staff complete mobile sales, update stock, calculate totals, and issue electronic receipts at the point of transaction. An SMS confirmation informs the customer of each completed purchase, while managers can review cashier activity and daily revenue.',
  25: 'Live video is processed to detect people, count entries and exits, and estimate occupancy for a defined location. Time-stamped totals and capacity alerts assist security or facility teams without requiring continuous manual observation.',
  26: 'Sensors detect unauthorised movement or tampering and immediately activate an alarm while a location module reports the protected asset’s position. Owners receive remote notifications and can review tracking events to support rapid recovery.',
  27: 'Somali-language animated stories introduce children to Islamic manners, short lessons, and age-appropriate moral themes. Parents can choose episodes and follow viewing progress, while narration and colourful interaction support young learners who read at different levels.',
  28: 'Soil-moisture and environmental readings guide an Arduino irrigation controller that supplies water only when plants need it. Gardeners see current conditions and pump activity, adjust thresholds, and reduce water waste caused by fixed manual schedules.',
  29: 'Users import photographs, crop or resize them, adjust colour and exposure, apply filters, add text, and export the edited result. An undoable editing workflow and preview controls make common image corrections available without specialist desktop software.',
  30: 'Sellers list items with photographs, reserve prices, and closing times, while registered bidders submit competing offers before each deadline. The platform validates bids, identifies the winning offer, records auction history, and notifies the relevant participants.',
  31: 'Open Door Reminder detects or records a user’s departure routine and presents selected Adkaar at the appropriate moment. Configurable reminders, Arabic text, Somali guidance, and acknowledgement history support consistent daily remembrance without overwhelming notifications.',
  32: 'Customers order cooking-gas cylinders by size, provide a delivery location, choose payment terms, and monitor dispatch status. Gas suppliers coordinate stock, refill availability, drivers, orders, and delivery confirmation from one sales workspace.',
  33: 'Citizens lodge public-service complaints with a category, location, description, and supporting evidence, then follow the case through resolution. Government departments route submissions to responsible officers, communicate updates, measure response times, and identify recurring service problems.',
  34: 'Ha Ilaawin Afka Hooyo strengthens Somali language practice through vocabulary, reading passages, pronunciation material, and short activities. Progress records help learners revisit difficult content and give educators a practical way to organise mother-tongue resources.',
  35: 'Somali educators publish lessons, assignments, discussions, and assessments for learners who access classes remotely. Course progress, feedback, and downloadable materials support continuity of education where classroom time or learning resources are limited.',
  36: 'Applicants complete passport forms, upload evidence, book processing appointments, pay required fees, and track each stage online. Public-service officers verify documents, request corrections, approve applications, and maintain an auditable issuance history.',
  37: 'Educational content is anchored to real-world surfaces so students can examine interactive three-dimensional objects through a mobile camera. Teachers select learning scenes and activities, while learners manipulate visual models that clarify concepts difficult to demonstrate with static diagrams.',
  38: 'Donors register blood groups, eligibility details, locations, and availability, enabling hospitals to search for suitable donors during routine or urgent demand. Donation history, requests, appointments, and notifications improve coordination without exposing unnecessary personal information.',
  39: 'Departments raise purchase requests that pass through approval, quotation, supplier selection, ordering, receipt, and payment stages. Procurement officers gain traceable stock and vendor records, helping the organisation control expenditure and identify delayed supplies.',
  40: 'Network models compare how edge devices, gateways, and cloud services exchange data under different communication protocols. Simulated latency, bandwidth, reliability, and resource consumption reveal which protocol arrangements suit time-sensitive and large-scale workloads.',
  41: 'A case study measures how residents of Mogadishu access, understand, and safely use digital devices, internet services, and online information. Survey analysis identifies demographic and educational gaps that can guide targeted digital-literacy programmes in Somalia.',
  42: 'The study examines relationships between students’ use of digital learning tools and their academic outcomes in Mogadishu high schools. Questionnaire and performance data are analysed to distinguish helpful educational practices from distraction, unequal access, or ineffective technology use.',
  43: 'Technology-dependent businesses in Mogadishu are surveyed to assess employee recognition of phishing, malware, password threats, and incident-reporting procedures. The findings expose awareness gaps and support practical cybersecurity training priorities for local organisations.',
  44: 'Student use of social networking services in Somalia is investigated across communication, learning, collaboration, entertainment, and privacy behaviour. Collected responses are analysed to explain both academic opportunities and risks associated with frequent platform use.',
  45: 'E-commerce transactions are transformed into behavioural features and evaluated by bagging-based classifiers for signs of fraud. Suspicious purchases receive a risk indication for review, and the experiment reports model performance against legitimate and fraudulent transaction data.',
  46: 'The research documents security, trust, and privacy challenges affecting wireless-network users and operators in Somalia. Evidence from organisations and users is analysed to identify weak practices, perceived threats, and safeguards appropriate to the local connectivity environment.',
  47: 'Alternative network configurations and traffic-management policies are modelled to improve both measurable Quality of Service and users’ perceived Quality of Experience. Experiments examine delay, jitter, packet loss, throughput, scalability, and application responsiveness under changing demand.',
  48: 'Retail operations are linked through product purchasing, batch stock, pricing, sales, expenses, receivables, and cash reporting. Managers can reconcile inventory with financial activity and receive warnings when stock or margins require attention.',
  49: 'A dispatch workspace connects passengers, drivers, vehicles, trips, fares, and service locations for a taxi operator. Booking status and trip histories help coordinators allocate available cars, monitor completed journeys, and resolve customer enquiries.',
  50: 'Members create profiles, publish posts, share media, react, comment, follow connections, and exchange notifications within a moderated online community. Privacy controls and content reporting give users and administrators tools to manage visibility and harmful activity.',
  51: 'Property agents register houses, apartments, plots, owners, prices, locations, viewing requests, and sale or lease status. Prospective clients search listings and contact agents, while managers track agreements and the history of each property.',
  52: 'Hage is a mobile guidance service that helps users discover useful destinations, services, or routes through searchable categories and location-aware information. Saved places and concise directions support people navigating unfamiliar areas without depending on informal instructions.',
  53: 'Gym personnel manage memberships, subscription periods, trainer schedules, workout plans, attendance, and fee payments. Members can follow assigned routines and renewal dates, while managers use participation and revenue summaries to run the facility.',
  54: 'Hospital teams access mobile patient registration, clinical encounters, ward activity, prescriptions, laboratory requests, and billing information according to their roles. Timely updates across departments reduce duplicated records and improve coordination throughout a patient visit.',
  55: 'Learners record daily study sessions, topics, goals, completed tasks, and reflections in a personal progress log. Streaks and weekly summaries reveal learning habits, helping students and mentors adjust plans when effort or coverage falls behind.',
  56: 'Economic data and stakeholder evidence are used to examine how digital payments, online services, connectivity, and technology businesses affect Mogadishu’s economy. The study considers productivity, employment, market access, inclusion, and barriers that limit wider benefits.',
  57: 'Large IoT data streams are divided between nearby edge resources and cloud infrastructure for distributed processing and analysis. The prototype evaluates latency, bandwidth, scalability, and workload placement to determine when local computation improves responsiveness.',
  58: 'Macruuf Supermarket records suppliers, purchases, product batches, shelf stock, barcode sales, expenses, and cashier shifts. Reorder and expiry alerts support daily control, while consolidated reports show revenue and inventory movement to management.',
  59: 'Businesses in Mogadishu and local ICT providers contribute evidence about the services, skills, infrastructure, and support involved in organisational digital transformation. Analysis identifies the contribution of technology companies as well as adoption barriers faced by their clients.',
  60: 'Somalia’s national secondary examination records are prepared for reproducible statistical and visual analysis rather than isolated spreadsheet work. The approach explores regional, subject, and year-level patterns while protecting student data and documenting data-quality limitations.',
  61: 'Clinic staff create a verified digital medical card that links a patient’s identity with essential health and visit information. Cards can be retrieved or printed with a unique code, reducing duplicate registration and accelerating record access during future care.',
  62: 'Dental practices schedule patients, document examinations and tooth-specific findings, plan treatments, issue prescriptions, and record payments. Clinicians can review longitudinal oral-health history while reception staff coordinate appointments and outstanding balances.',
  63: 'A unique time-limited QR code represents each authorised class or work session and is scanned to record attendance. Validation rules deter copied or late submissions, and supervisors receive searchable attendance histories and absence summaries.',
  64: 'Schools maintain enrolment, classes, subjects, attendance, marks, fees, and parent contacts within a shared administrative system. Automatic SMS messages communicate absences, results, payment reminders, and important notices to guardians who may not use the web portal.',
  65: 'Video and interaction signals are analysed during an examination to flag behaviours that may require invigilator review, such as additional people, prolonged absence, or unusual movement. The tool records evidence and alerts while leaving final academic decisions to authorised staff.',
  66: 'Construction teams record daily labour, materials, equipment, subcontractor charges, and completed work against an approved budget. Site managers compare planned and actual expenditure, document variances, and forecast remaining cost before overruns become difficult to control.',
  67: 'Historical crime records are cleaned and modelled to estimate patterns by location, time, and offence category. Analysts explore forecasts and hotspot summaries with confidence information, supporting resource planning while avoiding claims that predictions determine individual guilt.',
  68: 'Restaurants, shops, and households advertise safe surplus food with quantity, collection time, and location for approved charities or recipients. Coordinators reserve donations, arrange pickup, confirm delivery, and monitor how much edible food is redirected from waste.',
  69: 'Somali youth build skills profiles and upload experience information that is compared with vacancy requirements using machine-learning and semantic matching. Ranked opportunities explain relevant skills and missing qualifications, while employers review suitable applicants without replacing human selection.',
  70: 'Museum personnel catalogue artefacts, provenance, condition, storage location, exhibitions, loans, and conservation activity. Visitors can explore selected collections digitally, while staff preserve an auditable institutional record of culturally important objects.',
  71: 'Academic offices coordinate programmes, courses, student registration, examination timetables, question administration, marks, moderation, and published results. Role-specific workflows reduce conflicts and provide traceability from enrolment through final grade reporting.',
  72: 'Land parcels, ownership evidence, transfers, and verification events are recorded through a tamper-resistant blockchain-backed registry. Citizens and officials can inspect authorised history and validate references, reducing opportunities for duplicate deeds or concealed alteration.',
  73: 'Patients search hospital departments and available clinicians, reserve a suitable time, receive reminders, and manage changes to upcoming visits. Scheduling staff control calendars and queues so double-booking and long manual coordination are reduced.',
  74: 'News text is cleaned and transformed into linguistic features for machine-learning models trained to distinguish unreliable content from verified reporting. Users receive a prediction with confidence and relevant indicators, while evaluation screens disclose errors and dataset limitations.',
  75: 'Green Life coordinates waste-generation reports, collection requests, pickup routes, material categories, disposal points, and recycling outcomes through a web portal. Residents and staff can follow service status, while managers analyse missed collections and area-level waste volumes.',
  76: 'Farmers publish available produce, harvest quantities, prices, and collection locations directly to buyers in Somalia. Orders, negotiation, payment records, and delivery coordination shorten the route to market and give producers clearer visibility into demand.',
  77: 'Patients enter symptoms and basic context into a machine-learning interface that suggests likely condition categories and an appropriate level of follow-up. The result includes uncertainty and safety guidance, supporting—not replacing—assessment by a qualified health professional.',
  78: 'Insurance staff register customers, policies, premiums, insured assets, claims, evidence, and settlement stages in a traceable workflow. Customers follow application or claim progress, while managers monitor deadlines, outstanding documents, and portfolio activity.',
  79: 'A payment hub connects customers and merchants to supported electronic payment channels through a consistent transaction workflow. It records authorisation, settlement status, receipts, refunds, and reconciliation events while exposing operational monitoring to authorised finance staff.'
};

const words = text => String(text || '').toLowerCase().match(/[a-z0-9]+/g) || [];
const opening = text => String(text || '').split(/[.!?]/)[0].trim().toLowerCase();
const hash = value => crypto.createHash('sha256').update(String(value || '')).digest('hex');
const jaccard = (left, right) => {
  const a = new Set(words(left)); const b = new Set(words(right));
  const intersection = [...a].filter(token => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
};
const repeatedPhrases = rows => {
  const counts = new Map();
  rows.forEach(row => {
    const tokens = words(row.abstract);
    const unique = new Set();
    for (let size = 3; size <= 5; size += 1) {
      for (let index = 0; index <= tokens.length - size; index += 1) unique.add(tokens.slice(index, index + size).join(' '));
    }
    unique.forEach(phrase => counts.set(phrase, (counts.get(phrase) || 0) + 1));
  });
  return [...counts.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, 20).map(([phrase, count]) => ({ phrase, count }));
};
const analyse = rows => {
  const exactGroups = new Map(); const openingGroups = new Map(); const near = [];
  rows.forEach(row => {
    const normalized = words(row.abstract).join(' ');
    exactGroups.set(normalized, [...(exactGroups.get(normalized) || []), row.sourceRow]);
    openingGroups.set(opening(row.abstract), [...(openingGroups.get(opening(row.abstract)) || []), row.sourceRow]);
  });
  for (let i = 0; i < rows.length; i += 1) for (let j = i + 1; j < rows.length; j += 1) {
    const similarity = jaccard(rows[i].abstract, rows[j].abstract);
    if (similarity >= 0.65) near.push({ first: rows[i].sourceRow, second: rows[j].sourceRow, similarity: Number(similarity.toFixed(4)) });
  }
  const averageWords = rows.reduce((sum, row) => sum + words(row.abstract).length, 0) / Math.max(rows.length, 1);
  return {
    projectCount: rows.length,
    exactDuplicateGroups: [...exactGroups.values()].filter(group => group.length > 1),
    exactDuplicateDescriptions: [...exactGroups.values()].filter(group => group.length > 1).reduce((sum, group) => sum + group.length, 0),
    nearDuplicatePairs: near,
    repeatedOpenings: [...openingGroups.entries()].filter(([, group]) => group.length > 1).map(([text, sourceRows]) => ({ text, sourceRows })),
    averageDescriptionWords: Number(averageWords.toFixed(2)),
    frequentPhrases: repeatedPhrases(rows)
  };
};

async function collectAffected(db, projectIds, runIds) {
  const filters = {
    humanevaluations: { $or: [{ firstProjectId: { $in: projectIds } }, { secondProjectId: { $in: projectIds } }] },
    annotationconsensus: { $or: [{ firstProjectId: { $in: projectIds } }, { secondProjectId: { $in: projectIds } }] },
    supervisorgroundtruths: { projectId: { $in: projectIds } },
    projectpairscores: { experimentRunId: { $in: runIds } },
    supervisormatchscores: { experimentRunId: { $in: runIds } },
    supervisorassignments: { projectId: { $in: projectIds } },
    projectmodelcomparisons: { $or: [{ firstProjectId: { $in: projectIds } }, { secondProjectId: { $in: projectIds } }] },
    similarityreports: { projectId: { $in: projectIds } },
    researchexperimentruns: { _id: { $in: runIds } }
  };
  const documents = {}; const counts = {};
  for (const [collection, filter] of Object.entries(filters)) {
    documents[collection] = await db.collection(collection).find(filter).toArray();
    counts[collection] = documents[collection].length;
  }
  return { filters, documents, counts };
}

async function rollback(db, auditPath) {
  const audit = JSON.parse(fs.readFileSync(auditPath, 'utf8'));
  for (const row of audit.projects) {
    const previousProject = mongoose.mongo.BSON.EJSON.deserialize(row.previousProject);
    await db.collection('projects').replaceOne({ _id: previousProject._id }, previousProject, { upsert: true });
  }
  for (const [collection, rows] of Object.entries(audit.removedDocuments)) {
    if (!rows.length) continue;
    const restored = rows.map(row => mongoose.mongo.BSON.EJSON.deserialize(row));
    await db.collection(collection).deleteMany({ _id: { $in: restored.map(row => row._id) } });
    await db.collection(collection).insertMany(restored, { ordered: false });
  }
  console.log(JSON.stringify({ status: 'rolled_back', auditPath }));
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/hormuud-gpms');
  const db = mongoose.connection.db;
  if (rollbackFileArg) {
    await rollback(db, path.resolve(rollbackFileArg.slice('--rollback='.length)));
    await mongoose.disconnect(); return;
  }
  const projects = await db.collection('projects').find({ testDataTag: DATASET_TAG }).sort({ sourceRow: 1 }).toArray();
  if (projects.length !== 78) throw new Error(`Expected 78 ${DATASET_TAG} projects, found ${projects.length}`);
  const missing = projects.filter(project => !descriptions[project.sourceRow]);
  if (missing.length || Object.keys(descriptions).length !== projects.length) throw new Error(`Description map mismatch; missing source rows: ${missing.map(row => row.sourceRow).join(', ')}`);
  const corrected = projects.map(project => ({ ...project, abstract: descriptions[project.sourceRow] }));
  const before = analyse(projects); const after = analyse(corrected);
  if (after.exactDuplicateDescriptions || after.nearDuplicatePairs.length || after.repeatedOpenings.length) {
    throw new Error(`Corrected description validation failed: ${JSON.stringify({ exact: after.exactDuplicateDescriptions, near: after.nearDuplicatePairs.length, openings: after.repeatedOpenings.length })}`);
  }
  const projectIds = projects.map(project => project._id);
  const runIds = await db.collection('researchexperimentruns').distinct('_id', { datasetTag: DATASET_TAG });
  const affected = await collectAffected(db, projectIds, runIds);
  const summary = {
    status: apply ? 'ready_to_apply' : 'dry_run', datasetVersion: DATASET_VERSION,
    descriptionsChanged: corrected.filter((row, index) => row.abstract !== projects[index].abstract).length,
    descriptionsUnchanged: corrected.filter((row, index) => row.abstract === projects[index].abstract).length,
    before, after, recordsToRemove: affected.counts, backupReference: BACKUP_REFERENCE
  };
  if (!apply) { console.log(JSON.stringify(summary, null, 2)); await mongoose.disconnect(); return; }

  const timestamp = new Date();
  const auditDir = path.resolve(__dirname, '../../outputs/dataset-correction-v2');
  fs.mkdirSync(auditDir, { recursive: true });
  const auditPath = path.join(auditDir, `correction-audit-${timestamp.toISOString().replace(/[:.]/g, '-')}.json`);
  const audit = {
    ...summary, status: 'transaction_pending', startedAt: timestamp.toISOString(),
    annotationVersions: { similarity: ANNOTATION_VERSION, supervisor: SUPERVISOR_ANNOTATION_VERSION },
    projects: projects.map(project => ({
      projectId: String(project._id), sourceRow: project.sourceRow, title: project.title,
      previousDescription: project.abstract, newDescription: descriptions[project.sourceRow],
      previousHash: hash(project.abstract), newHash: hash(descriptions[project.sourceRow]),
      previousProject: mongoose.mongo.BSON.EJSON.serialize(project),
      updatedField: 'abstract', reason: 'Replace repetitive or generic description before model re-evaluation'
    })),
    removedDocuments: Object.fromEntries(Object.entries(affected.documents).map(([collection, rows]) => [collection, rows.map(row => mongoose.mongo.BSON.EJSON.serialize(row))]))
  };
  fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');

  const hello = await db.admin().command({ hello: 1 });
  const transactionsSupported = Boolean(hello.setName || hello.msg === 'isdbgrid');
  const performCorrection = async session => {
    const options = session ? { session } : {};
    for (const project of projects) {
      await db.collection('projects').updateOne({ _id: project._id }, {
        $set: {
          abstract: descriptions[project.sourceRow], datasetVersion: DATASET_VERSION,
          descriptionVersion: DATASET_VERSION, lastUpdated: timestamp
        },
        $unset: {
          semanticEmbedding: '', similarityScore: '', similarityRisk: '', similarityLabel: '',
          similarityReport: '', similarityReportId: ''
        }
      }, options);
    }
    for (const [collection, filter] of Object.entries(affected.filters)) await db.collection(collection).deleteMany(filter, options);
    await db.collection('datasetcorrectionaudits').insertOne({
      datasetVersion: DATASET_VERSION, status: 'completed', backupReference: BACKUP_REFERENCE,
      projectCount: projects.length, descriptionsChanged: summary.descriptionsChanged,
      validationBefore: before, validationAfter: after, removedCounts: affected.counts,
      auditFile: auditPath, safetyMode: transactionsSupported ? 'mongodb_transaction' : 'verified_snapshot_with_compensating_rollback',
      reason: 'Incorrect descriptions invalidated annotations and dependent model results', completedAt: timestamp
    }, options);
  };
  const session = transactionsSupported ? await mongoose.startSession() : null;
  try {
    if (session) await session.withTransaction(() => performCorrection(session));
    else await performCorrection(null);
    audit.status = 'completed'; audit.completedAt = new Date().toISOString(); audit.transactionCompleted = true;
    audit.safetyMode = transactionsSupported ? 'mongodb_transaction' : 'verified_snapshot_with_compensating_rollback';
    fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');
    console.log(JSON.stringify({ ...summary, status: 'completed', auditPath }, null, 2));
  } catch (error) {
    if (!transactionsSupported) await rollback(db, auditPath).catch(rollbackError => { error.message += `; automatic rollback failed: ${rollbackError.message}`; });
    audit.status = 'failed'; audit.transactionCompleted = false; audit.error = error.message;
    fs.writeFileSync(auditPath, JSON.stringify(audit, null, 2), 'utf8');
    throw error;
  } finally { if (session) await session.endSession(); await mongoose.disconnect(); }
}

run().catch(async error => {
  console.error(error); await mongoose.disconnect().catch(() => {}); process.exit(1);
});
