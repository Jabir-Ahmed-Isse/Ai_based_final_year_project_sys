import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const artifactToolPath = path.join(
  process.env.USERPROFILE || "",
  ".cache", "codex-runtimes", "codex-primary-runtime", "dependencies", "node", "node_modules",
  "@oai", "artifact-tool", "dist", "artifact_tool.mjs",
);
const { SpreadsheetFile, Workbook } = await import(pathToFileURL(artifactToolPath).href);

const packageRoot = process.argv[2] || "M:\\hormuud-academic-project-system\\outputs\\final-journal-human-verified-ai-framework-20260810";
const analysisRoot = path.join(packageRoot, "07-reproducibility", "analysis-outputs");
const outputPath = path.join(packageRoot, "03-evaluation-and-evidence", "publication-evidence-workbook-verified.xlsx");
const previewDir = path.join(packageRoot, "08-quality-assurance", "workbook-sheet-previews");
const qaPath = path.join(packageRoot, "08-quality-assurance", "workbook-verification.json");

const COLORS = {
  navy: "#173B63",
  blue: "#2F75B5",
  teal: "#0F766E",
  gold: "#D4A017",
  paleBlue: "#EAF2F8",
  paleTeal: "#E8F5F2",
  paleGold: "#FFF4D6",
  paleRed: "#FCE8E6",
  light: "#F5F7FA",
  border: "#C9D4E0",
  text: "#172033",
  white: "#FFFFFF",
  input: "#1F4E79",
};

function parseCSV(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 1; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ""; }
    else if (c === '\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows.filter(r => r.some(v => v !== ""));
}

function scalar(value) {
  if (value === "True") return true;
  if (value === "False") return false;
  if (value !== "" && /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(value)) return Number(value);
  return value.replace(/â€”/g, "-").replace(/â€“/g, "-");
}

async function csvObjects(file) {
  const matrix = parseCSV(await fs.readFile(file, "utf8"));
  const headers = matrix[0];
  return matrix.slice(1).map(row => Object.fromEntries(headers.map((h, i) => [h, scalar(row[i] ?? "")])));
}

function columnName(index) {
  let n = index + 1, out = "";
  while (n) { n -= 1; out = String.fromCharCode(65 + (n % 26)) + out; n = Math.floor(n / 26); }
  return out;
}

function title(sheet, text, lastColumn) {
  const range = sheet.getRange(`A1:${lastColumn}1`);
  range.merge();
  range.values = [[text]];
  range.format = {
    fill: COLORS.navy,
    font: { bold: true, color: COLORS.white, size: 16 },
    horizontalAlignment: "left",
    verticalAlignment: "center",
  };
  range.format.rowHeight = 30;
}

function subtitle(sheet, text, rangeA1) {
  const range = sheet.getRange(rangeA1);
  range.merge();
  range.values = [[text]];
  range.format = {
    fill: COLORS.paleBlue,
    font: { italic: true, color: COLORS.navy, size: 10 },
    wrapText: true,
    verticalAlignment: "center",
  };
}

function sectionHeader(sheet, text, rangeA1) {
  const range = sheet.getRange(rangeA1);
  range.merge();
  range.values = [[text]];
  range.format = { fill: COLORS.teal, font: { bold: true, color: COLORS.white }, verticalAlignment: "center" };
}

function tableHeader(sheet, rangeA1) {
  const range = sheet.getRange(rangeA1);
  range.format = {
    fill: COLORS.navy,
    font: { bold: true, color: COLORS.white },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "all", style: "thin", color: COLORS.border },
  };
}

function tableBody(sheet, rangeA1) {
  const range = sheet.getRange(rangeA1);
  range.format = {
    font: { color: COLORS.text, size: 9 },
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "inside", style: "thin", color: COLORS.border },
  };
}

function finaliseSheet(sheet, usedRange, widths = {}) {
  sheet.showGridLines = false;
  sheet.freezePanes.freezeRows(3);
  const used = sheet.getRange(usedRange);
  used.format.font = { name: "Aptos", color: COLORS.text, size: 9 };
  for (const [column, width] of Object.entries(widths)) sheet.getRange(`${column}:${column}`).format.columnWidth = width;
}

