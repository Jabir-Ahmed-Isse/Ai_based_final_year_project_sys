param([string]$OutputDirectory = "outputs/journal-package-20260724/references")

$ErrorActionPreference = "Stop"
$queries = @(
  @{category="Capstone and final-year project management"; q="capstone project higher education"},
  @{category="Academic and doctoral supervision"; q="academic supervision postgraduate students"},
  @{category="Supervisor recommendation"; q="thesis supervisor recommendation"},
  @{category="Reviewer and expert assignment"; q="reviewer assignment expert matching"},
  @{category="Workload-aware fair allocation"; q="student supervisor assignment workload optimization"},
  @{category="Educational recommender systems"; q="educational recommender systems higher education"},
  @{category="Artificial intelligence in higher education"; q="artificial intelligence higher education responsible"},
  @{category="Semantic textual similarity"; q="semantic textual similarity document"},
  @{category="Plagiarism and originality detection"; q="academic plagiarism semantic similarity detection"},
  @{category="TF-IDF and cosine similarity"; q="TF-IDF cosine similarity text"},
  @{category="BERT and contextual language models"; q="BERT natural language processing review"},
  @{category="Sentence-BERT and sentence embeddings"; q="Sentence-BERT sentence embeddings"},
  @{category="Dense, sparse, and hybrid retrieval"; q="dense sparse hybrid information retrieval"},
  @{category="Multilingual and long-document embeddings"; q="multilingual document embeddings retrieval"},
  @{category="Ranking metrics and evaluation"; q="NDCG MRR MAP ranking evaluation"},
  @{category="Explainable recommendation"; q="explainable recommender systems survey"},
  @{category="Algorithmic fairness and human oversight"; q="algorithmic fairness human in the loop artificial intelligence"}
)

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$items = [System.Collections.Generic.List[object]]::new()
foreach ($entry in $queries) {
  $q = [uri]::EscapeDataString($entry.q)
  $uri = "https://api.crossref.org/works?query.bibliographic=$q&filter=from-pub-date:2020-01-01,until-pub-date:2026-12-31&rows=30"
  $response = Invoke-RestMethod -Headers @{"User-Agent"="CodexResearch/1.0 (mailto:research@example.invalid)"} -Uri $uri
  foreach ($work in $response.message.items) {
    if (-not $work.DOI -or $work.type -notin @("journal-article","proceedings-article","book-chapter","book")) { continue }
    $title = [string]$work.title[0]
    if (-not $title -or $title -match '^(Figure|Table|Chapter\s+\d+$|Editorial$|Contents$|Erratum|Correction|Retraction)') { continue }
    $authors = @($work.author | Select-Object -First 10 | ForEach-Object {
      (([string]$_.given).Trim() + " " + ([string]$_.family).Trim()).Trim()
    }) -join "; "
    $year = $null
    if ($work.published.'date-parts') { $year = $work.published.'date-parts'[0][0] }
    $items.Add([pscustomobject]@{
      category=$entry.category
      doi=([string]$work.DOI).ToLowerInvariant()
      title=$title
      authors=$authors
      year=$year
      source=[string]$work.'container-title'[0]
      publisher=[string]$work.publisher
      type=[string]$work.type
      volume=[string]$work.volume
      issue=[string]$work.issue
      pages=[string]$work.page
      landing_page="https://doi.org/$($work.DOI)"
      verified_on=(Get-Date).ToString("yyyy-MM-dd")
      verification_source="Crossref registered DOI metadata"
    })
  }
}

$deduped = @($items |
  Group-Object doi |
  ForEach-Object { $_.Group | Select-Object -First 1 })
$balanced = [System.Collections.Generic.List[object]]::new()
foreach ($group in ($deduped | Group-Object category | Sort-Object Name)) {
  foreach ($row in ($group.Group | Sort-Object @{Expression="year";Descending=$true}, title | Select-Object -First 10)) {
    $balanced.Add($row)
  }
}
$unique = @($balanced | Sort-Object category, @{Expression="year";Descending=$true}, title)

$csvPath = Join-Path $OutputDirectory "reference-verification-matrix.csv"
$jsonPath = Join-Path $OutputDirectory "reference-verification-matrix.json"
$mdPath = Join-Path $OutputDirectory "verified-reference-library.md"
$unique | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $csvPath
$unique | ConvertTo-Json -Depth 5 | Out-File -Encoding utf8 -FilePath $jsonPath

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# Verified scholarly reference library")
$lines.Add("")
$lines.Add("The following DOI metadata was retrieved from Crossref on $((Get-Date).ToString('yyyy-MM-dd')). Entries were deduplicated by DOI and limited to journal articles, proceedings papers, books, and chapters published from 2020 through 2026.")
$lines.Add("")
$i=1
foreach ($r in $unique) {
  $vol = if ($r.volume) { ", vol. $($r.volume)" } else { "" }
  $issue = if ($r.issue) { ", no. $($r.issue)" } else { "" }
  $pages = if ($r.pages) { ", pp. $($r.pages)" } else { "" }
  $lines.Add("[$i] $($r.authors), `"$($r.title),`" *$($r.source)*$vol$issue$pages, $($r.year), doi: [$($r.doi)](https://doi.org/$($r.doi)).")
  $i++
}
$lines | Out-File -Encoding utf8 -FilePath $mdPath

[pscustomobject]@{
  count=$unique.Count
  csv=(Resolve-Path $csvPath).Path
  json=(Resolve-Path $jsonPath).Path
  markdown=(Resolve-Path $mdPath).Path
} | ConvertTo-Json
