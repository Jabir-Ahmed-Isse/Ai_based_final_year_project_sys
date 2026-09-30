# Create necessary directories
$directories = @(
    "frontend\src\components",
    "frontend\src\pages",
    "frontend\src\services",
    "frontend\src\hooks",
    "frontend\src\utils",
    "python-ai\src",
    "python-ai\models"
)

foreach ($dir in $directories) {
    if (-not (Test-Path -Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
        Write-Host "Created directory: $dir"
    }
}

# Move frontend files
$frontendFiles = @{
    "App.tsx" = "frontend\src\App.tsx"
    "index.html" = "frontend\public\index.html"
    "index.tsx" = "frontend\src\index.tsx"
    "vite.config.ts" = "frontend\vite.config.ts"
    "tsconfig.json" = "frontend\tsconfig.json"
    "components\Sidebar.tsx" = "frontend\src\components\Sidebar.tsx"
    "store.tsx" = "frontend\src\store.tsx"
    "types.ts" = "frontend\src\types.ts"
}

# Move pages
$pageFiles = Get-ChildItem -Path "pages" -File
foreach ($file in $pageFiles) {
    $destination = "frontend\src\pages\$($file.Name)"
    Move-Item -Path $file.FullName -Destination $destination -Force
    Write-Host "Moved $($file.FullName) to $destination"
}

# Move services
$serviceFiles = Get-ChildItem -Path "services" -File -ErrorAction SilentlyContinue
if ($serviceFiles) {
    foreach ($file in $serviceFiles) {
        $destination = "frontend\src\services\$($file.Name)"
        Move-Item -Path $file.FullName -Destination $destination -Force
        Write-Host "Moved $($file.FullName) to $destination"
    }
}

# Move package.json and update paths
if (Test-Path "package.json") {
    $packageJson = Get-Content -Path "package.json" -Raw | ConvertFrom-Json
    
    # Update scripts to point to new locations
    $packageJson.scripts = @{
        "dev" = "vite"
        "build" = "tsc && vite build"
        "preview" = "vite preview"
        "lint" = "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
    }
    
    # Save the updated package.json to the frontend directory
    $packageJson | ConvertTo-Json -Depth 10 | Set-Content -Path "frontend\package.json" -Force
    Write-Host "Created frontend\package.json"
}

# Create a basic Python AI structure
$pythonAiFiles = @{
    "requirements.txt" = @"
flask==2.0.1
flask-cors==3.0.10
sentence-transformers==2.2.2
numpy==1.21.0
pymongo==4.1.1
python-dotenv==0.19.0
"@

    "src/app.py" = @"
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)
CORS(app)

@app.route('/api/health')
def health_check():
    return jsonify({"status": "healthy"})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(host='0.0.0.0', port=port, debug=True)
"@
}

foreach ($file in $pythonAiFiles.GetEnumerator()) {
    $filePath = "python-ai\$($file.Key)"
    $directory = [System.IO.Path]::GetDirectoryName($filePath)
    
    if (-not (Test-Path -Path $directory)) {
        New-Item -ItemType Directory -Path $directory -Force | Out-Null
    }
    
    Set-Content -Path $filePath -Value $file.Value -Force
    Write-Host "Created $filePath"
}

Write-Host "`nReorganization complete!"
Write-Host "Frontend files moved to: frontend\"
Write-Host "Python AI service created in: python-ai\"
Write-Host "`nNext steps:"
Write-Host "1. Navigate to the frontend directory: cd frontend"
Write-Host "2. Install dependencies: npm install"
Write-Host "3. Start the development server: npm run dev"
