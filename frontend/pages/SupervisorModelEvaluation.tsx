import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CheckCircle, ClipboardCheck, Loader2, RefreshCw, Save } from 'lucide-react';
import { researchAPI } from '../services/apiService';

const MODEL_ORDER = ['tfidf', 'sentence_bert', 'bge_m3'] as const;
const MODEL_LABELS: Record<string, string> = {
  tfidf: 'TF-IDF',
  sentence_bert: 'Sentence-BERT',
  bge_m3: 'BGE-M3',
};
const DATASET_NAME = 'supervisor_assignment_annotations_v2';
type ModelName = (typeof MODEL_ORDER)[number];
const datasetForModel = (model: ModelName) => `${DATASET_NAME}:${model}`;

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => (
  <section className={`rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>{children}</section>
);

const idOf = (value: any) => String(value?._id || value?.id || value || '');
const percent = (value: number) => `${value.toFixed(2)}%`;
const score = (value: unknown) => `${Number(value || 0).toFixed(2)}%`;

const loadAllPages = async (fetchPage: (page: number) => Promise<any>) => {
  const first = await fetchPage(1);
  const firstData = first.data?.data || {};
  const rows = [...(firstData.rows || [])];
  const pages = Math.min(30, Number(firstData.pagination?.pages || 1));
  if (pages > 1) {
    const responses = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => fetchPage(index + 2)));
    responses.forEach(response => rows.push(...(response.data?.data?.rows || [])));
  }
  return rows;
};

type EvaluationPair = {
  key: string;
  project: any;
  supervisor: any;
  scores: Record<string, any>;
};

type MetricRow = {
  model: string;
  modelLabel: string;
  labelled: number;
  tp: number;
  tn: number;
  fp: number;
  fn: number;
  accuracy: number;
  precision: number;
  recall: number;
  f1: number;
  mcc: number;
  threshold: number;
};

export const SupervisorModelEvaluation: React.FC = () => {
  const [scoreRows, setScoreRows] = useState<any[]>([]);
  const [groundTruthRows, setGroundTruthRows] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<ModelName>('tfidf');
  const [search, setSearch] = useState('');
  const [showOnlyUnlabelled, setShowOnlyUnlabelled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<Record<string, { grade: string; reason: string }>>({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [scores, ...labelGroups] = await Promise.all([
        loadAllPages(page => researchAPI.getSupervisorScores({ page, limit: 500 })),
        ...MODEL_ORDER.map(model => loadAllPages(page => researchAPI.getSupervisorGroundTruth({
          page,
          limit: 500,
          model,
          datasetName: datasetForModel(model),
        })).then(rows => rows.map(row => ({ ...row, evaluationModel: model })))),
      ]);
      setScoreRows(scores);
      setGroundTruthRows(labelGroups.flat());
    } catch (loadError: any) {
      setError(loadError?.response?.data?.message || loadError?.message || 'Unable to load supervisor evaluation data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const pairs = useMemo<EvaluationPair[]>(() => {
    const latestByIdentity = new Map<string, any>();
    scoreRows.forEach(row => {
      const identity = `${row.modelName}:${idOf(row.projectId)}:${idOf(row.supervisorId)}`;
      const current = latestByIdentity.get(identity);
      if (!current || new Date(row.createdAt || 0).getTime() >= new Date(current.createdAt || 0).getTime()) {
        latestByIdentity.set(identity, row);
      }
    });
    const grouped = new Map<string, EvaluationPair>();
    latestByIdentity.forEach(row => {
      const key = `${idOf(row.projectId)}:${idOf(row.supervisorId)}`;
      const item = grouped.get(key) || { key, project: row.projectId, supervisor: row.supervisorId, scores: {} };
      item.scores[row.modelName] = row;
      grouped.set(key, item);
    });
    return Array.from(grouped.values()).sort((left, right) => (
      String(left.project?.title || '').localeCompare(String(right.project?.title || ''))
      || String(left.supervisor?.name || '').localeCompare(String(right.supervisor?.name || ''))
    ));
  }, [scoreRows]);

  const labelsByModelPair = useMemo(() => {
    const labels = new Map<string, any>();
    [...groundTruthRows]
      .sort((left, right) => new Date(left.updatedAt || 0).getTime() - new Date(right.updatedAt || 0).getTime())
      .forEach(row => {
        const model = row.modelName || row.evaluationModel || String(row.datasetName || '').split(':').pop();
        if (MODEL_ORDER.includes(model as ModelName)) {
          labels.set(`${model}:${idOf(row.projectId)}:${idOf(row.supervisorId)}`, row);
        }
      });
    return labels;
  }, [groundTruthRows]);

  const pendingSuggestions = useMemo(() => Object.fromEntries(MODEL_ORDER.map(model => [
    model,
    groundTruthRows.filter(row => (
      (row.modelName || row.evaluationModel || String(row.datasetName || '').split(':').pop()) === model
      && row.annotationStatus === 'draft'
    )).length,
  ])), [groundTruthRows]);

  const metrics = useMemo<MetricRow[]>(() => MODEL_ORDER.map(model => {
    const observations: Array<{ actual: number; score: number }> = [];
    pairs.forEach(pair => {
      const label = labelsByModelPair.get(`${model}:${pair.key}`);
      const modelScore = pair.scores[model];
      if (!label || label.annotationStatus !== 'submitted' || !modelScore) return;
      observations.push({
        actual: Number(label.consensusRelevanceGrade ?? label.relevanceGrade) >= 2 ? 1 : 0,
        score: Number(modelScore.finalAdjustedScore || 0),
      });
    });
    const measure = (threshold: number): MetricRow => {
      let tp = 0; let tn = 0; let fp = 0; let fn = 0;
      observations.forEach(observation => {
        const predicted = observation.score >= threshold ? 1 : 0;
        if (observation.actual === 1 && predicted === 1) tp += 1;
        else if (observation.actual === 0 && predicted === 0) tn += 1;
        else if (observation.actual === 0 && predicted === 1) fp += 1;
        else fn += 1;
      });
      const labelled = observations.length;
      const accuracy = labelled ? ((tp + tn) / labelled) * 100 : 0;
      const precisionValue = tp + fp ? (tp / (tp + fp)) * 100 : 0;
      const recallValue = tp + fn ? (tp / (tp + fn)) * 100 : 0;
      const f1 = precisionValue + recallValue ? (2 * precisionValue * recallValue) / (precisionValue + recallValue) : 0;
      const mccDenominator = Math.sqrt((tp + fp) * (tp + fn) * (tn + fp) * (tn + fn));
      const mcc = mccDenominator ? (tp * tn - fp * fn) / mccDenominator : 0;
      return { model, modelLabel: MODEL_LABELS[model], labelled, tp, tn, fp, fn, accuracy, precision: precisionValue, recall: recallValue, f1, mcc, threshold };
    };
    let best = measure(70);
    [...new Set(observations.map(row => row.score))].forEach(candidate => {
      const measured = measure(candidate);
      if (measured.f1 > best.f1 || (measured.f1 === best.f1 && measured.accuracy > best.accuracy)) best = measured;
    });
    return best;
  }), [pairs, labelsByModelPair]);

  const selectedMetrics = metrics.find(row => row.model === selectedModel);

  const filteredPairs = useMemo(() => {
    const query = search.trim().toLowerCase();
    return pairs.filter(pair => {
      if (!pair.scores[selectedModel]) return false;
      const matchesSearch = !query
        || String(pair.project?.title || '').toLowerCase().includes(query)
        || String(pair.supervisor?.name || '').toLowerCase().includes(query)
        || String(pair.supervisor?.researchSupervisorId || '').toLowerCase().includes(query);
      const label = labelsByModelPair.get(`${selectedModel}:${pair.key}`);
      return matchesSearch && (!showOnlyUnlabelled || label?.annotationStatus !== 'submitted');
    });
  }, [pairs, labelsByModelPair, search, selectedModel, showOnlyUnlabelled]);

  const saveLabel = async (pair: EvaluationPair) => {
    const modelPairKey = `${selectedModel}:${pair.key}`;
    const existing = labelsByModelPair.get(modelPairKey);
    const draft = drafts[modelPairKey];
    const grade = Number(draft?.grade ?? existing?.relevanceGrade);
    if (![0, 1, 2, 3].includes(grade)) {
      setError('Choose a relevance grade before saving.');
      return;
    }
    setSavingKey(modelPairKey);
    setError('');
    setNotice('');
    try {
      const response = await researchAPI.saveSupervisorGroundTruth({
        projectId: idOf(pair.project),
        supervisorId: idOf(pair.supervisor),
        relevanceGrade: grade,
        annotationReason: draft?.reason ?? existing?.annotationReason ?? '',
        modelName: selectedModel,
        datasetName: datasetForModel(selectedModel),
      });
      const saved = response.data?.data;
      setGroundTruthRows(previous => [
        ...previous.filter(row => {
          const rowModel = row.modelName || row.evaluationModel || String(row.datasetName || '').split(':').pop();
          return `${rowModel}:${idOf(row.projectId)}:${idOf(row.supervisorId)}` !== modelPairKey;
        }),
        { ...saved, projectId: pair.project, supervisorId: pair.supervisor, modelName: selectedModel, evaluationModel: selectedModel },
      ]);
      setNotice(`Saved the ${MODEL_LABELS[selectedModel]} expert label for ${pair.project?.title || 'project'} and ${pair.supervisor?.name || 'supervisor'}.`);
    } catch (saveError: any) {
      setError(saveError?.response?.data?.message || saveError?.message || 'Unable to save the label.');
    } finally {
      setSavingKey('');
    }
  };

  return (
    <div className="min-h-screen space-y-6 p-4 md:p-8">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">Expert Evaluation</p>
          <h1 className="mt-1 text-3xl font-extrabold text-slate-900 dark:text-white">Supervisor Model Accuracy Labelling</h1>
          <p className="mt-2 max-w-3xl text-sm text-slate-500 dark:text-slate-400">
            Evaluate TF-IDF, Sentence-BERT, and BGE-M3 independently. Each model keeps its own expert label for every project-supervisor result.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 font-bold dark:border-slate-700 dark:text-white">
          <RefreshCw size={17} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </header>

      {error && <div className="rounded-xl bg-red-50 p-4 text-sm font-semibold text-red-700 dark:bg-red-950/30 dark:text-red-300">{error}</div>}
      {notice && <div className="flex items-center gap-2 rounded-xl bg-green-50 p-4 text-sm font-semibold text-green-700 dark:bg-green-950/30 dark:text-green-300"><CheckCircle size={18} />{notice}</div>}

      <Card className="p-5">
        <div className="mb-5">
          <p className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">Choose model to evaluate</p>
          <div className="flex flex-wrap gap-2">
            {MODEL_ORDER.map(model => {
              const modelMetrics = metrics.find(row => row.model === model);
              const active = selectedModel === model;
              return <button key={model} type="button" onClick={() => setSelectedModel(model)} className={`rounded-xl border px-4 py-2 text-sm font-bold transition ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-slate-200 text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:text-slate-200'}`}>{MODEL_LABELS[model]} <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${active ? 'bg-white/20' : 'bg-slate-100 dark:bg-slate-900'}`}>{modelMetrics?.labelled || 0} confirmed · {pendingSuggestions[model] || 0} drafts</span></button>;
            })}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3 md:items-end">
          <div className="text-sm font-bold text-slate-700 dark:text-slate-200">F1-optimised model threshold
            <div className="mt-2 rounded-xl bg-blue-50 px-4 py-3 text-xl font-black text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{Number(selectedMetrics?.threshold || 0).toFixed(2)}%</div>
          </div>
          <label className="text-sm font-bold text-slate-700 dark:text-slate-200">Search project or supervisor
            <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search..." className="mt-2 w-full rounded-xl border border-slate-200 bg-transparent px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700"/>
          </label>
          <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 dark:bg-slate-900 dark:text-slate-200"><input type="checkbox" checked={showOnlyUnlabelled} onChange={event => setShowOnlyUnlabelled(event.target.checked)}/> Show only unlabelled pairs</label>
        </div>
        <p className="mt-4 text-xs text-slate-500">You are evaluating {MODEL_LABELS[selectedModel]} only. Grades 0–1 are Not Relevant and grades 2–3 are Relevant. Each model now uses its own threshold selected from submitted labels to maximise F1; the result is provisional and in-sample.</p>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {metrics.map(row => <Card key={row.model} className="p-5"><div className="flex items-center justify-between"><h2 className="font-black text-slate-900 dark:text-white">{row.modelLabel}</h2><span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">{row.labelled} labels · threshold {row.threshold.toFixed(2)}%</span></div><div className="mt-4 grid grid-cols-2 gap-3 text-center"><div><p className="text-2xl font-black text-blue-600">{row.labelled ? percent(row.accuracy) : 'N/A'}</p><p className="text-[10px] font-bold uppercase text-slate-400">Accuracy</p></div><div><p className="text-2xl font-black text-purple-600">{row.labelled ? percent(row.f1) : 'N/A'}</p><p className="text-[10px] font-bold uppercase text-slate-400">F1</p></div><div><p className="text-lg font-black text-emerald-600">{row.labelled ? percent(row.precision) : 'N/A'}</p><p className="text-[10px] font-bold uppercase text-slate-400">Precision</p></div><div><p className="text-lg font-black text-orange-600">{row.labelled ? percent(row.recall) : 'N/A'}</p><p className="text-[10px] font-bold uppercase text-slate-400">Recall</p></div><div><p className="text-lg font-black text-cyan-600">{row.labelled ? row.mcc.toFixed(3) : 'N/A'}</p><p className="text-[10px] font-bold uppercase text-slate-400">MCC</p></div></div><div className="mt-4 grid grid-cols-4 gap-1 text-center text-xs"><span className="rounded bg-green-50 p-1 text-green-700">TP {row.tp}</span><span className="rounded bg-blue-50 p-1 text-blue-700">TN {row.tn}</span><span className="rounded bg-red-50 p-1 text-red-700">FP {row.fp}</span><span className="rounded bg-orange-50 p-1 text-orange-700">FN {row.fn}</span></div></Card>)}
      </div>

      <Card className="p-5">
        <h2 className="font-black text-slate-900 dark:text-white">Evaluation Metrics Across All Models</h2>
        <div className="mt-4 h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={metrics}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="modelLabel"/><YAxis domain={[0, 100]}/><Tooltip/><Bar dataKey="accuracy" name="Accuracy" fill="#2563eb"/><Bar dataKey="precision" name="Precision" fill="#16a34a"/><Bar dataKey="recall" name="Recall" fill="#f59e0b"/><Bar dataKey="f1" name="F1 score" fill="#7c3aed"/></BarChart></ResponsiveContainer></div>
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-slate-200 p-5 dark:border-slate-700"><h2 className="flex items-center gap-2 font-black text-slate-900 dark:text-white"><ClipboardCheck size={20} className="text-blue-600"/>{MODEL_LABELS[selectedModel]} Expert Labelling Queue</h2><p className="mt-1 text-sm text-slate-500">Showing {Math.min(filteredPairs.length, 100)} of {filteredPairs.length.toLocaleString()} matching results. {pendingSuggestions[selectedModel] || 0} draft suggestions are prefilled for review. Saving confirms only this model’s label.</p></div>
        {loading && !pairs.length ? <div className="flex items-center justify-center gap-2 p-12 text-slate-500"><Loader2 className="animate-spin"/>Loading supervisor experiments...</div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500 dark:bg-slate-900/50"><tr><th className="p-3">Project</th><th className="p-3">Supervisor</th><th className="p-3">{MODEL_LABELS[selectedModel]} semantic / adjusted</th><th className="p-3">Expert relevance</th><th className="p-3">Reason</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-slate-100 dark:divide-slate-700">{filteredPairs.slice(0, 100).map(pair => { const modelPairKey = `${selectedModel}:${pair.key}`; const existing = labelsByModelPair.get(modelPairKey); const draft = drafts[modelPairKey] || { grade: existing?.relevanceGrade != null ? String(existing.relevanceGrade) : '', reason: existing?.annotationReason || '' }; const modelScore = pair.scores[selectedModel]; return <tr key={pair.key}><td className="p-3 font-semibold text-slate-900 dark:text-white">{pair.project?.title || '-'}</td><td className="p-3"><span className="font-semibold">{pair.supervisor?.name || '-'}</span><br/><span className="text-xs text-slate-400">{pair.supervisor?.researchSupervisorId || pair.supervisor?.academicSpecialization || ''}</span></td><td className="p-3"><strong>{score(modelScore.pureSemanticScore)}</strong> / {score(modelScore.finalAdjustedScore)}<br/><span className="text-xs text-slate-400">Rank {modelScore.adjustedRank || '-'}</span></td><td className="p-3"><select value={draft.grade} onChange={event => setDrafts(previous => ({ ...previous, [modelPairKey]: { ...draft, grade: event.target.value } }))} className="rounded-lg border bg-transparent p-2 dark:border-slate-600"><option value="">Choose</option><option value="0">0 · Not relevant</option><option value="1">1 · Weak</option><option value="2">2 · Relevant</option><option value="3">3 · Excellent</option></select></td><td className="p-3"><input value={draft.reason} onChange={event => setDrafts(previous => ({ ...previous, [modelPairKey]: { ...draft, reason: event.target.value } }))} placeholder="Expert reason" className="w-56 rounded-lg border bg-transparent p-2 dark:border-slate-600"/></td><td className="p-3"><button type="button" onClick={() => void saveLabel(pair)} disabled={savingKey === modelPairKey} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 font-bold text-white disabled:opacity-50">{savingKey === modelPairKey ? <Loader2 size={15} className="animate-spin"/> : <Save size={15}/>}Save</button></td></tr>; })}</tbody></table></div>}
      </Card>

      <p className="text-xs text-slate-500">Each model’s accuracy, precision, recall, F1 and MCC use only that model’s submitted database annotations and its own F1-optimised threshold. No similarity labels are used or modified.</p>
    </div>
  );
};
