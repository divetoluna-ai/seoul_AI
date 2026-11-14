$ErrorActionPreference = 'Stop'
$previousKey = $env:TOUR_API_KEY
try {
    if ([string]::IsNullOrWhiteSpace($env:TOUR_API_KEY)) {
        $localEnv = Join-Path $PSScriptRoot '.env'
        if (Test-Path -LiteralPath $localEnv) {
            foreach ($line in [IO.File]::ReadAllLines($localEnv)) {
                if ($line -match '^\s*TOUR_API_KEY\s*=\s*(.*?)\s*$') {
                    $env:TOUR_API_KEY = $Matches[1].Trim().Trim('"').Trim("'")
                }
            }
        }
    }
    if ([string]::IsNullOrWhiteSpace($env:TOUR_API_KEY)) {
        $secureKey = Read-Host 'TourAPI Decoding service key (input hidden)' -AsSecureString
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        try { $env:TOUR_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
    }
    if ([string]::IsNullOrWhiteSpace($env:TOUR_API_KEY)) {
        throw 'API key is required. The API server was not started.'
    }
    Push-Location $PSScriptRoot
    try { & .\gradlew.bat bootRun }
    finally { Pop-Location }
} finally {
    $env:TOUR_API_KEY = $previousKey
}
