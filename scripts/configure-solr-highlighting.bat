@echo off
setlocal EnableDelayedExpansion

REM Solr Highlighting Verification Script for Smart Search (Windows)
REM Verifies that the smart-search-results core has the required schema fields
REM and highlighting configuration, then runs a quick highlighting smoke test.
REM
REM The project's managed-schema already ships with the display_content field
REM (type text_display) used for all server-side highlighting.  This script
REM confirms the setup is correct — it does NOT add extra fields.
REM
REM Prerequisites:
REM   - Solr is running (standalone mode)
REM   - The smart-search-results core already exists with the project's managed-schema
REM   - curl.exe is available (ships with Windows 10+)
REM
REM Usage:
REM   scripts\configure-solr-highlighting.bat
REM   set SOLR_URL=http://myhost:8983/solr && scripts\configure-solr-highlighting.bat
REM
REM See also: SOLR_HIGHLIGHTING_CONFIG.md

if "%SOLR_URL%"=="" set SOLR_URL=http://localhost:8983/solr
set CORE_NAME=smart-search-results

echo =====================================================
echo  Smart Search — Highlighting Verification
echo =====================================================
echo Solr URL: %SOLR_URL%
echo Core:     %CORE_NAME%
echo.

REM ── Prerequisite: curl ──
where curl >nul 2>&1
if errorlevel 1 (
    echo ERROR: curl.exe not found on PATH.
    echo curl ships with Windows 10+. Please install or add it to PATH.
    exit /b 1
)

REM ── Check Solr connectivity ──
echo [1/5] Checking Solr connectivity...
curl -s -o nul -w "%%{http_code}" "%SOLR_URL%/admin/info/system" | findstr "200" >nul 2>&1
if errorlevel 1 (
    echo FAIL: Cannot connect to Solr at %SOLR_URL%
    echo Please ensure Solr is running: bin\solr start
    exit /b 1
)
echo OK

REM ── Check core exists ──
echo [2/5] Checking core %CORE_NAME%...
curl -s "%SOLR_URL%/%CORE_NAME%/admin/ping" | findstr "OK" >nul 2>&1
if errorlevel 1 (
    echo FAIL: Core '%CORE_NAME%' not found.
    echo Create it first — see solr\README.md for instructions.
    exit /b 1
)
echo OK

REM ── Verify display_content field exists in schema ──
echo [3/5] Verifying display_content field in schema...
curl -s "%SOLR_URL%/%CORE_NAME%/schema/fields/display_content" | findstr "display_content" >nul 2>&1
if errorlevel 1 (
    echo FAIL: display_content field not found in schema.
    echo The managed-schema shipped with this project should contain it.
    echo Re-copy solr\smart-search-results\conf\managed-schema and reload.
    exit /b 1
)
echo OK

REM ── Index a test document ──
echo [4/5] Indexing test document...
curl -s -o nul -w "%%{http_code}" -X POST "%SOLR_URL%/%CORE_NAME%/update/json/docs?commit=true" -H "Content-Type: application/json" -d "[{\"id\":\"hl-verify-1\",\"search_session_id\":\"hl-verify\",\"original_query\":\"function\",\"search_timestamp\":\"2025-01-01T00:00:00Z\",\"workspace_path\":\"C:\\test\",\"file_path\":\"C:\\test\\app.js\",\"file_name\":\"app.js\",\"file_extension\":\"js\",\"line_number\":10,\"match_text\":\"function hello() {\",\"match_text_raw\":\"function hello() {\",\"full_line\":\"function hello() {\",\"full_line_raw\":\"function hello() {\",\"display_content\":\"  const x = 1;\\n>>> function hello() { <<<\\n  return x;\"}]" | findstr "200" >nul 2>&1
if errorlevel 1 (
    echo FAIL: Could not index test document.
    exit /b 1
)
echo OK

REM ── Test highlighting on display_content ──
echo [5/5] Testing highlighting on display_content...
curl -s "%SOLR_URL%/%CORE_NAME%/search?q=function&hl=true&hl.fl=display_content&rows=1" | findstr "highlight" >nul 2>&1
if errorlevel 1 (
    echo FAIL: Highlighting response missing.
    goto :cleanup
    exit /b 1
)
echo OK

:cleanup
REM ── Clean up test document ──
echo.
echo Cleaning up test document...
curl -s -o nul -X POST "%SOLR_URL%/%CORE_NAME%/update?commit=true" -H "Content-Type: text/xml" -d "<delete><query>id:hl-verify-1</query></delete>"

echo.
echo =====================================================
echo  All checks passed!
echo =====================================================
echo.
echo Highlighting Configuration:
echo   Canonical field : display_content (type: text_display)
echo   Highlight tags  : ^<mark class="highlight"^>...^</mark^>
echo   Request handler : /search (edismax, hl=true by default)
echo.
echo Configuration files:
echo   solr\smart-search-results\conf\managed-schema   (schema)
echo   solr\smart-search-results\conf\solrconfig.xml   (handlers)
echo   SOLR_HIGHLIGHTING_CONFIG.md                      (documentation)
echo.

pause
