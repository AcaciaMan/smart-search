# Simple Solr validation test with exact IndexManager structure
$solrUrl = "http://localhost:8983/solr/smart-search-results"

# Create a document that exactly matches IndexManager output
$exactDoc = @{
    id = "exact_test_session_test.ts_line1_0"
    search_session_id = "exact_test_session"
    original_query = "test function"
    search_timestamp = "2025-08-08T10:00:00.000Z"
    workspace_path = "C:\work\GitHub\smart-search"
    file_path = "C:\work\GitHub\smart-search\src\test.ts"
    file_name = "test.ts"
    file_extension = "ts"
    file_size = 1000
    file_modified = "2025-08-08T10:00:00.000Z"
    line_number = 1
    column_number = 1
    match_text = "function test()"
    match_text_raw = "function test()"
    context_before = @("import { test } from './types';", "")
    context_after = @("  return true;")
    context_lines_before = 2
    context_lines_after = 1
    full_line = "export function test(): boolean {"
    full_line_raw = "export function test(): boolean {"
    match_type = "literal"
    case_sensitive = $false
    whole_word = $false
    relevance_score = 95
    match_count_in_file = 1
    ai_summary = ""
    ai_tags = @()
}

Write-Host "🧪 Testing exact IndexManager document structure"
Write-Host "Document fields: $($exactDoc.Keys -join ', ')"

try {
    $jsonDoc = $exactDoc | ConvertTo-Json -Depth 5
    Write-Host "📤 Sending to Solr..."
    
    $response = Invoke-RestMethod -Uri "$solrUrl/update/json/docs?commit=true" -Method Post -Body $jsonDoc -ContentType "application/json"
    Write-Host "✅ SUCCESS!"
    Write-Host "Status: $($response.responseHeader.status)"
    Write-Host "QTime: $($response.responseHeader.QTime)ms"
    
    # Verify it's stored
    $verify = Invoke-RestMethod -Uri "$solrUrl/select?q=id:exact_test*"
    Write-Host "📊 Stored documents: $($verify.response.numFound)"
    
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)"
    
    # Try to get detailed error
    if ($_.Exception.Response) {
        try {
            $stream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($stream)
            $errorDetail = $reader.ReadToEnd()
            Write-Host "🔍 Error Details:"
            Write-Host $errorDetail
        } catch {
            Write-Host "Could not read error details"
        }
    }
}

Write-Host ""
Write-Host "💡 If this works, the issue might be in VS Code extension data or need to reload VS Code"
Write-Host "💡 If this fails, we need to check field types or Solr configuration"
