@echo off
setlocal EnableDelayedExpansion

REM Test script to verify Solr configuration (Windows)
REM Creates the smart-search-results core using the project's custom schema,
REM indexes a test document, and verifies queries and highlighting.
REM
REM Prerequisites:
REM   - Solr 9.x is running in standalone mode
REM   - curl.exe is available (ships with Windows 10+)
REM   - Run from the project root directory
REM
REM Usage:
REM   scripts\test-solr-config.bat
REM   set SOLR_URL=http://myhost:8983/solr && scripts\test-solr-config.bat
REM
REM Cleanup:
REM   bin\solr delete -c smart-search-results

if "%SOLR_URL%"=="" set SOLR_URL=http://localhost:8983/solr
set CORE_NAME=smart-search-results

echo Testing Solr Configuration...
echo Solr URL:  %SOLR_URL%
echo Core Name: %CORE_NAME%
echo.

REM ── Prerequisite: curl ──
where curl >nul 2>&1
if errorlevel 1 (
    echo ERROR: curl.exe not found on PATH.
    echo curl ships with Windows 10+. Please install or add it to PATH.
    exit /b 1
)

REM ── Check if Solr is running ──
echo Checking if Solr is running...
curl -s "%SOLR_URL%/admin/info/system" >nul 2>&1
if errorlevel 1 (
    echo ERROR: Solr is not running at %SOLR_URL%
    echo Please start Solr: bin\solr start
    exit /b 1
)
echo OK - Solr is running

REM ── Check config directory exists ──
if not exist "solr\smart-search-results\conf" (
    echo ERROR: Configuration directory not found: solr\smart-search-results\conf
    echo Please ensure you are running this from the smart-search project root.
    exit /b 1
)

REM ── Delete existing core (for clean testing) ──
echo Deleting existing core if present...
curl -s "%SOLR_URL%/admin/cores?action=UNLOAD&core=%CORE_NAME%&deleteIndex=true&deleteDataDir=true&deleteInstanceDir=true" >nul 2>&1
echo Done (errors are normal if core did not exist)

REM ── Determine SOLR_HOME ──
REM Try to find Solr's home directory. Users can set SOLR_HOME if auto-detection fails.
if "%SOLR_HOME%"=="" (
    REM Try common locations
    if exist "C:\solr\server\solr" (
        set SOLR_HOME=C:\solr
    ) else if exist "C:\Tools\solr\server\solr" (
        set SOLR_HOME=C:\Tools\solr
    ) else (
        echo WARNING: SOLR_HOME not set and could not be auto-detected.
        echo Set SOLR_HOME to your Solr installation directory and re-run.
        echo Example: set SOLR_HOME=C:\Tools\solr-9.4.0
        exit /b 1
    )
)
echo Using SOLR_HOME: %SOLR_HOME%

REM ── Copy project config to Solr's core directory ──
echo Copying project configuration to Solr...
if exist "%SOLR_HOME%\server\solr\%CORE_NAME%" (
    rmdir /s /q "%SOLR_HOME%\server\solr\%CORE_NAME%" >nul 2>&1
)
xcopy /s /y /i "solr\%CORE_NAME%" "%SOLR_HOME%\server\solr\%CORE_NAME%\" >nul
if errorlevel 1 (
    echo ERROR: Failed to copy configuration files to %SOLR_HOME%\server\solr\%CORE_NAME%
    exit /b 1
)
echo OK - Configuration files copied

REM ── Create core using the project's config ──
echo Creating core with project's managed-schema...
curl -s "%SOLR_URL%/admin/cores?action=CREATE&name=%CORE_NAME%&instanceDir=%CORE_NAME%" | findstr "status.:0" >nul
if errorlevel 1 (
    echo ERROR: Failed to create core.
    echo Common issues:
    echo   - XML syntax errors in managed-schema
    echo   - Missing field types or fields
    echo   - Solr version mismatch (requires 9.x)
    exit /b 1
)
echo OK - Core created successfully

REM ── Test basic query ──
echo Testing core functionality...
curl -s "%SOLR_URL%/%CORE_NAME%/select?q=*:*&rows=0" | findstr "numFound" >nul
if errorlevel 1 (
    echo WARN: Core query test failed
    goto :cleanup_hint
)
echo OK - Core is responding to queries

REM ── Index a test document with all required fields ──
echo Indexing test document...
curl -s -X POST -H "Content-Type: application/json" "%SOLR_URL%/%CORE_NAME%/update/json/docs?commit=true" -d "[{\"id\":\"test_config_1\",\"search_session_id\":\"session_test\",\"original_query\":\"test\",\"search_timestamp\":\"2026-01-15T10:00:00Z\",\"workspace_path\":\"C:\\\\test\",\"file_path\":\"C:\\\\test\\\\hello.ts\",\"file_name\":\"hello.ts\",\"file_extension\":\"ts\",\"line_number\":1,\"column_number\":0,\"match_text\":\"hello world function\",\"match_text_raw\":\"hello world function\",\"full_line\":\"export function hello() { return 'world'; }\",\"full_line_raw\":\"export function hello() { return 'world'; }\",\"context_before\":[],\"context_after\":[],\"context_lines_before\":0,\"context_lines_after\":0,\"match_type\":\"literal\",\"case_sensitive\":false,\"whole_word\":false,\"relevance_score\":80,\"match_count_in_file\":1,\"display_content\":\">>> export function hello() { return 'world'; } <<<\"}]"
if errorlevel 1 (
    echo WARN: Failed to index test document
    goto :cleanup_hint
)
echo OK - Test document indexed

REM ── Verify the document was stored ──
echo Verifying document retrieval...
curl -s "%SOLR_URL%/%CORE_NAME%/select?q=id:test_config_1&wt=json" | findstr "numFound.:1" >nul
if errorlevel 1 (
    echo WARN: Document not found after indexing
    goto :cleanup_hint
)
echo OK - Document retrieved successfully

REM ── Test highlighting on display_content ──
echo Testing highlighting...
curl -s "%SOLR_URL%/%CORE_NAME%/select?q=function&hl=true&hl.fl=display_content&rows=1" | findstr "highlighting" >nul
if errorlevel 1 (
    echo WARN: Highlighting test failed
    goto :cleanup_hint
)
echo OK - Highlighting is working

REM ── Test the /search handler (edismax) ──
echo Testing /search handler (edismax)...
curl -s "%SOLR_URL%/%CORE_NAME%/search?q=hello" | findstr "numFound" >nul
if errorlevel 1 (
    echo WARN: /search handler test failed
    goto :cleanup_hint
)
echo OK - /search handler works

REM ── Test ping ──
echo Testing /admin/ping...
curl -s "%SOLR_URL%/%CORE_NAME%/admin/ping" | findstr "OK" >nul
if errorlevel 1 (
    echo WARN: Ping failed
    goto :cleanup_hint
)
echo OK - Ping successful

echo.
echo All tests passed! Solr configuration is working correctly.
echo.
echo Next steps:
echo   1. Start using the extension — ripgrep results will be stored in this core
echo   2. Run: scripts\configure-solr-highlighting.bat (verify highlighting)
echo.
echo To remove the test core:
echo   bin\solr delete -c %CORE_NAME%
echo.
pause
exit /b 0

:cleanup_hint
echo.
echo Some tests failed. Check the output above.
echo To remove the test core:  bin\solr delete -c %CORE_NAME%
echo.
pause
exit /b 1