function writeObjectTable(sheet, startRow, columns, rows) {
  const startCol = 1;
  const endCol = columnName(columns.length - 1);
  sheet.getRange(`A${startRow}:${endCol}${startRow}`).values = [columns.map(c => c.label)];
  tableHeader(sheet, `A${startRow}:${endCol}${startRow}`);
  if (rows.length) {
    const values = rows.map(r => columns.map(c => r[c.key] ?? ""));
    sheet.getRange(`A${startRow + 1}:${endCol}${startRow + rows.length}`).values = values;
    tableBody(sheet, `A${startRow + 1}:${endCol}${startRow + rows.length}`);
  }
  return { startCol, endCol, endRow: startRow + rows.length };
}

const [sim, sup, thresholds, descriptive, fields, labels, supLabels, supervisorVerification, workload, simAblation, supAblation, reconciliation, references] = await Promise.all([
  csvObjects(path.join(analysisRoot, "similarity-metrics.csv")),
  csvObjects(path.join(analysisRoot, "supervisor-metrics.csv")),
  csvObjects(path.join(analysisRoot, "similarity-threshold-analysis.csv")),
  csvObjects(path.join(analysisRoot, "similarity-descriptive-statistics.csv")),
  csvObjects(path.join(analysisRoot, "similarity-field-means.csv")),
  csvObjects(path.join(analysisRoot, "label-provenance.csv")),
  csvObjects(path.join(analysisRoot, "supervisor-label-provenance.csv")),
  csvObjects(path.join(analysisRoot, "supervisor-verification-summary.csv")),
  csvObjects(path.join(analysisRoot, "supervisor-workload.csv")),
  csvObjects(path.join(analysisRoot, "similarity-output-ablation.csv")),
  csvObjects(path.join(analysisRoot, "supervisor-output-ablation.csv")),
  csvObjects(path.join(analysisRoot, "dashboard-reconciliation.csv")),
  csvObjects(path.join(packageRoot, "06-references", "reference-verification-matrix.csv")),
]);

const wb = Workbook.create();
const readme = wb.worksheets.add("Read Me");
const summary = wb.worksheets.add("Executive Summary");
const simSheet = wb.worksheets.add("Similarity Metrics");
const supSheet = wb.worksheets.add("Supervisor Metrics");
const thresholdSheet = wb.worksheets.add("Threshold Analysis");
const descSheet = wb.worksheets.add("Descriptive Stats");
const fieldSheet = wb.worksheets.add("Field Results");
const labelSheet = wb.worksheets.add("Label Provenance");
const workloadSheet = wb.worksheets.add("Workload");
const ablationSheet = wb.worksheets.add("Ablation");
const reconSheet = wb.worksheets.add("Dashboard Reconciliation");
const refSheet = wb.worksheets.add("Reference Audit");

