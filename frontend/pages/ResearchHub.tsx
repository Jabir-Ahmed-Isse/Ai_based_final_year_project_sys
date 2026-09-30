import React, { useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, Database, Download, FlaskConical, RefreshCw, Search } from 'lucide-react';
import { researchAPI } from '../services/apiService';
import ResearchVisualizations from '../components/ResearchVisualizations';

export type ResearchView =
  | 'dataset'
  | 'imports'
  | 'users'
  | 'profiles'
  | 'similarity-experiments'
  | 'pairs'
  | 'supervisor-experiments'
  | 'recommendations'
  | 'comparison'
  | 'visualizations'
  | 'annotations'
  | 'reports'
  | 'logs';

const pageTitles: Record<ResearchView, string> = {
  dataset: 'Research Dataset',
  imports: 'Data Import Results',
  users: 'Test Users',
  profiles: 'Supervisor Profiles',
  'similarity-experiments': 'Similarity Experiments',
  pairs: 'Similarity Pair Results',
  'supervisor-experiments': 'Supervisor Matching Experiments',
  recommendations: 'Supervisor Recommendations',
  comparison: 'Model Comparison',
  visualizations: 'Research Visualizations',
  annotations: 'Similarity Model Evaluation',
  reports: 'Generated Reports',
  logs: 'Activity Logs'
};

const modelNames: Record<string, string> = {
  tfidf: 'TF-IDF',
  sentence_bert: 'Sentence-BERT',
  bge_m3: 'BGE-M3'
};
const similarityModelOrder = ['tfidf', 'sentence_bert', 'bge_m3'];
const similarityDatasetForModel = (model: string) => `similarity_annotations_v3:${model}`;

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) =>
  <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>{children}</section>;

const Stat = ({ label, value, note }: { label: string; value: React.ReactNode; note?: string }) =>
  <Card><p className="text-sm text-slate-500">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p>{note && <p className="mt-1 text-xs text-slate-500">{note}</p>}</Card>;

const evaluationPercentage = (value: unknown) =>
  value == null || Number.isNaN(Number(value)) ? 'N/A' : `${(Number(value) * 100).toFixed(2)}%`;
const evaluationDecimal = (value: unknown) =>
  value == null || Number.isNaN(Number(value)) ? 'N/A' : Number(value).toFixed(3);

