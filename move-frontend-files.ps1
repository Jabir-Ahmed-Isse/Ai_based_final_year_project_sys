# List of frontend files and directories to move
$frontendItems = @(
    "App.tsx",
    "components",
    "index.html",
    "index.tsx",
    "pages",
    "services",
    "store.tsx",
    "types.ts",
    "vite.config.ts",
    "tsconfig.json"
)

# Move each item to the frontend directory
foreach ($item in $frontendItems) {
    $source = ".\$item"
    $destination = ".\frontend\"
    
    if (Test-Path $source) {
        if (Test-Path -Path $source -PathType Container) {
            # If it's a directory, copy all contents
            Write-Host "Moving directory: $source to $destination"
            Copy-Item -Path "$source\*" -Destination $destination -Recurse -Force
            Remove-Item -Path $source -Recurse -Force
        } else {
            # If it's a file, move it directly
            Write-Host "Moving file: $source to $destination"
            Move-Item -Path $source -Destination $destination -Force
        }
    } else {
        Write-Host "Warning: $source not found"
    }
}

# Create a new package.json in the frontend directory if it doesn't exist
if (-not (Test-Path ".\frontend\package.json")) {
    $packageJson = @{
        name = "hormuud-academic-project-frontend"
        private = true
        version = "0.0.0"
        type = "module"
        scripts = @{
            dev = "vite"
            build = "tsc && vite build"
            preview = "vite preview"
            lint = "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0"
        }
        dependencies = @{
            react = "^18.2.0"
            "react-dom" = "^18.2.0"
            "react-router-dom" = "^6.14.2"
            "@tanstack/react-query" = "^4.35.0"
            "@tanstack/react-query-devtools" = "^4.35.0"
            axios = "^1.4.0"
            "date-fns" = "^2.30.0"
            "react-hook-form" = "^7.45.0"
            "@hookform/resolvers" = "^3.3.0"
            "zod" = "^3.21.0"
            "@radix-ui/react-dialog" = "^1.0.0"
            "@radix-ui/react-dropdown-menu" = "^2.0.0"
            "@radix-ui/react-slot" = "^1.0.0"
            "class-variance-authority" = "^0.7.0"
            "clsx" = "^2.0.0"
            "lucide-react" = "^0.264.0"
            "tailwind-merge" = "^2.0.0"
            "tailwindcss-animate" = "^1.0.0"
        }
        devDependencies = @{
            "@types/node" = "^20.0.0"
            "@types/react" = "^18.2.0"
            "@types/react-dom" = "^18.2.0"
            "@typescript-eslint/eslint-plugin" = "^6.0.0"
            "@typescript-eslint/parser" = "^6.0.0"
            "@vitejs/plugin-react" = "^4.0.0"
            autoprefixer = "^10.0.0"
            eslint = "^8.0.0"
            "eslint-plugin-react-hooks" = "^4.6.0"
            "eslint-plugin-react-refresh" = "^0.4.0"
            postcss = "^8.0.0"
            tailwindcss = "^3.0.0"
            typescript = "^5.0.0"
            vite = "^5.0.0"
        }
    }
    
    $packageJson | ConvertTo-Json -Depth 10 | Out-File -FilePath ".\frontend\package.json" -Encoding utf8
    Write-Host "Created frontend/package.json"
}

Write-Host "Frontend files have been moved to the frontend directory."
Write-Host "Next steps:"
Write-Host "1. Navigate to the frontend directory: cd frontend"
Write-Host "2. Install dependencies: npm install"
Write-Host "3. Start the development server: npm run dev"