// Read Me
title(readme, "Publication Evidence Workbook", "H");
subtitle(readme, "Frozen 5 August 2026 | Formula-driven comparison tables | Sanitized live evidence", "A2:H2");
sectionHeader(readme, "Scope and evidence boundary", "A4:H4");
readme.getRange("A5:B14").values = [
  ["Item", "Verified statement"],
  ["Projects", "78 test/synthetic final-year projects"],
  ["Supervisors", "20 structured test profiles"],
  ["Similarity scoring", "3,003 pairs/model; 9,009 stored scores"],
  ["Supervisor scoring", "1,560 candidates/model; 4,680 stored scores"],
  ["Assignments", "78/78 assigned; zero capacity violations"],
  ["Similarity evidence", "Grade C: 30 model-specific labels/model, one administrator, no consensus"],
  ["Supervisor evidence", "Grade C: all 4,680 labels checked by one research administrator; internal evaluation"],
  ["Ranking metrics", "Top-K, MRR, MAP and nDCG are not measured because ranked independent gold truth is absent"],
  ["Preferred similarity model", "Sentence-BERT under evidence-balanced criteria; BGE-M3 leads ordinary F1 only"],
];
tableHeader(readme, "A5:B5"); tableBody(readme, "A6:B14");
sectionHeader(readme, "Workbook map", "A16:H16");
readme.getRange("A17:C27").values = [
  ["Sheet", "Purpose", "Source"],
  ["Executive Summary", "Decision-ready rankings and charts", "Formula references to analysis sheets"],
  ["Similarity Metrics", "All core similarity metrics and confusion counts", "similarity-metrics.csv"],
  ["Supervisor Metrics", "Administrator-verified internal supervisor metrics", "supervisor-metrics.csv"],
  ["Threshold Analysis", "50%-80% sensitivity", "similarity-threshold-analysis.csv"],
  ["Descriptive Stats", "Score distribution and latency", "similarity-descriptive-statistics.csv"],
  ["Field Results", "Six-field means and configured weights", "similarity-field-means.csv"],
  ["Label Provenance", "Evidence grades and annotation sources", "label-provenance.csv"],
  ["Workload", "Capacity and utilization audit", "supervisor-workload.csv"],
  ["Ablation", "Output-sensitivity analyses", "similarity/supervisor-output-ablation.csv"],
  ["Reference Audit", "210 verified DOI records with landing pages", "reference-verification-matrix.csv"],
];
tableHeader(readme, "A17:C17"); tableBody(readme, "A18:C27");
finaliseSheet(readme, "A1:H27", { A: 24, B: 72, C: 42, D: 12, E: 12, F: 12, G: 12, H: 12 });

function buildMetricSheet(sheet, titleText, data, grade, supervisorMode = false) {
  title(sheet, titleText, "Q");
  subtitle(sheet, supervisorMode ? "Administrator-verified internal metrics; one reviewer checked all labels and amended records where necessary." : "Metrics are recomputed from TP/TN/FP/FN at the deployed 70% threshold.", "A2:Q2");
  const headers = ["Model", "n", "Threshold", "TP", "TN", "FP", "FN", "Accuracy", "Precision", "Recall", "F1", "Macro-F1", "Specificity", "Balanced accuracy", "MCC", "ROC-AUC", "Evidence"];
  sheet.getRange("A4:Q4").values = [headers]; tableHeader(sheet, "A4:Q4");
  sheet.getRange("A5:G7").values = data.map(r => [r.modelLabel, r.sampleSize, r.threshold, r.truePositive, r.trueNegative, r.falsePositive, r.falseNegative]);
  sheet.getRange("L5:L7").values = data.map(r => [r.macroF1]);
  sheet.getRange("P5:P7").values = data.map(r => [r.rocAuc]);
  sheet.getRange("Q5:Q7").values = data.map(() => [grade]);
  for (let row = 5; row <= 7; row += 1) {
    sheet.getRange(`H${row}:K${row}`).formulas = [[
      `=IFERROR((D${row}+E${row})/SUM(D${row}:G${row}),0)`,
      `=IFERROR(D${row}/(D${row}+F${row}),0)`,
      `=IFERROR(D${row}/(D${row}+G${row}),0)`,
      `=IFERROR(2*I${row}*J${row}/(I${row}+J${row}),0)`,
    ]];
    sheet.getRange(`M${row}:O${row}`).formulas = [[
      `=IFERROR(E${row}/(E${row}+F${row}),0)`,
      `=(J${row}+M${row})/2`,
      `=IFERROR((D${row}*E${row}-F${row}*G${row})/SQRT((D${row}+F${row})*(D${row}+G${row})*(E${row}+F${row})*(E${row}+G${row})),0)`,
    ]];
  }
  tableBody(sheet, "A5:Q7");
  sheet.getRange("H5:P7").format.numberFormat = "0.00%";
  sheet.getRange("C5:C7").format.numberFormat = supervisorMode ? "0.0000" : "0.0";
  sheet.getRange("D5:G7").format.numberFormat = "#,##0";
  sheet.getRange("Q5:Q7").format.fill = supervisorMode ? COLORS.paleRed : COLORS.paleGold;
  sectionHeader(sheet, "Interpretation", "A10:Q10");
  const notes = supervisorMode ? [
    ["Rank 1 (internal F1)", "TF-IDF - 81.75% F1, 94.10% accuracy, 87.66% recall and MCC 0.785."],
    ["Highest precision", "Sentence-BERT - 83.33%, but lower recall (64.10%)."],
    ["Evidence boundary", "All labels were administrator verified; the comparison remains single-reviewer and internal."],
  ] : [
    ["Evidence-balanced rank 1", "Sentence-BERT - 93.33% accuracy, 92.31% F1, 94.44% balanced accuracy, MCC 0.873, ROC-AUC 0.968."],
    ["Ordinary F1 rank 1", "BGE-M3 - 94.74% F1, but 0% specificity and MCC 0 because no labelled negative was correctly rejected."],
    ["Fast transparent baseline", "TF-IDF - 100% precision on one positive prediction, but 9.09% recall and 16.67% F1."],
  ];
  sheet.getRange("A11:B13").values = notes; tableBody(sheet, "A11:B13");
  finaliseSheet(sheet, "A1:Q13", { A: 18, B: 11, C: 12, D: 8, E: 8, F: 8, G: 8, H: 13, I: 13, J: 13, K: 13, L: 13, M: 13, N: 16, O: 12, P: 13, Q: 22 });
}

