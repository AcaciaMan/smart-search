# Test Solr Schema — validates the smart-search-results core by indexing
# a test document with all required fields and verifying queries + highlighting.
#
# Prerequisites:
#   - Solr 9.x running in standalone mode with the smart-search-results core
#   - PowerShell 5.1+ (Invoke-RestMethod is built-in)
#
# Usage:
#   .\scripts\test-solr-schema.ps1
#   .\scripts\test-solr-schema.ps1 -SolrUrl http://myhost:8983/solr/smart-search-results
#
# Cleanup:
#   To remove the core:  bin\solr delete -c smart-search-results

param(
    [string]$SolrUrl = "http://localhost:8983/solr/smart-search-results"
)

Write-Host "Testing Solr Schema..."
Write-Host "Solr Core URL: $SolrUrl"
Write-Host ""

# ── Prerequisite: check Solr connectivity ──
Write-Host "Checking Solr connectivity..."
try {
    $ping = Invoke-RestMethod -Uri "$SolrUrl/admin/ping" -ErrorAction Stop
    if ($ping.status -eq "OK") {
        Write-Host "OK - Core is reachable (ping status: OK)"
    } else {
        Write-Host "OK - Core is reachable"
    }
} catch {
    Write-Host "ERROR: Cannot connect to Solr at $SolrUrl"
    Write-Host "Ensure Solr is running and the smart-search-results core exists."
    Write-Host "  Start Solr:   bin\solr start"
    Write-Host "  Create core:  see solr\README.md"
    exit 1
}
Write-Host ""

# ── Clear any existing test data ──
Write-Host "Clearing any existing test data..."
try {
    Invoke-RestMethod -Uri "$SolrUrl/update?commit=true" -Method Post `
        -Body '<delete><query>id:test_*</query></delete>' `
        -ContentType "text/xml" -ErrorAction Stop | Out-Null
    Write-Host "OK - Cleared existing test data"
} catch {
    Write-Host "WARN: No existing test data to clear (or delete failed)"
}
Write-Host ""

# ── Build a test document with ALL required schema fields ──
$testDoc = @{
    id                  = "test_doc_validation"
    search_session_id   = "session_test_validation"
    original_query      = "test validation query"
    search_timestamp    = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    workspace_path      = "C:\test\workspace"
    file_path           = "C:\test\workspace\src\app.ts"
    file_name           = "app.ts"
    file_extension      = "ts"
    file_size           = 1024
    file_modified       = "2026-01-14T18:00:00Z"
    line_number         = 42
    column_number       = 8
    match_text          = "function getData"
    match_text_raw      = "function getData"
    full_line           = "export async function getData(params: QueryParams): Promise<Result[]> {"
    full_line_raw       = "export async function getData(params: QueryParams): Promise<Result[]> {"
    context_before      = @("import { QueryParams, Result } from '../types';", "")
    context_after       = @("  const response = await fetch(url);", "  return response.json();")
    context_lines_before = 2
    context_lines_after  = 2
    match_type          = "literal"
    case_sensitive      = $false
    whole_word          = $false
    relevance_score     = 85
    match_count_in_file = 3
    ai_summary          = "Test document for schema validation"
    ai_tags             = @("test", "validation")
    display_content     = "import { QueryParams, Result } from '../types';`n`n>>> export async function getData(params: QueryParams): Promise<Result[]> { <<<`n  const response = await fetch(url);`n  return response.json();"
}

$jsonDoc = $testDoc | ConvertTo-Json -Depth 5
Write-Host "Test document JSON:"
Write-Host $jsonDoc
Write-Host ""

# ── Index the test document ──
Write-Host "Sending test document to Solr..."
try {
    $response = Invoke-RestMethod -Uri "$SolrUrl/update/json/docs?commit=true" `
        -Method Post -Body $jsonDoc -ContentType "application/json" -ErrorAction Stop
    Write-Host "OK - Test document indexed successfully"
    Write-Host "  Response status: $($response.responseHeader.status)"
    Write-Host "  QTime: $($response.responseHeader.QTime)ms"
} catch {
    Write-Host "ERROR: Failed to index test document"
    Write-Host "  $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        Write-Host "  Response body: $($reader.ReadToEnd())"
    }
    exit 1
}
Write-Host ""

# ── Verify document retrieval ──
Write-Host "Verifying document was stored..."
try {
    $verifyResponse = Invoke-RestMethod -Uri "$SolrUrl/select?q=id:test_doc_validation&wt=json" -ErrorAction Stop
    if ($verifyResponse.response.numFound -gt 0) {
        Write-Host "OK - Document found in index (numFound: $($verifyResponse.response.numFound))"
    } else {
        Write-Host "ERROR: Document not found in index"
        exit 1
    }
} catch {
    Write-Host "ERROR: Failed to query document — $($_.Exception.Message)"
    exit 1
}
Write-Host ""

# ── Test highlighting on display_content ──
Write-Host "Testing highlighting on display_content..."
try {
    $hlResponse = Invoke-RestMethod -Uri "$SolrUrl/select?q=getData&hl=true&hl.fl=display_content&wt=json" -ErrorAction Stop
    Write-Host "  Search results: $($hlResponse.response.numFound)"
    if ($hlResponse.highlighting) {
        Write-Host "OK - Highlighting data available"
    } else {
        Write-Host "WARN: No highlighting data returned"
    }
} catch {
    Write-Host "WARN: Highlighting query failed — $($_.Exception.Message)"
}
Write-Host ""

# ── Test highlighting on match_text and full_line ──
Write-Host "Testing highlighting on match_text, full_line..."
try {
    $hlResponse2 = Invoke-RestMethod -Uri "$SolrUrl/select?q=function&hl=true&hl.fl=match_text,full_line&wt=json" -ErrorAction Stop
    Write-Host "  Search results: $($hlResponse2.response.numFound)"
    if ($hlResponse2.highlighting) {
        Write-Host "OK - Highlighting data available"
    } else {
        Write-Host "WARN: No highlighting data returned"
    }
} catch {
    Write-Host "WARN: Highlighting query failed — $($_.Exception.Message)"
}
Write-Host ""

# ── Test the /search handler (edismax) ──
Write-Host "Testing /search handler (edismax)..."
try {
    $searchResponse = Invoke-RestMethod -Uri "$SolrUrl/search?q=getData&wt=json" -ErrorAction Stop
    Write-Host "  Search results: $($searchResponse.response.numFound)"
    if ($searchResponse.response.numFound -gt 0) {
        Write-Host "OK - /search handler works"
    } else {
        Write-Host "WARN: /search handler returned 0 results"
    }
} catch {
    Write-Host "WARN: /search handler test failed — $($_.Exception.Message)"
}
Write-Host ""

# ── Cleanup test data ──
Write-Host "Cleaning up test data..."
try {
    Invoke-RestMethod -Uri "$SolrUrl/update?commit=true" -Method Post `
        -Body '<delete><query>id:test_*</query></delete>' `
        -ContentType "text/xml" -ErrorAction Stop | Out-Null
    Write-Host "OK - Test data cleaned up"
} catch {
    Write-Host "WARN: Cleanup failed — $($_.Exception.Message)"
}
Write-Host ""

Write-Host "Schema validation complete!"
Write-Host ""
Write-Host "To remove the core entirely:"
Write-Host "  bin\solr delete -c smart-search-results"