const ModelEvaluationPanel = ({ analytics }: { analytics: any }) => {
  const evaluation = analytics?.evaluation;
  const results = evaluation?.results || {};
  const isValidated = ['completed', 'available_provisional', 'available_preliminary', 'insufficient_sample'].includes(evaluation?.status)
    && Number(evaluation?.sampleSize || 0) > 0;
  const metrics = [
    { label: 'Accuracy', key: 'accuracy', format: evaluationPercentage },
    { label: 'Precision', key: 'precision', format: evaluationPercentage },
    { label: 'Recall', key: 'recall', format: evaluationPercentage },
    { label: 'Macro F1', key: 'macro_f1_score', format: evaluationPercentage },
    { label: 'MCC', key: 'matthews_correlation_coefficient', format: evaluationDecimal }
  ];

  return <Card>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-lg font-semibold">Human-labelled model performance</h2>
        <p className="mt-1 text-sm text-slate-500">
          Accuracy, precision, recall, Macro F1 and MCC are recalculated as soon as one authorised reviewer labels a project pair.
        </p>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${isValidated ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'}`}>
        {isValidated ? `${evaluation.sampleSize} labelled pairs · preliminary` : 'Awaiting human labels'}
      </span>
    </div>

    <div className="mt-5 grid gap-4 lg:grid-cols-3">
      {['tfidf', 'sentence_bert', 'bge_m3'].map(name => {
        const classification = results[name]?.classification;
        const confusion = classification?.confusion_matrix || {};
        const labelled = Number(evaluation?.perModel?.[name]?.sampleSize || 0);
        return <article key={name} className="rounded-xl border p-4 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">{modelNames[name]}</h3><span className="text-xs text-slate-500">{labelled} independent label(s)</span></div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {metrics.map(metric => <div key={metric.key} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-900">
              <p className="text-xs text-slate-500">{metric.label}</p>
              <p className="mt-1 text-xl font-bold">{metric.format(classification?.[metric.key])}</p>
            </div>)}
          </div>
          <div className="mt-3 grid grid-cols-4 gap-1 text-center text-xs">
            <span className="rounded bg-green-50 p-2 font-semibold text-green-700 dark:bg-green-950/40 dark:text-green-300">TP {Number(confusion.true_positive || 0)}</span>
            <span className="rounded bg-blue-50 p-2 font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">TN {Number(confusion.true_negative || 0)}</span>
            <span className="rounded bg-red-50 p-2 font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">FP {Number(confusion.false_positive || 0)}</span>
            <span className="rounded bg-orange-50 p-2 font-semibold text-orange-700 dark:bg-orange-950/40 dark:text-orange-300">FN {Number(confusion.false_negative || 0)}</span>
          </div>
        </article>;
      })}
    </div>

    {!isValidated && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <p>{evaluation?.note || 'No authorised human labels are available yet.'}</p>
      <p className="mt-1">The values appear automatically after the first valid review. Additional reviewers improve reliability but do not block evaluation.</p>
      <a href="#/admin/research/annotations" className="mt-3 inline-block font-semibold text-blue-700 underline dark:text-blue-300">Open expert annotation</a>
    </div>}
  </Card>;
};

const score = (value: unknown) => `${Number(value || 0).toFixed(2)}%`;
const date = (value: unknown) => value ? new Date(String(value)).toLocaleString() : '—';
const list = (value: unknown) => Array.isArray(value) ? value.join(', ') : String(value || '—');
const rowsOf = (response: any) => response?.data?.data?.rows || [];

export const ResearchHub = ({ view }: { view: ResearchView }) => {
  const [overview, setOverview] = useState<any>({ counts: {}, expected: {}, modelSummary: [], latestRuns: [] });
  const [rows, setRows] = useState<any[]>([]);
  const [secondaryRows, setSecondaryRows] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [firstProjectId, setFirstProjectId] = useState('');
  const [secondProjectId, setSecondProjectId] = useState('');
  const [pairComparison, setPairComparison] = useState<any>(null);
  const [model, setModel] = useState('');
  const [risk, setRisk] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { relationLabel: number; humanSimilarityPercentage: string }>>({});
  const activeAnnotationModel = similarityModelOrder.includes(model) ? model : 'sentence_bert';

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      const overviewResponse = await researchAPI.getOverview();
      setOverview(overviewResponse.data.data || {});
      setRows([]);
      setSecondaryRows([]);
      if (view === 'dataset') {
        const response = await researchAPI.getTestProjects({ limit: 100, search });
        setRows(rowsOf(response));
      } else if (view === 'imports') {
        setRows(rowsOf(await researchAPI.getImportRuns({ limit: 100 })));
      } else if (view === 'users') {
        setRows(rowsOf(await researchAPI.getTestUsers({ limit: 200, search })));
      } else if (view === 'profiles') {
        setRows(rowsOf(await researchAPI.getSupervisorProfiles({ limit: 100, search })));
      } else if (view === 'similarity-experiments') {
        setRows(rowsOf(await researchAPI.getExperimentRuns({ limit: 100, type: 'project_similarity', model })));
      } else if (view === 'pairs') {
        setRows(rowsOf(await researchAPI.getPairScores({ limit: 100, model, risk })));
      } else if (view === 'supervisor-experiments') {
        setRows(rowsOf(await researchAPI.getExperimentRuns({ limit: 100, type: 'supervisor_matching', model })));
      } else if (view === 'recommendations') {
        setRows(rowsOf(await researchAPI.getSupervisorScores({ limit: 100, model })));
      } else if (view === 'comparison') {
        const [projectResponse, runResponse, analyticsResponse] = await Promise.all([
          researchAPI.getTestProjects({ limit: 100 }),
          researchAPI.getExperimentRuns({ limit: 100 }),
          researchAPI.getAnalytics()
        ]);
        setProjects(rowsOf(projectResponse));
        setRows(rowsOf(runResponse));
        setAnalytics(analyticsResponse.data.data);
      } else if (view === 'visualizations') {
        const response = await researchAPI.getAnalytics();
        setAnalytics(response.data.data);
      } else if (view === 'annotations') {
        const [queueResponse, consensusResponse, analyticsResponse] = await Promise.all([
          researchAPI.getAnnotationQueue({ limit: 30, model: activeAnnotationModel, risk, datasetName: similarityDatasetForModel(activeAnnotationModel) }),
          researchAPI.getAnnotationConsensus({ limit: 100, model: activeAnnotationModel, datasetName: similarityDatasetForModel(activeAnnotationModel) }),
          researchAPI.getAnalytics()
        ]);
        setRows(queueResponse.data.data || []);
        setSecondaryRows(rowsOf(consensusResponse));
        setAnalytics(analyticsResponse.data.data);
      } else if (view === 'reports') {
        const response = await researchAPI.getReports();
        setReports(response.data.data || []);
      } else if (view === 'logs') {
        setRows(rowsOf(await researchAPI.getActivityLogs({ limit: 200, model })));
      }
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Unable to load research data.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, [view]);

  const comparison = async () => {
    if (!firstProjectId || !secondProjectId || firstProjectId === secondProjectId) {
      setError('Choose two different recorded research projects.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const response = await researchAPI.getRecordedPairComparison(firstProjectId, secondProjectId);
      setPairComparison(response.data.data);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  const saveAnnotation = async (row: any) => {
    const key = row._id;
    const draft = drafts[key] || { relationLabel: 0, humanSimilarityPercentage: '' };
    setBusy(true);
    setError('');
    try {
      await researchAPI.saveLabel({
        firstProjectId: row.firstProjectId._id,
        secondProjectId: row.secondProjectId._id,
        relationLabel: Number(draft.relationLabel),
        humanSimilarityPercentage: draft.humanSimilarityPercentage === '' ? undefined : Number(draft.humanSimilarityPercentage),
        modelName: activeAnnotationModel,
        datasetName: similarityDatasetForModel(activeAnnotationModel)
      });
      setNotice(`${modelNames[activeAnnotationModel]} annotation saved independently. Only this model's metrics were recalculated.`);
      await load();
    } catch (err: any) {
      setError(err.response?.data?.message || err.message);
      setBusy(false);
    }
  };

  const downloadRaw = async (resource: string, format: 'csv' | 'json') => {
    setBusy(true);
    setError('');
    try {
      const response = await researchAPI.downloadRawExport(resource, format);
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${resource}-${new Date().toISOString().slice(0, 10)}.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setBusy(false);
    }
  };

  const chartData = useMemo(() => (overview.modelSummary || []).map((row: any) => ({
    model: modelNames[row._id] || row._id,
    'Average score': Number(row.averageScore || 0),
    'Average time (ms)': Number(row.averageTimeMs || 0)
  })), [overview]);

  const filters = ['similarity-experiments', 'pairs', 'supervisor-experiments', 'recommendations', 'annotations', 'logs'].includes(view);
  const searchable = ['dataset', 'users', 'profiles'].includes(view);

  return <main className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-900 dark:text-white md:p-8">
    <div className="mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-blue-600">Research experiment · recorded database data</p>
          <h1 className="text-3xl font-bold">{pageTitles[view]}</h1>
        </div>
        <button onClick={load} disabled={busy} className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 disabled:opacity-50 dark:border-slate-600">
          <RefreshCw size={16} className={busy ? 'animate-spin' : ''}/>Refresh
        </button>
      </header>

      {error && <div className="rounded-xl bg-red-50 p-4 text-red-700 dark:bg-red-950/40 dark:text-red-300">{error}</div>}
      {notice && <div className="flex items-center gap-2 rounded-xl bg-green-50 p-4 text-green-700 dark:bg-green-950/40 dark:text-green-300"><CheckCircle2 size={18}/>{notice}</div>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Recorded projects" value={overview.counts?.projects ?? 0} note={`Expected ${overview.expected?.projects || 78}`}/>
        <Stat label="Project-pair scores" value={(overview.counts?.pairScores ?? 0).toLocaleString()} note="3,003 pairs per completed model"/>
        <Stat label="Supervisor scores" value={(overview.counts?.supervisorScores ?? 0).toLocaleString()} note="1,560 comparisons per completed model"/>
        <Stat label="Human annotations" value={overview.counts?.annotations ?? 0} note="Preliminary metrics begin after the first authorised label"/>
      </div>

      {(filters || searchable) && <Card>
        <div className="flex flex-wrap gap-3">
          {searchable && <label className="flex min-w-64 flex-1 items-center gap-2 rounded-lg border px-3 dark:border-slate-600"><Search size={16}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search recorded data" className="w-full bg-transparent py-2 outline-none"/></label>}
          {filters && <select value={view === 'annotations' ? activeAnnotationModel : model} onChange={event => setModel(event.target.value)} className="rounded-lg border bg-transparent px-3 py-2 dark:border-slate-600">
            {view !== 'annotations' && <option value="">All models</option>}<option value="tfidf">TF-IDF</option><option value="sentence_bert">Sentence-BERT</option><option value="bge_m3">BGE-M3</option>
          </select>}
          {['pairs', 'annotations'].includes(view) && <select value={risk} onChange={event => setRisk(event.target.value)} className="rounded-lg border bg-transparent px-3 py-2 dark:border-slate-600">
            <option value="">All risk levels</option><option value="Low">Low</option><option value="Medium">Medium</option><option value="High">High</option>
          </select>}
          <button onClick={load} className="rounded-lg bg-blue-600 px-5 py-2 font-semibold text-white">Apply filters</button>
        </div>
      </Card>}

      {view === 'dataset' && <Card>
        <h2 className="mb-1 text-lg font-semibold">Imported worksheet: Project Test Dataset</h2>
        <p className="mb-4 text-sm text-slate-500">The Notes worksheet was excluded. The six required academic fields are preserved and every row is linked to one test student.</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">No.</th><th className="p-3">Project title</th><th className="p-3">Student</th><th className="p-3">Program</th><th className="p-3">Content hash</th></tr></thead><tbody>{rows.map(row => <tr key={row._id} className="border-b dark:border-slate-700"><td className="p-3">{row.sourceRow - 1}</td><td className="p-3 font-medium">{row.title}</td><td className="p-3">{row.student?.name}<br/><span className="text-xs text-slate-500">{row.student?.studentId}</span></td><td className="p-3">{row.programId?.name || '—'}</td><td className="p-3 font-mono text-xs">{String(row.contentHash || '').slice(0, 16)}…</td></tr>)}</tbody></table></div>
      </Card>}

      {view === 'imports' && <Card>
        <h2 className="mb-4 text-lg font-semibold">Safe import audit</h2>
        {rows.map(row => <div key={row._id} className="mb-4 rounded-xl border p-4 dark:border-slate-700"><div className="flex flex-wrap justify-between gap-2"><strong>{row.sourceFile} · {row.sourceWorksheet}</strong><span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">{row.status}</span></div><p className="mt-2 text-sm text-slate-500">Run {row._id} · {date(row.startedAt)} · {row.durationMs} ms</p><div className="mt-3 grid grid-cols-2 gap-2 text-sm md:grid-cols-5"><span>Rows: {row.counts?.rowsRead}</span><span>Imported: {row.counts?.newlyCreatedRecords}</span><span>Duplicates: {row.counts?.duplicatesRemoved}</span><span>Invalid: {row.counts?.invalidRows}</span><span>Preserved: {row.counts?.preservedProjects}</span></div>{row.warnings?.length > 0 && <p className="mt-3 text-sm text-amber-700">{row.warnings.join(' ')}</p>}</div>)}
      </Card>}

      {view === 'users' && <Card>
        <h2 className="mb-4 text-lg font-semibold">Local research accounts</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">Identifier</th><th className="p-3">Assigned project</th><th className="p-3">Status</th></tr></thead><tbody>{rows.map(row => <tr key={row._id} className="border-b dark:border-slate-700"><td className="p-3 font-medium">{row.name}</td><td className="p-3">{row.email}</td><td className="p-3 capitalize">{row.role}</td><td className="p-3">{row.studentId || row.researchSupervisorId || '—'}</td><td className="p-3">{row.assignedProjectId?.title || '—'}</td><td className="p-3">{row.accountStatus} · test</td></tr>)}</tbody></table></div>
      </Card>}

      {view === 'profiles' && <div className="grid gap-4 lg:grid-cols-2">{rows.map(row => <Card key={row._id}>
        <div className="flex justify-between gap-4"><div><p className="text-xs font-semibold text-blue-600">{row.researchSupervisorId}</p><h2 className="text-lg font-bold">{row.name}</h2><p className="text-sm text-slate-500">{row.academicSpecialization}</p></div><span className="text-sm">{row.currentProjects}/{row.maxProjects} projects</span></div>
        <dl className="mt-4 space-y-2 text-sm"><div><dt className="font-semibold">Research interests and expertise</dt><dd className="text-slate-600 dark:text-slate-300">{list([...(row.researchInterests || []), ...(row.areasOfExpertise || [])])}</dd></div><div><dt className="font-semibold">Skills</dt><dd className="text-slate-600 dark:text-slate-300">{list(row.skills)}</dd></div><div><dt className="font-semibold">Technologies</dt><dd className="text-slate-600 dark:text-slate-300">{list(row.supervisorTechnologies)}</dd></div><div><dt className="font-semibold">Previous topics and publications</dt><dd className="text-slate-600 dark:text-slate-300">{list([...(row.previousSupervisedProjectTopics || []), ...(row.publicationKeywords || [])])}</dd></div></dl>
      </Card>)}</div>}

      {['similarity-experiments', 'supervisor-experiments'].includes(view) && <Card>
        <h2 className="mb-4 text-lg font-semibold">Recorded experiment runs</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Run ID</th><th className="p-3">Model</th><th className="p-3">Status</th><th className="p-3">Progress</th><th className="p-3">Stored / expected</th><th className="p-3">Duration</th><th className="p-3">Started</th></tr></thead><tbody>{rows.map(row => <tr key={row._id} className="border-b dark:border-slate-700"><td className="p-3 font-mono text-xs">{row._id}</td><td className="p-3">{(row.models || []).map((name: string) => modelNames[name] || name).join(', ')}</td><td className="p-3 capitalize">{row.status}</td><td className="p-3">{row.progress?.percentage || 0}%</td><td className="p-3">{row.resultCounts?.storedRecords ?? 0} / {row.resultCounts?.expectedRecords ?? row.progress?.total ?? 0}</td><td className="p-3">{row.durationMs ? `${(row.durationMs / 1000).toFixed(2)} s` : 'Running'}</td><td className="p-3">{date(row.startedAt)}</td></tr>)}</tbody></table></div>
      </Card>}

      {view === 'pairs' && <Card>
        <h2 className="mb-4 text-lg font-semibold">Stored pair scores</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">First recorded project</th><th className="p-3">Second recorded project</th><th className="p-3">Model</th><th className="p-3">Weighted</th><th className="p-3">Combined</th><th className="p-3">Risk</th><th className="p-3">Time</th><th className="p-3">Run</th></tr></thead><tbody>{rows.map(row => <tr key={row._id} className="border-b dark:border-slate-700"><td className="p-3 font-medium">{row.firstProjectTitle || row.firstProjectId?.title}</td><td className="p-3 font-medium">{row.secondProjectTitle || row.secondProjectId?.title}</td><td className="p-3">{modelNames[row.modelName] || row.modelName}</td><td className="p-3">{score(row.weightedOverallScore)}</td><td className="p-3">{score(row.unweightedCombinedScore)}</td><td className="p-3">{row.riskLevel}</td><td className="p-3">{Number(row.executionTimeMs || 0).toFixed(2)} ms</td><td className="p-3 font-mono text-xs">{String(row.experimentRunId).slice(-8)}</td></tr>)}</tbody></table></div>
      </Card>}

      {view === 'recommendations' && <Card>
        <h2 className="mb-1 text-lg font-semibold">All project–supervisor scores</h2><p className="mb-4 text-sm text-slate-500">Both pure semantic rank and capacity-aware adjusted rank are stored. Ineligible supervisors are never recommended.</p>
        <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Project</th><th className="p-3">Supervisor</th><th className="p-3">Model</th><th className="p-3">Semantic</th><th className="p-3">Adjusted</th><th className="p-3">Semantic rank</th><th className="p-3">Adjusted rank</th><th className="p-3">Eligible</th></tr></thead><tbody>{rows.map(row => <tr key={row._id} className="border-b dark:border-slate-700"><td className="p-3 font-medium">{row.projectId?.title}</td><td className="p-3">{row.supervisorId?.researchSupervisorId} · {row.supervisorId?.name}</td><td className="p-3">{modelNames[row.modelName] || row.modelName}</td><td className="p-3">{score(row.pureSemanticScore)}</td><td className="p-3">{score(row.finalAdjustedScore)}</td><td className="p-3">{row.semanticRank}</td><td className="p-3">{row.adjustedRank}</td><td className="p-3">{row.eligible ? 'Yes' : 'No'}</td></tr>)}</tbody></table></div>
      </Card>}

      {view === 'comparison' && <>
        <Card>
          <h2 className="mb-1 text-lg font-semibold">Compare two recorded projects</h2>
          <p className="mb-4 text-sm text-slate-500">This reads the persisted experiment scores for the imported dataset. It does not generate random projects.</p>
          <div className="grid gap-3 md:grid-cols-3">
            <select value={firstProjectId} onChange={event => setFirstProjectId(event.target.value)} className="rounded-lg border bg-transparent p-3 dark:border-slate-600"><option value="">First recorded project</option>{projects.map(project => <option key={project._id} value={project._id}>{project.sourceRow - 1}. {project.title}</option>)}</select>
            <select value={secondProjectId} onChange={event => setSecondProjectId(event.target.value)} className="rounded-lg border bg-transparent p-3 dark:border-slate-600"><option value="">Second recorded project</option>{projects.map(project => <option key={project._id} value={project._id}>{project.sourceRow - 1}. {project.title}</option>)}</select>
            <button onClick={comparison} disabled={busy} className="rounded-lg bg-blue-600 p-3 font-semibold text-white disabled:opacity-50">Show stored comparison</button>
          </div>
        </Card>
        {pairComparison && <Card><h2 className="mb-4 text-lg font-semibold">Measured model results</h2><div className="grid gap-4 md:grid-cols-3">{['tfidf', 'sentence_bert', 'bge_m3'].map(name => {
          const row = pairComparison.models?.[name];
          return <div key={name} className="rounded-xl border p-4 dark:border-slate-700"><p className="font-semibold">{modelNames[name]}</p>{row ? <><p className="my-2 text-3xl font-bold text-blue-600">{score(row.weightedOverallScore)}</p><p className="text-sm">{row.riskLevel} · {Number(row.executionTimeMs || 0).toFixed(2)} ms</p><div className="mt-3 space-y-1 text-xs text-slate-500">{Object.entries(row.fieldScores || {}).map(([field, value]) => <div key={field} className="flex justify-between"><span className="capitalize">{field.replaceAll('_', ' ')}</span><strong>{score(value)}</strong></div>)}</div></> : <p className="mt-3 text-sm text-amber-700">This model run has not completed yet.</p>}</div>;
        })}</div></Card>}
      </>}

      {false && <div className="grid gap-6 lg:grid-cols-2">
        <Card><h2 className="mb-1 text-lg font-semibold">Figure 1. Average project-pair similarity</h2><p className="mb-4 text-sm text-slate-500">Mean weighted score over all persisted pair records per model.</p><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="model"/><YAxis domain={[0, 100]} label={{ value: 'Similarity (%)', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/><Bar dataKey="Average score" fill="#2563eb"/></BarChart></ResponsiveContainer></div></Card>
        <Card><h2 className="mb-1 text-lg font-semibold">Figure 2. Average inference time</h2><p className="mb-4 text-sm text-slate-500">Measured execution time from the stored experiment records.</p><div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="model"/><YAxis label={{ value: 'Time (ms)', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/><Bar dataKey="Average time (ms)" fill="#0f766e"/></BarChart></ResponsiveContainer></div></Card>
        <Card className="lg:col-span-2"><h2 className="font-semibold">Ground-truth boundary</h2><p className="mt-2 text-slate-600 dark:text-slate-300">{overview.groundTruthStatus}</p><p className="mt-2 text-sm text-slate-500">Compatible metrics are calculated after the first authorised human label and clearly marked preliminary. Measurements that are statistically invalid for the available sample remain unavailable.</p></Card>
      </div>}

      {view === 'visualizations' && <ResearchVisualizations analytics={analytics} overview={overview}/>}

      {view === 'annotations' && <>
        <ModelEvaluationPanel analytics={analytics}/>
        <Card><h2 className="text-lg font-semibold">{modelNames[activeAnnotationModel]} expert annotation queue</h2><p className="mt-1 text-sm text-slate-500">0 = different, 1 = partially related, 2 = highly similar. Labels in this queue belong only to {modelNames[activeAnnotationModel]} and cannot affect another model.</p></Card>
        {rows.map(row => {
          const draft = drafts[row._id] || { relationLabel: 0, humanSimilarityPercentage: '' };
          return <Card key={row._id}><div className="grid gap-4 lg:grid-cols-2"><div><p className="text-xs text-slate-500">Project A</p><h3 className="font-semibold">{row.firstProjectId?.title}</h3><p className="mt-2 line-clamp-4 text-sm text-slate-600 dark:text-slate-300">{row.firstProjectId?.abstract}</p></div><div><p className="text-xs text-slate-500">Project B</p><h3 className="font-semibold">{row.secondProjectId?.title}</h3><p className="mt-2 line-clamp-4 text-sm text-slate-600 dark:text-slate-300">{row.secondProjectId?.abstract}</p></div></div><div className="mt-4 flex flex-wrap items-end gap-3"><label className="text-sm">Relationship<select value={draft.relationLabel} onChange={event => setDrafts(previous => ({ ...previous, [row._id]: { ...draft, relationLabel: Number(event.target.value) } }))} className="mt-1 block rounded-lg border bg-transparent p-2 dark:border-slate-600"><option value={0}>0 · Different</option><option value={1}>1 · Partially related</option><option value={2}>2 · Highly similar</option></select></label><label className="text-sm">Human score (optional)<input type="number" min="0" max="100" value={draft.humanSimilarityPercentage} onChange={event => setDrafts(previous => ({ ...previous, [row._id]: { ...draft, humanSimilarityPercentage: event.target.value } }))} className="mt-1 block w-40 rounded-lg border bg-transparent p-2 dark:border-slate-600"/></label><button onClick={() => saveAnnotation(row)} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Save label</button><span className="text-sm text-slate-500">Model sampling score: {score(row.weightedOverallScore)}</span></div></Card>;
        })}
        <Card><h2 className="font-semibold">{modelNames[activeAnnotationModel]} review status</h2><p className="mt-2 text-sm text-slate-500">{analytics?.evaluation?.perModel?.[activeAnnotationModel]?.labelledPairs || 0} model-specific pair(s) are labelled. Changing the model above opens a separate queue with separate saved labels and metrics.</p></Card>
      </>}

      {view === 'reports' && <Card>
        <h2 className="mb-1 text-lg font-semibold">Research reports and raw exports</h2><p className="mb-4 text-sm text-slate-500">CSV and JSON exports come directly from the research database. The verified Excel workbook, HTML, PDF and DOCX report are generated by the experiment workflow.</p>
        <div className="mb-5 flex flex-wrap gap-2">{['projects', 'users', 'supervisors', 'pair-scores', 'supervisor-scores', 'activities', 'experiment-runs'].map(resource => <React.Fragment key={resource}>{(['csv', 'json'] as const).map(format => <button type="button" onClick={() => downloadRaw(resource, format)} key={`${resource}-${format}`} className="flex items-center gap-1 rounded-lg border px-3 py-2 text-sm dark:border-slate-600"><Download size={14}/>{resource} {format.toUpperCase()}</button>)}</React.Fragment>)}</div>
        {reports.map(report => <div key={report._id} className="flex flex-wrap items-center justify-between gap-3 border-t py-3 dark:border-slate-700"><div><strong>{report.title}</strong><p className="text-sm text-slate-500">{date(report.createdAt)}</p></div></div>)}
      </Card>}

      {view === 'logs' && <Card>
        <h2 className="mb-4 text-lg font-semibold">Immutable research activity trail</h2>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Timestamp</th><th className="p-3">Action</th><th className="p-3">Role</th><th className="p-3">Model</th><th className="p-3">Status</th><th className="p-3">Run</th><th className="p-3">Metadata</th></tr></thead><tbody>{rows.map(row => <tr key={row._id} className="border-b dark:border-slate-700"><td className="p-3">{date(row.createdAt)}</td><td className="p-3 font-medium">{row.actionType}</td><td className="p-3">{row.userRole || 'system'}</td><td className="p-3">{modelNames[row.modelName] || row.modelName || '—'}</td><td className="p-3">{row.status}</td><td className="p-3 font-mono text-xs">{row.experimentRunId ? String(row.experimentRunId).slice(-8) : '—'}</td><td className="max-w-xs truncate p-3" title={JSON.stringify(row.metadata || {})}>{JSON.stringify(row.metadata || {})}</td></tr>)}</tbody></table></div>
      </Card>}

      {!busy && !rows.length && !['comparison', 'visualizations', 'reports'].includes(view) && <Card><div className="flex items-center gap-3 text-slate-500"><Database/><span>No records match the current filters.</span></div></Card>}
      <footer className="flex items-center gap-2 text-xs text-slate-500"><FlaskConical size={14}/>Only persisted database records are shown. Unlabelled scores are descriptive, not accuracy results.</footer>
    </div>
  </main>;
};