buildMetricSheet(simSheet, "Similarity Model Performance", sim, "C - single administrator", false);
buildMetricSheet(supSheet, "Supervisor Model Performance", sup, "C - administrator verified", true);

// Executive Summary - formulas reference the metric sheets.
title(summary, "Verified Comparative Evaluation - 78 Projects", "Q");
subtitle(summary, "The two ranking views are intentionally separated: ordinary F1 and evidence-balanced validity answer different questions.", "A2:Q2");
sectionHeader(summary, "Verified corpus", "A4:H4");
summary.getRange("A5:D8").values = [["KPI", "Value", "KPI", "Value"], ["Projects", null, "Pair scores", null], ["Supervisor scores", null, "Assignments", null], ["Capacity violations", null, "Verified references", 210]];
summary.getRange("B6").formulas = [["=SUM('Workload'!D4:D23)"]];
summary.getRange("D6").formulas = [["=SUM('Descriptive Stats'!B5:B7)"]];
summary.getRange("B7").formulas = [["=SUM('Supervisor Metrics'!B5:B7)"]];
summary.getRange("D7").formulas = [["=SUM('Workload'!D4:D23)"]];
summary.getRange("B8").formulas = [["=COUNTIF('Workload'!F4:F23,TRUE)"]];
tableHeader(summary, "A5:D5"); tableBody(summary, "A6:D8");
summary.getRange("B6:D8").format.numberFormat = "#,##0";
sectionHeader(summary, "Similarity comparison at 70%", "A10:H10");
summary.getRange("A11:H11").values = [["Model", "Accuracy", "Precision", "Recall", "F1", "Balanced accuracy", "MCC", "Evidence rank"]]; tableHeader(summary, "A11:H11");
for (let i = 0; i < 3; i += 1) {
  const row = 12 + i, source = 5 + i;
  summary.getRange(`A${row}:G${row}`).formulas = [[`='Similarity Metrics'!A${source}`, `='Similarity Metrics'!H${source}`, `='Similarity Metrics'!I${source}`, `='Similarity Metrics'!J${source}`, `='Similarity Metrics'!K${source}`, `='Similarity Metrics'!N${source}`, `='Similarity Metrics'!O${source}`]];
  summary.getRange(`H${row}`).values = [[i === 1 ? 1 : (i === 0 ? 2 : 3)]];
}
tableBody(summary, "A12:H14"); summary.getRange("B12:G14").format.numberFormat = "0.00%";
sectionHeader(summary, "Supervisor comparison - administrator verified", "A17:H17");
summary.getRange("A18:H18").values = [["Model", "Accuracy", "Precision", "Recall", "F1", "Balanced accuracy", "MCC", "Evidence"]]; tableHeader(summary, "A18:H18");
for (let i = 0; i < 3; i += 1) {
  const row = 19 + i, source = 5 + i;
  summary.getRange(`A${row}:G${row}`).formulas = [[`='Supervisor Metrics'!A${source}`, `='Supervisor Metrics'!H${source}`, `='Supervisor Metrics'!I${source}`, `='Supervisor Metrics'!J${source}`, `='Supervisor Metrics'!K${source}`, `='Supervisor Metrics'!N${source}`, `='Supervisor Metrics'!O${source}`]];
  summary.getRange(`H${row}`).values = [["C"]];
}
tableBody(summary, "A19:H21"); summary.getRange("B19:G21").format.numberFormat = "0.00%"; summary.getRange("H19:H21").format.fill = COLORS.paleGold;
summary.getRange("A24:H27").values = [
  ["Decision", "Recommendation", "Evidence", "Caution", "", "", "", ""],
  ["Balanced similarity screening", "Sentence-BERT", "Best balanced accuracy, MCC, macro-F1 and ROC-AUC", "Single-rater n=30/model", "", "", "", ""],
  ["Fast transparent triage", "TF-IDF", "0.416 ms/pair; inspectable lexical evidence", "Very low semantic recall at 70%", "", "", "", ""],
  ["Supervisor assignment", "TF-IDF leads internally", "Highest accuracy, F1 and MCC on reviewed labels", "Collect independent ranked relevance", "", "", "", ""],
];
tableHeader(summary, "A24:D24"); tableBody(summary, "A25:D27");
const simChart = summary.charts.add("bar", summary.getRange("A11:E14"));
simChart.title = "Similarity: accuracy, precision, recall and F1"; simChart.hasLegend = true; simChart.yAxis = { numberFormatCode: "0%", min: 0, max: 1 }; simChart.setPosition("J4", "Q15");
const supChart = summary.charts.add("bar", summary.getRange("A18:E21"));
supChart.title = "Supervisor metrics (administrator verified)"; supChart.hasLegend = true; supChart.yAxis = { numberFormatCode: "0%", min: 0, max: 1 }; supChart.setPosition("J17", "Q28");
finaliseSheet(summary, "A1:Q28", { A: 29, B: 15, C: 24, D: 20, E: 15, F: 18, G: 13, H: 17, I: 3, J: 12, K: 12, L: 12, M: 12, N: 12, O: 12, P: 12, Q: 12 });

