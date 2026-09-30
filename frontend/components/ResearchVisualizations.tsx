import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis
} from 'recharts';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Database, Gauge } from 'lucide-react';

const MODEL_ORDER = ['tfidf', 'sentence_bert', 'bge_m3'];
const MODEL_NAMES: Record<string, string> = {
  tfidf: 'TF-IDF',
  sentence_bert: 'Sentence-BERT',
  bge_m3: 'BGE-M3'
};
const MODEL_COLOURS: Record<string, string> = {
  tfidf: '#2563eb',
  sentence_bert: '#0f766e',
  bge_m3: '#d97706'
};

const Card = ({ children, className = '' }: { children: React.ReactNode; className?: string }) =>
  <section className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-800 ${className}`}>{children}</section>;

const Figure = ({
  title,
  children,
  className = ''
}: {
  number?: number;
  title: string;
  caption?: string;
  children: React.ReactNode;
  className?: string;
}) => <Card className={className}>
  <h2 className="text-lg font-semibold">{title}</h2>
  <div className="mt-4">{children}</div>
</Card>;

const percentage = (value: unknown, digits = 2) =>
  value == null || Number.isNaN(Number(value)) ? 'N/A' : `${Number(value).toFixed(digits)}%`;
const ratioPercentage = (value: unknown, digits = 2) =>
  value == null || Number.isNaN(Number(value)) ? 'N/A' : `${(Number(value) * 100).toFixed(digits)}%`;
const decimal = (value: unknown, digits = 3) =>
  value == null || Number.isNaN(Number(value)) ? 'N/A' : Number(value).toFixed(digits);

const ModelBars = () => <>
  {MODEL_ORDER.map(model => <Bar
    key={model}
    dataKey={model}
    name={MODEL_NAMES[model]}
    fill={MODEL_COLOURS[model]}
    radius={[4, 4, 0, 0]}
  />)}
</>;

const ConfusionMatrix = ({ model, values }: { model: string; values: any }) => {
  const total = ['true_positive', 'true_negative', 'false_positive', 'false_negative']
    .reduce((sum, key) => sum + Number(values?.[key] || 0), 0);
  return <div className="rounded-xl border p-4 dark:border-slate-700">
    <h3 className="mb-3 font-semibold">{MODEL_NAMES[model]}</h3>
    <div className="mb-2 grid grid-cols-[auto_1fr_1fr] gap-1 text-center text-xs">
      <span/>
      <span className="font-semibold">Predicted similar</span>
      <span className="font-semibold">Predicted different</span>
      <span className="flex items-center justify-end pr-2 font-semibold">Actually similar</span>
      <span className="rounded-lg bg-emerald-100 p-4 font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">TP<br/>{values?.true_positive ?? 0}</span>
      <span className="rounded-lg bg-red-100 p-4 font-bold text-red-800 dark:bg-red-950 dark:text-red-300">FN<br/>{values?.false_negative ?? 0}</span>
      <span className="flex items-center justify-end pr-2 font-semibold">Actually different</span>
      <span className="rounded-lg bg-red-100 p-4 font-bold text-red-800 dark:bg-red-950 dark:text-red-300">FP<br/>{values?.false_positive ?? 0}</span>
      <span className="rounded-lg bg-emerald-100 p-4 font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">TN<br/>{values?.true_negative ?? 0}</span>
    </div>
    <p className="text-right text-xs text-slate-500">Consensus pairs: {total}</p>
  </div>;
};

const AwaitingLabels = ({ analytics }: { analytics: any }) => {
  const metrics = [
    'Accuracy', 'Precision', 'Recall / sensitivity', 'F1-score', 'Macro-F1', 'Weighted-F1', 'Specificity',
    'Negative predictive value', 'False-positive rate', 'False-negative rate',
    'False-discovery rate', 'Balanced accuracy', 'Matthews correlation coefficient',
    'Brier calibration loss', 'Calibration curve', 'Accuracy-optimal threshold',
    'F1-optimal threshold', 'Recall-optimal threshold', 'Balanced-optimal threshold',
    'McNemar significance test', 'Paired score tests', 'Friedman multi-model test',
    'Cohen’s kappa', 'ROC-AUC', 'Average precision / PR-AUC', 'MAE', 'MSE',
    'RMSE', 'Median absolute error', 'R²', 'Pearson correlation', 'Spearman correlation'
  ];
  return <Card className="lg:col-span-2">
    <div className="flex items-start gap-3">
      <AlertTriangle className="mt-0.5 text-amber-600" size={22}/>
      <div>
        <h2 className="text-lg font-semibold">Similarity Models — Human-Validated Classification Metrics</h2>
        <p className="mt-2 text-sm font-medium">Current authorised-reviewer sample: {analytics?.evaluation?.sampleSize || 0} pairs.</p>
      </div>
    </div>
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead><tr className="border-b text-slate-500"><th className="p-3">Measurement</th>{MODEL_ORDER.map(model => <th key={model} className="p-3">{MODEL_NAMES[model]}</th>)}</tr></thead>
        <tbody>{metrics.map(metric => <tr key={metric} className="border-b dark:border-slate-700"><td className="p-3 font-medium">{metric}</td>{MODEL_ORDER.map(model => <td key={model} className="p-3 text-slate-500">N/A — awaiting labels</td>)}</tr>)}</tbody>
      </table>
    </div>
    <a href="#/admin/research/annotations" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">
      <ClipboardCheck size={17}/>Open expert annotation
    </a>
  </Card>;
};

const EvaluationResults = ({ analytics }: { analytics: any }) => {
  const results = analytics?.evaluation?.results || {};
  const classificationRows = MODEL_ORDER.map(model => {
    const row = results[model]?.classification || {};
    return {
      model,
      modelLabel: MODEL_NAMES[model],
      threshold: row.threshold,
      accuracy: Number(row.accuracy || 0) * 100,
      precision: Number(row.precision || 0) * 100,
      recall: Number(row.recall || 0) * 100,
      f1: Number(row.f1_score || 0) * 100,
      specificity: Number(row.specificity || 0) * 100,
      balancedAccuracy: Number(row.balanced_accuracy || 0) * 100
    };
  });
  const metricChartData = ['accuracy', 'precision', 'recall', 'f1'].map(metric => ({
    metric: metric === 'f1' ? 'F1-score' : metric[0].toUpperCase() + metric.slice(1),
    ...Object.fromEntries(MODEL_ORDER.map(model => [
      model,
      classificationRows.find(row => row.model === model)?.[metric as keyof typeof classificationRows[number]] || 0
    ]))
  }));
  const thresholds = [50, 55, 60, 65, 70, 75, 80];
  const thresholdData = thresholds.map(threshold => ({
    threshold,
    ...Object.fromEntries(MODEL_ORDER.map(model => {
      const row = (results[model]?.threshold_analysis || []).find((item: any) => Number(item.threshold) === threshold);
      return [model, Number(row?.f1_score || 0) * 100];
    }))
  }));
  const curve = (model: string, type: 'roc' | 'pr') => {
    const classification = results[model]?.classification || {};
    if (type === 'roc') {
      const values = classification.roc_curve;
      return (values?.fpr || []).map((x: number, index: number) => ({ x: x * 100, y: Number(values.tpr[index] || 0) * 100 }));
    }
    const values = classification.precision_recall_curve;
    return (values?.recall || []).map((x: number, index: number) => ({ x: x * 100, y: Number(values.precision[index] || 0) * 100 }));
  };

  return <>
    <Figure number={10} title="Similarity Models — Accuracy, Precision, Recall and F1-score" caption={`Preliminary human-label evaluation using ${analytics.evaluation.sampleSize} model-specific labelled pairs.`} className="lg:col-span-2">
      <div className="h-96"><ResponsiveContainer width="100%" height="100%"><BarChart data={metricChartData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="metric"/><YAxis domain={[0, 100]} label={{ value: 'Performance (%)', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/><ModelBars/></BarChart></ResponsiveContainer></div>
    </Figure>

    <Card className="lg:col-span-2">
      <h2 className="text-lg font-semibold">Similarity Models — Complete Classification Measurements</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1500px] text-left text-sm"><thead><tr className="border-b text-slate-500">
        <th className="p-3">Model</th><th className="p-3">Threshold</th><th className="p-3">Accuracy</th><th className="p-3">Precision</th><th className="p-3">Recall</th><th className="p-3">F1</th><th className="p-3">Specificity</th><th className="p-3">NPV</th><th className="p-3">FPR</th><th className="p-3">FNR</th><th className="p-3">FDR</th><th className="p-3">Balanced accuracy</th><th className="p-3">MCC</th><th className="p-3">Kappa</th><th className="p-3">ROC-AUC</th><th className="p-3">Average precision</th>
      </tr></thead><tbody>{MODEL_ORDER.map(model => {
        const row = results[model]?.classification || {};
        return <tr key={model} className="border-b dark:border-slate-700"><td className="p-3 font-semibold">{MODEL_NAMES[model]}</td><td className="p-3">{percentage(row.threshold, 0)}</td><td className="p-3">{ratioPercentage(row.accuracy)}</td><td className="p-3">{ratioPercentage(row.precision)}</td><td className="p-3">{ratioPercentage(row.recall)}</td><td className="p-3">{ratioPercentage(row.f1_score)}</td><td className="p-3">{ratioPercentage(row.specificity)}</td><td className="p-3">{ratioPercentage(row.negative_predictive_value)}</td><td className="p-3">{ratioPercentage(row.false_positive_rate)}</td><td className="p-3">{ratioPercentage(row.false_negative_rate)}</td><td className="p-3">{ratioPercentage(row.false_discovery_rate)}</td><td className="p-3">{ratioPercentage(row.balanced_accuracy)}</td><td className="p-3">{decimal(row.matthews_correlation_coefficient)}</td><td className="p-3">{decimal(row.cohens_kappa)}</td><td className="p-3">{decimal(row.roc_auc)}</td><td className="p-3">{decimal(row.average_precision)}</td></tr>;
      })}</tbody></table></div>
    </Card>

    <Card className="lg:col-span-2">
      <h2 className="text-lg font-semibold">Similarity Models — F1 Variants, Calibration and Optimal Thresholds</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Model</th><th className="p-3">Macro-F1</th><th className="p-3">Weighted-F1</th><th className="p-3">Brier loss</th><th className="p-3">Accuracy-optimal</th><th className="p-3">F1-optimal</th><th className="p-3">Recall-optimal</th><th className="p-3">Balanced-optimal</th></tr></thead><tbody>{MODEL_ORDER.map(model => {
        const row = results[model]?.classification || {};
        const optimal = results[model]?.optimal_thresholds || {};
        return <tr key={model} className="border-b dark:border-slate-700"><td className="p-3 font-semibold">{MODEL_NAMES[model]}</td><td className="p-3">{ratioPercentage(row.macro_f1_score)}</td><td className="p-3">{ratioPercentage(row.weighted_f1_score)}</td><td className="p-3">{decimal(row.brier_score)}</td><td className="p-3">{percentage(optimal.accuracy_optimal?.threshold, 0)}</td><td className="p-3">{percentage(optimal.f1_optimal?.threshold, 0)}</td><td className="p-3">{percentage(optimal.recall_optimal?.threshold, 0)}</td><td className="p-3">{percentage(optimal.balanced_accuracy_optimal?.threshold, 0)}</td></tr>;
      })}</tbody></table></div>
    </Card>

    <Figure number={11} title="Similarity Models — Confusion Matrices" caption="True-positive, false-negative, false-positive and true-negative counts at each similarity model’s configured threshold." className="lg:col-span-2">
      <div className="grid gap-4 lg:grid-cols-3">{MODEL_ORDER.map(model => <ConfusionMatrix key={model} model={model} values={results[model]?.classification?.confusion_matrix}/>)}</div>
    </Figure>

    <Figure number={12} title="Similarity Models — Threshold-versus-F1 Analysis" caption="Similarity F1-score sensitivity at thresholds from 50% to 80%." className="lg:col-span-2">
      <div className="h-80"><ResponsiveContainer width="100%" height="100%"><LineChart data={thresholdData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="threshold" label={{ value: 'Classification threshold (%)', position: 'insideBottom', offset: -4 }}/><YAxis domain={[0, 100]} label={{ value: 'F1-score (%)', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/>{MODEL_ORDER.map(model => <Line key={model} type="monotone" dataKey={model} name={MODEL_NAMES[model]} stroke={MODEL_COLOURS[model]} strokeWidth={3}/>)}</LineChart></ResponsiveContainer></div>
    </Figure>

    <Figure number={13} title="Similarity Models — ROC Curves" caption="Similarity-model sensitivity against false-positive rate; ROC-AUC values are reported in the classification table.">
      <div className="h-80"><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" dataKey="x" domain={[0, 100]} name="False-positive rate" unit="%"/><YAxis type="number" dataKey="y" domain={[0, 100]} name="Sensitivity" unit="%"/><ZAxis range={[20, 20]}/><Tooltip/><Legend/>{MODEL_ORDER.map(model => <Scatter key={model} name={MODEL_NAMES[model]} data={curve(model, 'roc')} fill={MODEL_COLOURS[model]} line shape="circle"/>)}</ScatterChart></ResponsiveContainer></div>
    </Figure>

    <Figure number={14} title="Similarity Models — Precision-Recall Curves" caption="Similarity-model precision against recall; especially informative when the similar/different classes are imbalanced.">
      <div className="h-80"><ResponsiveContainer width="100%" height="100%"><ScatterChart><CartesianGrid strokeDasharray="3 3"/><XAxis type="number" dataKey="x" domain={[0, 100]} name="Recall" unit="%"/><YAxis type="number" dataKey="y" domain={[0, 100]} name="Precision" unit="%"/><ZAxis range={[20, 20]}/><Tooltip/><Legend/>{MODEL_ORDER.map(model => <Scatter key={model} name={MODEL_NAMES[model]} data={curve(model, 'pr')} fill={MODEL_COLOURS[model]} line shape="circle"/>)}</ScatterChart></ResponsiveContainer></div>
    </Figure>

    {analytics.evaluation.humanScoresAvailable && <Card className="lg:col-span-2">
      <h2 className="text-lg font-semibold">Similarity Models — Continuous Human-Score Agreement</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Model</th><th className="p-3">MAE</th><th className="p-3">MSE</th><th className="p-3">RMSE</th><th className="p-3">Median AE</th><th className="p-3">R²</th><th className="p-3">Pearson</th><th className="p-3">Spearman</th><th className="p-3">Average difference</th><th className="p-3">SD difference</th></tr></thead><tbody>{MODEL_ORDER.map(model => {
        const row = results[model]?.human_score_agreement || {};
        return <tr key={model} className="border-b dark:border-slate-700"><td className="p-3 font-semibold">{MODEL_NAMES[model]}</td><td className="p-3">{decimal(row.mean_absolute_error)}</td><td className="p-3">{decimal(row.mean_squared_error)}</td><td className="p-3">{decimal(row.root_mean_squared_error)}</td><td className="p-3">{decimal(row.median_absolute_error)}</td><td className="p-3">{decimal(row.r_squared)}</td><td className="p-3">{decimal(row.pearson_correlation)}</td><td className="p-3">{decimal(row.spearman_correlation)}</td><td className="p-3">{decimal(row.average_score_difference)}</td><td className="p-3">{decimal(row.standard_deviation_score_differences)}</td></tr>;
      })}</tbody></table></div>
    </Card>}

    {Array.isArray(results.statistical_tests) && <Card className="lg:col-span-2">
      <h2 className="text-lg font-semibold">Similarity Models — Statistical Significance Tests</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Test</th><th className="p-3">Models</th><th className="p-3">Statistic</th><th className="p-3">P-value</th><th className="p-3">Alpha</th><th className="p-3">Sample</th><th className="p-3">Interpretation</th></tr></thead><tbody>{results.statistical_tests.map((row: any, index: number) => <tr key={`${row.test_name}-${index}`} className="border-b dark:border-slate-700"><td className="p-3 font-semibold">{row.test_name}</td><td className="p-3">{(row.models || []).map((model: string) => MODEL_NAMES[model] || model).join(' vs ')}</td><td className="p-3">{decimal(row.test_statistic)}</td><td className="p-3">{decimal(row.p_value, 5)}</td><td className="p-3">{decimal(row.significance_level, 2)}</td><td className="p-3">{row.sample_size}</td><td className="p-3">{row.interpretation}</td></tr>)}</tbody></table></div>
    </Card>}
  </>;
};

const SupervisorEvaluationResults = ({ analytics }: { analytics: any }) => {
  const evaluation = analytics?.supervisorEvaluation;
  const results = evaluation?.results || {};
  const rows = MODEL_ORDER.map(model => {
    const row = results[model] || {};
    return {
      model,
      modelLabel: MODEL_NAMES[model],
      sampleSize: Number(row.sampleSize || 0),
      threshold: Number(row.threshold || 0),
      accuracy: Number(row.accuracy || 0) * 100,
      precision: Number(row.precision || 0) * 100,
      recall: Number(row.recall || 0) * 100,
      f1: Number(row.f1Score || 0) * 100,
      mcc: Number(row.matthewsCorrelationCoefficient || 0),
      tp: Number(row.truePositive || 0),
      tn: Number(row.trueNegative || 0),
      fp: Number(row.falsePositive || 0),
      fn: Number(row.falseNegative || 0),
    };
  });
  if (!rows.some(row => row.sampleSize > 0)) return null;

  const metricData = ['accuracy', 'precision', 'recall', 'f1'].map(metric => ({
    metric: metric === 'f1' ? 'F1-score' : metric[0].toUpperCase() + metric.slice(1),
    ...Object.fromEntries(MODEL_ORDER.map(model => [
      model,
      rows.find(row => row.model === model)?.[metric as 'accuracy' | 'precision' | 'recall' | 'f1'] || 0,
    ])),
  }));
  const confusionData = rows.map(row => ({
    model: row.modelLabel,
    TP: row.tp,
    TN: row.tn,
    FP: row.fp,
    FN: row.fn,
  }));
  const thresholdData = rows.map(row => ({
    model: row.modelLabel,
    'Decision threshold': row.threshold,
    'MCC × 100': row.mcc * 100,
  }));
  const classBalanceData = rows.map(row => ({
    model: row.modelLabel,
    Relevant: row.tp + row.fn,
    'Not relevant': row.tn + row.fp,
  }));

  return <>
    <Figure number={15} title="Supervisor Assignment Models — Accuracy, Precision, Recall and F1-score" caption={`Provisional evaluation using ${rows[0]?.sampleSize || 0} submitted project-supervisor annotations per model.`} className="lg:col-span-2">
      <div className="h-96"><ResponsiveContainer width="100%" height="100%"><BarChart data={metricData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="metric"/><YAxis domain={[0, 100]} label={{ value: 'Performance (%)', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/><ModelBars/></BarChart></ResponsiveContainer></div>
    </Figure>

    <Figure number={16} title="Supervisor Assignment Models — Confusion-Matrix Counts" caption="True positives, true negatives, false positives and false negatives at each model’s F1-optimised assignment threshold." className="lg:col-span-2">
      <div className="h-96"><ResponsiveContainer width="100%" height="100%"><BarChart data={confusionData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="model"/><YAxis label={{ value: 'Annotation count', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/><Bar dataKey="TP" fill="#16a34a"/><Bar dataKey="TN" fill="#2563eb"/><Bar dataKey="FP" fill="#dc2626"/><Bar dataKey="FN" fill="#d97706"/></BarChart></ResponsiveContainer></div>
    </Figure>

    <Figure number={17} title="Supervisor Assignment Models — Decision Threshold and MCC" caption="Model-specific F1-optimised threshold compared with Matthews correlation coefficient on a common percentage scale.">
      <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={thresholdData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="model"/><YAxis domain={[0, 100]} label={{ value: 'Percentage / MCC × 100', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/><Bar dataKey="Decision threshold" fill="#7c3aed"/><Bar dataKey="MCC × 100" fill="#0891b2"/></BarChart></ResponsiveContainer></div>
    </Figure>

    <Figure number={18} title="Supervisor Assignment Models — Evaluation Class Balance" caption="Relevant versus not-relevant submitted annotations used to evaluate each assignment model.">
      <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={classBalanceData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="model"/><YAxis label={{ value: 'Annotation count', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/><Bar dataKey="Relevant" stackId="classes" fill="#16a34a"/><Bar dataKey="Not relevant" stackId="classes" fill="#94a3b8"/></BarChart></ResponsiveContainer></div>
    </Figure>

    <Card className="lg:col-span-2">
      <h2 className="text-lg font-semibold">Supervisor Assignment Models — Complete Classification Measurements</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Model</th><th className="p-3">Labels</th><th className="p-3">Threshold</th><th className="p-3">Accuracy</th><th className="p-3">Precision</th><th className="p-3">Recall</th><th className="p-3">F1</th><th className="p-3">MCC</th><th className="p-3">TP</th><th className="p-3">TN</th><th className="p-3">FP</th><th className="p-3">FN</th></tr></thead><tbody>{rows.map(row => <tr key={row.model} className="border-b dark:border-slate-700"><td className="p-3 font-semibold">{row.modelLabel}</td><td className="p-3">{row.sampleSize.toLocaleString()}</td><td className="p-3">{percentage(row.threshold)}</td><td className="p-3">{percentage(row.accuracy)}</td><td className="p-3">{percentage(row.precision)}</td><td className="p-3">{percentage(row.recall)}</td><td className="p-3">{percentage(row.f1)}</td><td className="p-3">{decimal(row.mcc)}</td><td className="p-3">{row.tp}</td><td className="p-3">{row.tn}</td><td className="p-3">{row.fp}</td><td className="p-3">{row.fn}</td></tr>)}</tbody></table></div>
    </Card>
  </>;
};

export const ResearchVisualizations = ({ analytics, overview }: { analytics: any; overview: any }) => {
  const disagreementData = useMemo(() => (analytics?.disagreements || []).slice(0, 10).map((row: any, index: number) => ({
    pair: `Pair ${index + 1}`,
    difference: row.maximumDifference,
    projects: `${row.firstProjectTitle} ↔ ${row.secondProjectTitle}`
  })), [analytics]);
  const supervisorChartData = (analytics?.supervisorModelSummary || []).map((row: any) => ({
    model: row.modelLabel,
    'Semantic score': row.averageSemanticScore,
    'Workload-adjusted score': row.averageAdjustedScore
  }));

  if (!analytics) return <Card><p className="text-slate-500">Loading the persisted research measurements…</p></Card>;

  return <div className="grid gap-6 lg:grid-cols-2">
    <Card className="lg:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300"><CheckCircle2 size={20}/><span className="font-semibold">Live research analytics</span></div>
          <p className="mt-2 max-w-4xl text-sm text-slate-600 dark:text-slate-300">{analytics.dataBoundary}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
          <div className="rounded-xl bg-slate-100 px-4 py-3 dark:bg-slate-900"><Database className="mx-auto mb-1 text-blue-600" size={18}/><strong>{analytics.counts?.persistedPairScores?.toLocaleString()}</strong><p className="text-xs text-slate-500">model scores</p></div>
          <div className="rounded-xl bg-slate-100 px-4 py-3 dark:bg-slate-900"><Gauge className="mx-auto mb-1 text-teal-600" size={18}/><strong>{analytics.counts?.completeProjectPairs?.toLocaleString()}</strong><p className="text-xs text-slate-500">complete pairs</p></div>
          <div className="rounded-xl bg-slate-100 px-4 py-3 dark:bg-slate-900"><ClipboardCheck className="mx-auto mb-1 text-amber-600" size={18}/><strong>{analytics.evaluation?.sampleSize || 0}</strong><p className="text-xs text-slate-500">human labels</p></div>
          <div className="rounded-xl bg-slate-100 px-4 py-3 dark:bg-slate-900"><CheckCircle2 className="mx-auto mb-1 text-violet-600" size={18}/><strong>{analytics.counts?.assignments || 0}</strong><p className="text-xs text-slate-500">assignments</p></div>
        </div>
      </div>
    </Card>

    <Figure number={1} title="Similarity Models — Score Distribution" caption="Distribution of all 3,003 recorded project-pair scores per similarity model.">
      <div className="h-80"><ResponsiveContainer width="100%" height="100%"><LineChart data={analytics.scoreDistribution || []}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="range" label={{ value: 'Similarity score (%)', position: 'insideBottom', offset: -4 }}/><YAxis label={{ value: 'Pair count', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/>{MODEL_ORDER.map(model => <Line key={model} type="monotone" dataKey={model} name={MODEL_NAMES[model]} stroke={MODEL_COLOURS[model]} strokeWidth={3}/>)}</LineChart></ResponsiveContainer></div>
    </Figure>

    <Figure number={2} title="Similarity Models — Risk Distribution" caption="Low, medium and high similarity-risk counts using the configured 40% and 70% boundaries.">
      <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.riskDistribution || []}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="risk"/><YAxis label={{ value: 'Pair count', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/><ModelBars/></BarChart></ResponsiveContainer></div>
    </Figure>

    <Figure number={3} title="Similarity Models — Field-Level Contribution" caption="Mean similarity score for the six faculty-approved project fields." className="lg:col-span-2">
      <div className="h-96"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.fieldAverages || []}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="fieldLabel"/><YAxis domain={[0, 100]} label={{ value: 'Average similarity (%)', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/><ModelBars/></BarChart></ResponsiveContainer></div>
    </Figure>

    <Figure number={4} title="Similarity Models — Measured Latency" caption="Average inference time from every stored similarity project-pair comparison.">
      <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.latency || []}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="modelLabel"/><YAxis label={{ value: 'Milliseconds', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/><Bar dataKey="minimumMs" name="Minimum" fill="#94a3b8"/><Bar dataKey="medianMs" name="Median" fill="#0f766e"/><Bar dataKey="averageMs" name="Average" fill="#2563eb"/><Bar dataKey="maximumMs" name="Maximum" fill="#d97706"/></BarChart></ResponsiveContainer></div>
    </Figure>

    <Figure number={5} title="Similarity Models — Score Correlation" caption="Pearson correlation across identical recorded similarity project pairs.">
      <div className="overflow-x-auto"><table className="w-full text-center text-sm"><thead><tr><th className="p-3 text-left">Model</th>{MODEL_ORDER.map(model => <th key={model} className="p-3">{MODEL_NAMES[model]}</th>)}</tr></thead><tbody>{(analytics.correlations || []).map((row: any) => <tr key={row.model} className="border-t dark:border-slate-700"><th className="p-3 text-left">{row.modelLabel}</th>{MODEL_ORDER.map(model => {
        const value = row[model];
        const opacity = value == null ? 0.08 : Math.max(0.12, Math.abs(Number(value)));
        return <td key={model} className="p-3"><span className="block rounded-lg p-4 font-bold text-white" style={{ backgroundColor: `rgba(37, 99, 235, ${opacity})` }}>{decimal(value)}</span></td>;
      })}</tr>)}</tbody></table></div>
    </Figure>

    <Card className="lg:col-span-2">
      <h2 className="text-lg font-semibold">Similarity Models — Descriptive Statistics and 95% Confidence Intervals</h2>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Model</th><th className="p-3">Records</th><th className="p-3">Mean</th><th className="p-3">Median</th><th className="p-3">Minimum</th><th className="p-3">Maximum</th><th className="p-3">SD</th><th className="p-3">Variance</th><th className="p-3">Range</th><th className="p-3">95% CI</th><th className="p-3">Throughput</th></tr></thead><tbody>{(analytics.descriptive || []).map((row: any) => {
        const performance = (analytics.latency || []).find((item: any) => item.model === row.model);
        return <tr key={row.model} className="border-b dark:border-slate-700"><td className="p-3 font-semibold">{row.modelLabel}</td><td className="p-3">{row.records.toLocaleString()}</td><td className="p-3">{percentage(row.mean)}</td><td className="p-3">{percentage(row.median)}</td><td className="p-3">{percentage(row.minimum)}</td><td className="p-3">{percentage(row.maximum)}</td><td className="p-3">{decimal(row.standardDeviation)}</td><td className="p-3">{decimal(row.variance)}</td><td className="p-3">{decimal(row.range)}</td><td className="p-3">{percentage(row.confidenceIntervalLow)}–{percentage(row.confidenceIntervalHigh)}</td><td className="p-3">{decimal(performance?.comparisonsPerSecond, 2)}/s</td></tr>;
      })}</tbody></table></div>
    </Card>

    <Figure number={6} title="Similarity Models — Largest Disagreements" caption="Top ten recorded similarity pairs ranked by the maximum difference between the three models.">
      <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={disagreementData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="pair"/><YAxis domain={[0, 100]} label={{ value: 'Maximum difference (points)', angle: -90, position: 'insideLeft' }}/><Tooltip formatter={(value: any, _name: any, item: any) => [`${Number(value).toFixed(2)} points`, item?.payload?.projects]}/><Bar dataKey="difference" name="Maximum difference" fill="#dc2626"/></BarChart></ResponsiveContainer></div>
    </Figure>

    <Figure number={7} title="Supervisor Assignment Models — Matching Scores" caption="Mean semantic and workload-adjusted scores across all 1,560 project-supervisor evaluations per model.">
      <div className="h-80"><ResponsiveContainer width="100%" height="100%"><BarChart data={supervisorChartData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="model"/><YAxis domain={[0, 100]} label={{ value: 'Matching score (%)', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/><Bar dataKey="Semantic score" fill="#2563eb"/><Bar dataKey="Workload-adjusted score" fill="#0f766e"/></BarChart></ResponsiveContainer></div>
    </Figure>

    <Figure number={8} title="Supervisor Assignment — Workload and Capacity" caption="Final project allocations for all 20 recorded supervisors." className="lg:col-span-2">
      <div className="h-96"><ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.workload || []}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="supervisorCode"/><YAxis label={{ value: 'Projects', angle: -90, position: 'insideLeft' }}/><Tooltip/><Legend/><Bar dataKey="assignedProjects" name="Assigned projects" fill="#7c3aed"/><Bar dataKey="maximumCapacity" name="Maximum capacity" fill="#cbd5e1"/></BarChart></ResponsiveContainer></div>
    </Figure>

    <Figure number={9} title="Similarity Models — Processing Summary" caption="Similarity-model minimum, maximum, median, standard deviation, throughput and device are shown for reproducibility." className="lg:col-span-2">
      <div className="overflow-x-auto"><table className="w-full min-w-[950px] text-left text-sm"><thead><tr className="border-b text-slate-500"><th className="p-3">Model</th><th className="p-3">Average</th><th className="p-3">Minimum</th><th className="p-3">Maximum</th><th className="p-3">Median</th><th className="p-3">SD</th><th className="p-3">Comparisons/second</th><th className="p-3">Device</th></tr></thead><tbody>{(analytics.latency || []).map((row: any) => <tr key={row.model} className="border-b dark:border-slate-700"><td className="p-3 font-semibold">{row.modelLabel}</td><td className="p-3">{decimal(row.averageMs)} ms</td><td className="p-3">{decimal(row.minimumMs)} ms</td><td className="p-3">{decimal(row.maximumMs)} ms</td><td className="p-3">{decimal(row.medianMs)} ms</td><td className="p-3">{decimal(row.standardDeviationMs)} ms</td><td className="p-3">{decimal(row.comparisonsPerSecond)}</td><td className="p-3">{row.device}</td></tr>)}</tbody></table></div>
    </Figure>

    {analytics.evaluation?.results
      ? <EvaluationResults analytics={analytics}/>
      : <AwaitingLabels analytics={analytics}/>}

    <SupervisorEvaluationResults analytics={analytics}/>

    <Card className="lg:col-span-2">
      <p className="text-sm text-slate-600 dark:text-slate-300"><strong>Research interpretation:</strong> Higher average similarity is not evidence of better accuracy. Metrics begin after one authorised human label and remain preliminary until the labelled sample and reviewer agreement are sufficient. Synthetic construction targets remain excluded from human-validated accuracy claims.</p>
      <p className="mt-2 text-xs text-slate-500">Dashboard generated from {overview?.counts?.pairScores?.toLocaleString() || 0} persisted project-model records at {analytics.generatedAt ? new Date(analytics.generatedAt).toLocaleString() : 'the latest refresh'}.</p>
    </Card>
  </div>;
};

export default ResearchVisualizations;
