param(
  [string]$OutputDirectory = "outputs/journal-package-20260724/references"
)

$ErrorActionPreference = "Stop"
$queries = @(
  @{ category="Final-year projects and supervision"; q="capstone supervision" },
  @{ category="Supervisor, expert, and reviewer assignment"; q="reviewer assignment" },
  @{ category="Workload-aware fair allocation"; q="fair allocation" },
  @{ category="Educational recommender systems and AI"; q="educational recommender" },
  @{ category="Text similarity and originality"; q="semantic similarity" },
  @{ category="Sparse retrieval"; q="sparse retrieval" },
  @{ category="BERT and sentence embeddings"; q="sentence BERT" },
  @{ category="Dense and hybrid retrieval"; q="dense retrieval" },
  @{ category="Multilingual and long-text embeddings"; q="multilingual embeddings" },
  @{ category="Ranking and recommender evaluation"; q="ranking evaluation" },
  @{ category="Explainability"; q="explainable recommendation" },
  @{ category="Responsible AI and fairness"; q="algorithmic fairness" }
)

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$all = [System.Collections.Generic.List[object]]::new()

foreach ($entry in $queries) {
  $encoded = [uri]::EscapeDataString($entry.q)
  $uri = "https://api.openalex.org/works?search=$encoded&per-page=30"
  $response = Invoke-RestMethod -Uri $uri
  foreach ($work in $response.results) {
    if ($work.is_retracted -or -not $work.doi -or $work.type -notin @("article","review","conference-paper","book","book-chapter")) { continue }
    $authors = @($work.authorships | Select-Object -First 8 | ForEach-Object { $_.author.display_name }) -join "; "
    $source = if ($work.primary_location.source.display_name) { $work.primary_location.source.display_name } else { $work.primary_location.raw_source_name }
    $all.Add([pscustomobject]@{
      category = $entry.category
      openalex_id = $work.id
      doi = ($work.doi -replace '^https://doi.org/','')
      title = $work.title
      authors = $authors
      year = $work.publication_year
      source = $source
      type = $work.type
      volume = $work.biblio.volume
      issue = $work.biblio.issue
      first_page = $work.biblio.first_page
      last_page = $work.biblio.last_page
      cited_by_count = $work.cited_by_count
      landing_page = $work.primary_location.landing_page_url
      is_open_access = $work.open_access.is_oa
      verified_on = (Get-Date).ToString("yyyy-MM-dd")
      verification_source = "OpenAlex scholarly metadata; DOI present; retraction flag false"
    })
  }
}

$unique = $all |
  Sort-Object @{Expression="cited_by_count";Descending=$true} |
  Group-Object doi |
  ForEach-Object { $_.Group | Select-Object -First 1 } |
  Sort-Object category, @{Expression="year";Descending=$true}, title |
  Select-Object -First 160

$csvPath = Join-Path $OutputDirectory "reference-verification-matrix.csv"
$jsonPath = Join-Path $OutputDirectory "reference-verification-matrix.json"
$mdPath = Join-Path $OutputDirectory "verified-reference-library.md"
$unique | Export-Csv -NoTypeInformation -Encoding UTF8 -Path $csvPath
$unique | ConvertTo-Json -Depth 6 | Set-Content -Encoding UTF8 -Path $jsonPath

$lines = [System.Collections.Generic.List[string]]::new()
$lines.Add("# Verified scholarly reference library")
$lines.Add("")
$lines.Add("Metadata retrieved from OpenAlex on $((Get-Date).ToString('yyyy-MM-dd')). All entries have a DOI, a false retraction flag, and a scholarly work type. Publisher landing pages should still be checked during journal submission copy-editing.")
$lines.Add("")
$i = 1
foreach ($r in $unique) {
  $pages = if ($r.first_page) { ", pp. $($r.first_page)$((if ($r.last_page) { '-' + $r.last_page } else { '' }))" } else { "" }
  $vol = if ($r.volume) { ", vol. $($r.volume)" } else { "" }
  $issue = if ($r.issue) { ", no. $($r.issue)" } else { "" }
  $lines.Add("[$i] $($r.authors), `"$($r.title),`" *$($r.source)*$vol$issue$pages, $($r.year), doi: [$($r.doi)](https://doi.org/$($r.doi)).")
  $i++
}
$lines | Set-Content -Encoding UTF8 -Path $mdPath

[pscustomobject]@{
  count = @($unique).Count
  csv = (Resolve-Path $csvPath).Path
  json = (Resolve-Path $jsonPath).Path
  markdown = (Resolve-Path $mdPath).Path
} | ConvertTo-Json