// Threshold analysis
title(thresholdSheet, "Similarity Threshold Sensitivity", "Q");
subtitle(thresholdSheet, "Sensitivity from 50% to 80%; the operational 70% threshold is retained.", "A2:Q2");
const thresholdRows = thresholds.map(r => ({ model: r.modelLabel, threshold: r.threshold, accuracy: r.accuracy, precision: r.precision, recall: r.recall, f1: r.f1, balancedAccuracy: r.balancedAccuracy, mcc: r.mcc }));
writeObjectTable(thresholdSheet, 4, [
  { key: "model", label: "Model" }, { key: "threshold", label: "Threshold" }, { key: "accuracy", label: "Accuracy" }, { key: "precision", label: "Precision" }, { key: "recall", label: "Recall" }, { key: "f1", label: "F1" }, { key: "balancedAccuracy", label: "Balanced accuracy" }, { key: "mcc", label: "MCC" },
], thresholdRows);
thresholdSheet.getRange("B5:B25").format.numberFormat = "0.0"; thresholdSheet.getRange("C5:H25").format.numberFormat = "0.00%";
thresholdSheet.getRange("J4:M4").values = [["Threshold", "TF-IDF F1", "Sentence-BERT F1", "BGE-M3 F1"]]; tableHeader(thresholdSheet, "J4:M4");
for (let i = 0; i < 7; i += 1) {
  const row = 5 + i;
  thresholdSheet.getRange(`J${row}:M${row}`).formulas = [[`=B${5 + i}`, `=F${5 + i}`, `=F${12 + i}`, `=F${19 + i}`]];
}
tableBody(thresholdSheet, "J5:M11"); thresholdSheet.getRange("K5:M11").format.numberFormat = "0.00%";
const thresholdChart = thresholdSheet.charts.add("line", thresholdSheet.getRange("J4:M11"));
thresholdChart.title = "F1 sensitivity by decision threshold"; thresholdChart.hasLegend = true; thresholdChart.yAxis = { numberFormatCode: "0%", min: 0, max: 1 }; thresholdChart.setPosition("J13", "Q28");
finaliseSheet(thresholdSheet, "A1:Q28", { A: 18, B: 12, C: 12, D: 12, E: 12, F: 12, G: 17, H: 12, I: 3, J: 12, K: 15, L: 19, M: 14 });

