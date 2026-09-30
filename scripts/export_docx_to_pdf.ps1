param(
    [Parameter(Mandatory = $true)][string]$InputDocx,
    [Parameter(Mandatory = $true)][string]$OutputPdf
)

$resolvedInput = (Resolve-Path -LiteralPath $InputDocx).Path
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputPdf)
$outputDirectory = [System.IO.Path]::GetDirectoryName($resolvedOutput)
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$wordApplication = $null
$document = $null
try {
    $wordApplication = New-Object -ComObject Word.Application
    $wordApplication.Visible = $false
    $wordApplication.DisplayAlerts = 0
    $document = $wordApplication.Documents.Open($resolvedInput, $false, $true)
    $document.ExportAsFixedFormat($resolvedOutput, 17)
    Write-Output $resolvedOutput
}
finally {
    if ($null -ne $document) {
        $document.Close($false)
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) | Out-Null
    }
    if ($null -ne $wordApplication) {
        $wordApplication.Quit()
        [System.Runtime.InteropServices.Marshal]::ReleaseComObject($wordApplication) | Out-Null
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
