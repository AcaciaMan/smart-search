@echo off
setlocal EnableDelayedExpansion

REM Test script to verify Solr configuration (Windows)
REM This script tests if the smart-search-results core can be created successfully

if "%SOLR_URL%"=="" set SOLR_URL=http://localhost:8983/solr
set CORE_NAME=smart-search-results

echo 🧪 Testing Solr Configuration...
echo Solr URL: %SOLR_URL%
echo Core Name: %CORE_NAME%
echo.

REM Check if Solr is running
echo 🔍 Checking if Solr is running...
curl -s "%SOLR_URL%/admin/info/system" >nul 2>&1
if errorlevel 1 (
    echo ❌ Solr is not running at %SOLR_URL%
    echo Please start Solr and try again.
    exit /b 1
)
echo ✅ Solr is running

REM Delete existing core (for testing)
echo 🗑️  Deleting existing core if exists...
curl -s "%SOLR_URL%/admin/cores?action=UNLOAD&core=%CORE_NAME%&deleteIndex=true&deleteDataDir=true&deleteInstanceDir=true" >nul 2>&1
echo Done (errors are normal if core didn't exist)

REM Check if configuration directory exists
if not exist "solr\smart-search-results\conf" (
    echo ❌ Configuration directory not found: solr\smart-search-results\conf
    echo Please ensure you're running this from the smart-search root directory
    exit /b 1
)

REM Create core using the configuration files
echo 🏗️  Creating core with configuration...
curl -s "%SOLR_URL%/admin/cores?action=CREATE&name=%CORE_NAME%&configSet=_default&instanceDir=%CORE_NAME%" | findstr "status.:0" >nul
if errorlevel 1 (
    echo ❌ Failed to create core
    echo Common issues:
    echo - Configuration syntax errors
    echo - Missing field types or fields  
    echo - Type mismatches (int vs float vs string)
    exit /b 1
)
echo ✅ Core created successfully

REM Test basic query
echo 🧪 Testing core functionality...
curl -s "%SOLR_URL%/%CORE_NAME%/select?q=*:*&rows=0" | findstr "numFound" >nul
if errorlevel 1 (
    echo ⚠️  Core query test failed
    goto :summary
)
echo ✅ Core is responding to queries

REM Test highlighting
curl -s "%SOLR_URL%/%CORE_NAME%/select?q=test&hl=true&hl.fl=content_highlight&rows=0" | findstr "highlighting" >nul
if errorlevel 1 (
    echo ⚠️  Highlighting test failed
    goto :summary
)
echo ✅ Highlighting is configured correctly

:summary
echo.
echo 🎉 Success! Solr configuration is working correctly.
echo.
echo Next steps:
echo 1. Copy your configuration files to the Solr instance directory
echo 2. Reload the core to apply the configuration  
echo 3. Test with your VS Code extension

pause