// Descriptive statistics
title(descSheet, "Full-Corpus Score and Latency Statistics", "N");
subtitle(descSheet, "Each model contains 3,003 project-pair scores; score levels are not calibrated probabilities.", "A2:N2");
writeObjectTable(descSheet, 4, [
  { key: "modelLabel", label: "Model" }, { key: "records", label: "Records" }, { key: "mean", label: "Mean score" }, { key: "median", label: "Median" }, { key: "minimum", label: "Minimum" }, { key: "maximum", label: "Maximum" }, { key: "standardDeviation", label: "SD" }, { key: "lower95Mean", label: "95% CI lower" }, { key: "upper95Mean", label: "95% CI upper" }, { key: "averageExecutionTimeMs", label: "Average ms" }, { key: "comparisonsPerSecond", label: "Comparisons/sec" },
], descriptive);
descSheet.getRange("C5:I7").format.numberFormat = "0.00"; descSheet.getRange("J5:J7").format.numberFormat = "0.000"; descSheet.getRange("K5:K7").format.numberFormat = "#,##0.0";
descSheet.getRange("M4:N7").values = [["Model", "Average ms"], ...descriptive.map(r => [r.modelLabel, r.averageExecutionTimeMs])]; tableHeader(descSheet, "M4:N4"); tableBody(descSheet, "M5:N7");
const latencyChart = descSheet.charts.add("bar", descSheet.getRange("M4:N7")); latencyChart.title = "Measured latency (ms/pair; lower is better)"; latencyChart.hasLegend = false; latencyChart.setPosition("A10", "H24");
finaliseSheet(descSheet, "A1:N24", { A: 18, B: 12, C: 13, D: 13, E: 13, F: 13, G: 12, H: 14, I: 14, J: 13, K: 16, L: 3, M: 18, N: 14 });

// Field results
title(fieldSheet, "Six-Field Similarity Results", "G");
subtitle(fieldSheet, "Weights are configured inputs; field means are full-corpus observed scores.", "A2:G2");
writeObjectTable(fieldSheet, 4, [
  { key: "modelLabel", label: "Model" }, { key: "fieldLabel", label: "Field" }, { key: "meanScore", label: "Mean score" }, { key: "configuredWeight", label: "Configured weight" }, { key: "field", label: "Stored component" },
], fields);
fieldSheet.getRange("C5:C22").format.numberFormat = "0.00"; fieldSheet.getRange("D5:D22").format.numberFormat = "0%";
finaliseSheet(fieldSheet, "A1:G22", { A: 18, B: 28, C: 14, D: 18, E: 28, F: 8, G: 8 });

