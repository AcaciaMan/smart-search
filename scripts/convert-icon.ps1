# Script to convert SVG icon to PNG for VS Code marketplace
# Requires ImageMagick or Inkscape to be installed

Write-Host "Converting icon.svg to icon.png..."

# Try using Inkscape first (preferred for SVG conversion)
$inkscape = Get-Command inkscape -ErrorAction SilentlyContinue
if ($inkscape) {
    Write-Host "Using Inkscape..."
    & inkscape icon.svg --export-filename=icon.png --export-width=128 --export-height=128
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully created icon.png using Inkscape" -ForegroundColor Green
        exit 0
    }
}

# Try using ImageMagick (magick command)
$magick = Get-Command magick -ErrorAction SilentlyContinue
if ($magick) {
    Write-Host "Using ImageMagick..."
    & magick convert -background none -resize 128x128 icon.svg icon.png
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully created icon.png using ImageMagick" -ForegroundColor Green
        exit 0
    }
}

# Try using convert command (older ImageMagick)
$convert = Get-Command convert -ErrorAction SilentlyContinue
if ($convert) {
    Write-Host "Using ImageMagick (convert)..."
    & convert -background none -resize 128x128 icon.svg icon.png
    if ($LASTEXITCODE -eq 0) {
        Write-Host "Successfully created icon.png using ImageMagick" -ForegroundColor Green
        exit 0
    }
}

Write-Host ""
Write-Host "ERROR: Could not convert SVG to PNG. Please install one of the following:" -ForegroundColor Red
Write-Host "  1. Inkscape: https://inkscape.org/release/" -ForegroundColor Yellow
Write-Host "  2. ImageMagick: https://imagemagick.org/script/download.php" -ForegroundColor Yellow
Write-Host ""
Write-Host "Alternatively, you can:" -ForegroundColor Cyan
Write-Host "  - Open icon.svg in a browser and save as PNG (128x128)" -ForegroundColor Cyan
Write-Host "  - Use an online converter like https://cloudconvert.com/svg-to-png" -ForegroundColor Cyan
exit 1
