# Test Solr document creation to validate schema
$solrUrl = "http://localhost:8983/solr/smart-search-results"

# Clear any existing test data
Write-Host "🧹 Clearing any existing test data..."
try {
    Invoke-RestMethod -Uri "$solrUrl/update?commit=true" -Method Post -Body '<delete><query>id:test_*</query></delete>' -ContentType "text/xml"
    Write-Host "✅ Cleared existing test data"
} catch {
    Write-Host "⚠️  No existing test data to clear"
}

# Create a minimal test document
$testDoc = @{
    id = "test_doc_validation"
    search_session_id = "test_session_validation"
    original_query = "test validation query"
    search_timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
    workspace_path = "C:\test\workspace"
    file_path = "C:\test\workspace\file.txt"
    file_name = "file.txt"
    line_number = 1
    match_text_raw = "test content match"
    full_line_raw = "this is a test content match line"
    match_text = "test content match"
    full_line = "this is a test content match line"
    context_before = @("line before")
    context_after = @("line after")
    context_lines_before = 1
    context_lines_after = 1
    match_type = "literal"
    case_sensitive = $false
    whole_word = $false
    relevance_score = 85
    match_count_in_file = 1
    ai_summary = "Test document for schema validation"
    ai_tags = @("test", "validation")
    file_extension = "txt"
    file_size = 100
    column_number = 1
}

$jsonDoc = $testDoc | ConvertTo-Json -Depth 5
Write-Host "📄 Test document JSON:"
Write-Host $jsonDoc

Write-Host ""
Write-Host "🚀 Sending test document to Solr..."

try {
    $response = Invoke-RestMethod -Uri "$solrUrl/update/json/docs?commit=true" -Method Post -Body $jsonDoc -ContentType "application/json"
    Write-Host "✅ Test document added successfully!"
    Write-Host "Response status: $($response.responseHeader.status)"
    Write-Host "QTime: $($response.responseHeader.QTime)ms"
    
    # Verify the document was stored
    Write-Host ""
    Write-Host "🔍 Verifying document was stored..."
    $verifyResponse = Invoke-RestMethod -Uri "$solrUrl/select?q=id:test_doc_validation&wt=json"
    if ($verifyResponse.response.numFound -gt 0) {
        Write-Host "✅ Document found in index!"
        Write-Host "Document count: $($verifyResponse.response.numFound)"
        
        # Test highlighting query
        Write-Host ""
        Write-Host "🎯 Testing highlighting query..."
        $highlightResponse = Invoke-RestMethod -Uri "$solrUrl/select?q=test&hl=true&hl.fl=match_text,full_line&wt=json"
        Write-Host "Search results: $($highlightResponse.response.numFound)"
        if ($highlightResponse.highlighting) {
            Write-Host "✅ Highlighting data available!"
        } else {
            Write-Host "⚠️  No highlighting data returned"
        }
        
    } else {
        Write-Host "❌ Document not found in index!"
    }
    
} catch {
    Write-Host "❌ Error: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $stream = $_.Exception.Response.GetResponseStream()
        $reader = New-Object System.IO.StreamReader($stream)
        $errorBody = $reader.ReadToEnd()
        Write-Host "Error details:"
        Write-Host $errorBody
    }
}