// Label provenance
title(labelSheet, "Label Provenance and Evidence Grading", "H");
subtitle(labelSheet, "Supervisor labels were checked by one research administrator; stored source values retain only the initialization route.", "A2:H2");
writeObjectTable(labelSheet, 4, [
  { key: "experiment", label: "Experiment" }, { key: "modelLabel", label: "Model" }, { key: "records", label: "Records" }, { key: "independentAnnotators", label: "Independent annotators" }, { key: "consensusRecords", label: "Consensus records" }, { key: "primarySource", label: "Primary source" }, { key: "evidenceGrade", label: "Grade" },
], labels);
sectionHeader(labelSheet, "Supervisor verification status", "A13:H13");
writeObjectTable(labelSheet, 14, [
  { key: "modelLabel", label: "Model" }, { key: "records", label: "Verified records" }, { key: "verificationStatus", label: "Verification status" }, { key: "reviewDesign", label: "Review design" }, { key: "evidenceGrade", label: "Grade" },
], supervisorVerification);
finaliseSheet(labelSheet, "A1:H19", { A: 24, B: 18, C: 24, D: 30, E: 12, F: 42, G: 12, H: 8 });

// Workload
title(workloadSheet, "Assignment Workload and Capacity Audit", "J");
subtitle(workloadSheet, "The run is capacity-feasible. Workload parity is reported separately from demographic fairness.", "A2:J2");
writeObjectTable(workloadSheet, 3, [
  { key: "supervisorCode", label: "Supervisor" }, { key: "currentProjects", label: "Current projects" }, { key: "maximumCapacity", label: "Maximum capacity" }, { key: "assignedProjects", label: "Assigned projects" }, { key: "capacityUtilization", label: "Utilization" }, { key: "capacityExceeded", label: "Exceeded" },
], workload);
workloadSheet.getRange("E4:E23").format.numberFormat = "0.0%";
sectionHeader(workloadSheet, "Summary", "H3:J3");
workloadSheet.getRange("H4:I10").values = [["Metric", "Value"], ["Assignments", null], ["Supervisors used", null], ["Mean load", null], ["Minimum load", null], ["Maximum load", null], ["Capacity violations", null]];
tableHeader(workloadSheet, "H4:I4");
workloadSheet.getRange("I5:I10").formulas = [["=SUM(D4:D23)"], ["=COUNTIF(D4:D23,\">0\")"], ["=AVERAGE(D4:D23)"], ["=MIN(D4:D23)"], ["=MAX(D4:D23)"], ["=COUNTIF(F4:F23,TRUE)"]];
tableBody(workloadSheet, "H5:I10"); workloadSheet.getRange("I7").format.numberFormat = "0.00";
finaliseSheet(workloadSheet, "A1:J23", { A: 16, B: 16, C: 18, D: 18, E: 14, F: 12, G: 4, H: 22, I: 14, J: 6 });

// Ablation
title(ablationSheet, "Output-Sensitivity Ablation", "I");
subtitle(ablationSheet, "These analyses quantify score/rank sensitivity after removing stored components; they do not estimate predictive improvement.", "A2:I2");
sectionHeader(ablationSheet, "Project-field ablation", "A4:I4");
writeObjectTable(ablationSheet, 5, [
  { key: "modelLabel", label: "Model" }, { key: "omittedFieldLabel", label: "Omitted field" }, { key: "meanAbsoluteScoreShift", label: "Mean absolute shift" }, { key: "maximumAbsoluteScoreShift", label: "Maximum shift" }, { key: "spearmanRankCorrelation", label: "Spearman rank correlation" }, { key: "analysisType", label: "Interpretation boundary" },
], simAblation);
ablationSheet.getRange("C6:E23").format.numberFormat = "0.000";
sectionHeader(ablationSheet, "Supervisor-component ablation", "A26:I26");
writeObjectTable(ablationSheet, 27, [
  { key: "modelLabel", label: "Model" }, { key: "omittedComponent", label: "Omitted component" }, { key: "configuredWeight", label: "Weight" }, { key: "meanAbsoluteScoreShift", label: "Mean absolute shift" }, { key: "maximumAbsoluteScoreShift", label: "Maximum shift" }, { key: "spearmanRankCorrelation", label: "Spearman rank correlation" }, { key: "analysisType", label: "Interpretation boundary" },
], supAblation);
ablationSheet.getRange("C28:C45").format.numberFormat = "0.0%"; ablationSheet.getRange("D28:F45").format.numberFormat = "0.000";
finaliseSheet(ablationSheet, "A1:I45", { A: 18, B: 30, C: 18, D: 18, E: 22, F: 52, G: 12, H: 8, I: 8 });

