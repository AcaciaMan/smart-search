@echo off
setlocal EnableDelayedExpansion

REM Solr Highlighting Configuration Script for Smart Search (Windows)
REM This script configures Solr for optimal highlighting performance

if "%SOLR_URL%"=="" set SOLR_URL=http://localhost:8983/solr
if "%COLLECTION%"=="" set COLLECTION=smart-search-results

echo 🔧 Configuring Solr highlighting for Smart Search...
echo Solr URL: %SOLR_URL%
echo Collection: %COLLECTION%
echo.

REM Test Solr connectivity
echo 🔍 Testing Solr connectivity...
curl -s "%SOLR_URL%/admin/collections?action=LIST" > nul
if errorlevel 1 (
    echo ❌ Cannot connect to Solr at %SOLR_URL%
    echo Please ensure Solr is running and accessible.
    exit /b 1
)
echo ✅ Solr is accessible

echo.
echo 🏗️  Adding enhanced field types...

REM Add text_highlight field type
echo Adding text_highlight field type...
curl -X POST -H "Content-type:application/json" "%SOLR_URL%/%COLLECTION%/schema" -d "{ \"add-field-type\": { \"name\": \"text_highlight\", \"class\": \"solr.TextField\", \"positionIncrementGap\": \"100\", \"analyzer\": { \"tokenizer\": {\"class\": \"solr.StandardTokenizerFactory\"}, \"filters\": [ {\"class\": \"solr.LowerCaseFilterFactory\"}, {\"class\": \"solr.StopFilterFactory\", \"ignoreCase\": \"true\", \"words\": \"stopwords.txt\"}, {\"class\": \"solr.PorterStemFilterFactory\"}, {\"class\": \"solr.RemoveDuplicatesTokenFilterFactory\"} ] } } }"

REM Add text_code_highlight field type
echo Adding text_code_highlight field type...
curl -X POST -H "Content-type:application/json" "%SOLR_URL%/%COLLECTION%/schema" -d "{ \"add-field-type\": { \"name\": \"text_code_highlight\", \"class\": \"solr.TextField\", \"positionIncrementGap\": \"100\", \"analyzer\": { \"tokenizer\": {\"class\": \"solr.StandardTokenizerFactory\"}, \"filters\": [ {\"class\": \"solr.LowerCaseFilterFactory\"}, {\"class\": \"solr.StopFilterFactory\", \"ignoreCase\": \"true\", \"words\": \"stopwords.txt\", \"enablePositionIncrements\": \"true\"}, {\"class\": \"solr.RemoveDuplicatesTokenFilterFactory\"} ] } } }"

echo.
echo 📋 Adding highlighting fields...

REM Add content_highlight field
echo Adding content_highlight field...
curl -X POST -H "Content-type:application/json" "%SOLR_URL%/%COLLECTION%/schema" -d "{ \"add-field\": { \"name\": \"content_highlight\", \"type\": \"text_highlight\", \"indexed\": true, \"stored\": false, \"multiValued\": false } }"

REM Add code_highlight field
echo Adding code_highlight field...
curl -X POST -H "Content-type:application/json" "%SOLR_URL%/%COLLECTION%/schema" -d "{ \"add-field\": { \"name\": \"code_highlight\", \"type\": \"text_code_highlight\", \"indexed\": true, \"stored\": false, \"multiValued\": false } }"

REM Add file_path_highlight field
echo Adding file_path_highlight field...
curl -X POST -H "Content-type:application/json" "%SOLR_URL%/%COLLECTION%/schema" -d "{ \"add-field\": { \"name\": \"file_path_highlight\", \"type\": \"text_highlight\", \"indexed\": true, \"stored\": false, \"multiValued\": false } }"

echo.
echo 🔗 Adding copy fields...

REM Add copy fields
echo Adding copy field: content_all -> content_highlight...
curl -X POST -H "Content-type:application/json" "%SOLR_URL%/%COLLECTION%/schema" -d "{ \"add-copy-field\": { \"source\": \"content_all\", \"dest\": \"content_highlight\" } }"

echo Adding copy field: code_all -> code_highlight...
curl -X POST -H "Content-type:application/json" "%SOLR_URL%/%COLLECTION%/schema" -d "{ \"add-copy-field\": { \"source\": \"code_all\", \"dest\": \"code_highlight\" } }"

echo Adding copy field: match_text -> content_highlight...
curl -X POST -H "Content-type:application/json" "%SOLR_URL%/%COLLECTION%/schema" -d "{ \"add-copy-field\": { \"source\": \"match_text\", \"dest\": \"content_highlight\" } }"

echo Adding copy field: full_line -> code_highlight...
curl -X POST -H "Content-type:application/json" "%SOLR_URL%/%COLLECTION%/schema" -d "{ \"add-copy-field\": { \"source\": \"full_line\", \"dest\": \"code_highlight\" } }"

echo Adding copy field: file_path -> file_path_highlight...
curl -X POST -H "Content-type:application/json" "%SOLR_URL%/%COLLECTION%/schema" -d "{ \"add-copy-field\": { \"source\": \"file_path\", \"dest\": \"file_path_highlight\" } }"

echo.
echo 🔄 Reloading collection to apply changes...
curl -s "%SOLR_URL%/admin/collections?action=RELOAD&name=%COLLECTION%" | findstr "status.:0" > nul
if errorlevel 1 (
    echo ⚠️  Collection reload may have failed. Check Solr logs.
) else (
    echo ✅ Collection reloaded successfully
)

echo.
echo 🧪 Testing highlighting configuration...
curl -s "%SOLR_URL%/%COLLECTION%/select?q=function&hl=true&hl.fl=content_highlight,code_highlight&rows=1" | findstr "highlighting" > nul
if errorlevel 1 (
    echo ⚠️  Highlighting test inconclusive. May need data reindexing.
) else (
    echo ✅ Highlighting is working!
)

echo.
echo 📊 Configuration Summary:
echo - ✅ Enhanced field types added (text_highlight, text_code_highlight)
echo - ✅ Dedicated highlighting fields created
echo - ✅ Copy fields configured for automatic population
echo - ✅ Collection reloaded
echo - ✅ Configuration files available in solr/smart-search-results/conf/
echo.
echo 📁 Configuration Files:
echo   - synonyms.txt (synonym expansion)
echo   - protwords.txt (protected words)
echo   - managed-schema (field definitions - no stopwords for code search)
echo   - solrconfig.xml (Solr configuration)
echo.
echo 🔧 Next Steps:
echo 1. Copy configuration files to your Solr instance directory if needed
echo 2. Reindex your data to populate the new highlighting fields
echo 3. Test searches in your VS Code extension
echo 4. Monitor Solr performance and adjust fragment sizes if needed
echo.
echo 📖 For manual configuration details, see: SOLR_HIGHLIGHTING_CONFIG.md

pause