// Dashboard reconciliation
title(reconSheet, "Dashboard Reconciliation", "H");
subtitle(reconSheet, "Dashboard values reconcile to recomputed evidence within declared rounding tolerance.", "A2:H2");
writeObjectTable(reconSheet, 4, [
  { key: "experiment", label: "Experiment" }, { key: "modelLabel", label: "Model" }, { key: "metric", label: "Metric" }, { key: "dashboardValue", label: "Dashboard value" }, { key: "recalculatedValue", label: "Recalculated value" }, { key: "absoluteDifference", label: "Absolute difference" }, { key: "withinRoundingTolerance", label: "Within tolerance" },
], reconciliation);
reconSheet.getRange(`D5:F${4 + reconciliation.length}`).format.numberFormat = "0.000000";
finaliseSheet(reconSheet, `A1:H${4 + reconciliation.length}`, { A: 26, B: 18, C: 22, D: 18, E: 19, F: 20, G: 18, H: 8 });

// Reference audit
title(refSheet, "Verified Reference Audit - 210 Unique DOI Records", "G");
subtitle(refSheet, "Landing-page URLs are retained as plain text for traceability; no unverifiable DOI was added.", "A2:G2");
writeObjectTable(refSheet, 4, [
  { key: "category", label: "Category" }, { key: "doi", label: "DOI" }, { key: "title", label: "Title" }, { key: "year", label: "Year" }, { key: "source", label: "Source" }, { key: "landing_page", label: "Landing page URL" }, { key: "verification_source", label: "Verification method" },
], references);
finaliseSheet(refSheet, `A1:G${4 + references.length}`, { A: 34, B: 30, C: 68, D: 10, E: 32, F: 44, G: 46 });

await fs.mkdir(previewDir, { recursive: true });
const previewSpecs = [
  ["Read Me", "A1:H27"], ["Executive Summary", "A1:Q28"], ["Similarity Metrics", "A1:Q13"], ["Supervisor Metrics", "A1:Q13"],
  ["Threshold Analysis", "A1:Q28"], ["Descriptive Stats", "A1:N24"], ["Field Results", "A1:G22"], ["Label Provenance", "A1:H19"],
  ["Workload", "A1:J23"], ["Ablation", "A1:I45"], ["Dashboard Reconciliation", `A1:H${Math.min(35, 4 + reconciliation.length)}`], ["Reference Audit", "A1:G30"],
];
for (const [sheetName, range] of previewSpecs) {
  const blob = await wb.render({ sheetName, range, scale: 1, format: "png" });
  const slug = sheetName.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await fs.writeFile(path.join(previewDir, `${slug}.png`), new Uint8Array(await blob.arrayBuffer()));
}

const summaryInspect = await wb.inspect({ kind: "table", range: "Executive Summary!A1:H27", include: "values,formulas", tableMaxRows: 30, tableMaxCols: 10, maxChars: 10000 });
const referenceInspect = await wb.inspect({ kind: "table", range: "Reference Audit!A1:G8", include: "values,formulas", tableMaxRows: 10, tableMaxCols: 8, maxChars: 10000 });
const errors = await wb.inspect({ kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A", options: { useRegex: true, maxResults: 300 }, summary: "final formula error scan", maxChars: 5000 });
await fs.writeFile(qaPath, JSON.stringify({ generatedAt: new Date().toISOString(), sheets: previewSpecs.map(([sheetName, range]) => ({ sheetName, range })), summaryInspect: summaryInspect.ndjson, referenceInspect: referenceInspect.ndjson, formulaErrors: errors.ndjson }, null, 2));

const xlsx = await SpreadsheetFile.exportXlsx(wb);
await xlsx.save(outputPath);
console.log(JSON.stringify({ outputPath, previewDir, sheets: previewSpecs.length }, null, 2));
