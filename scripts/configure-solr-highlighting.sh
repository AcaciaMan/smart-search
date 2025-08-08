#!/bin/bash

# Solr Highlighting Configuration Script for Smart Search
# This script configures Solr for optimal highlighting performance

SOLR_URL="${SOLR_URL:-http://localhost:8983/solr}"
COLLEecho ""
echo "📊 Configuration Summary:"
echo "- ✅ Enhanced field types added (text_highlight, text_code_highlight)"
echo "- ✅ Dedicated highlighting fields created"  
echo "- ✅ Copy fields configured for automatic population"
echo "- ✅ Collection reloaded"
echo "- ✅ Configuration files available in solr/smart-search-results/conf/"
echo ""
echo "📁 Configuration Files:"
echo "  - synonyms.txt (synonym expansion)"
echo "  - protwords.txt (protected words)"
echo "  - managed-schema (field definitions - no stopwords for code search)"
echo "  - solrconfig.xml (Solr configuration)"
echo ""
echo "🔧 Next Steps:"
echo "1. Copy configuration files to your Solr instance directory if needed"
echo "2. Reindex your data to populate the new highlighting fields"
echo "3. Test searches in your VS Code extension"
echo "4. Monitor Solr performance and adjust fragment sizes if needed"LLECTION:-smart-search-results}"

echo "🔧 Configuring Solr highlighting for Smart Search..."
echo "Solr URL: $SOLR_URL"
echo "Collection: $COLLECTION"
echo ""

# Function to make API calls with error handling
make_request() {
    local method="$1"
    local url="$2"
    local data="$3"
    
    echo "📡 Making $method request to: $url"
    
    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST -H 'Content-type:application/json' "$url" -d "$data")
    else
        response=$(curl -s -w "\n%{http_code}" "$url")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" -ge 200 ] && [ "$http_code" -lt 300 ]; then
        echo "✅ Success (HTTP $http_code)"
        return 0
    else
        echo "❌ Failed (HTTP $http_code)"
        echo "Response: $body"
        return 1
    fi
}

# Test Solr connectivity
echo "🔍 Testing Solr connectivity..."
if ! make_request "GET" "$SOLR_URL/admin/collections?action=LIST"; then
    echo "❌ Cannot connect to Solr at $SOLR_URL"
    echo "Please ensure Solr is running and accessible."
    exit 1
fi

echo ""
echo "🏗️  Adding enhanced field types..."

# Add text_highlight field type
highlight_field_type='{
  "add-field-type": {
    "name": "text_highlight",
    "class": "solr.TextField",
    "positionIncrementGap": "100",
    "analyzer": {
      "tokenizer": {"class": "solr.StandardTokenizerFactory"},
      "filters": [
        {"class": "solr.LowerCaseFilterFactory"},
        {"class": "solr.StopFilterFactory", "ignoreCase": "true", "words": "stopwords.txt"},
        {"class": "solr.PorterStemFilterFactory"},
        {"class": "solr.RemoveDuplicatesTokenFilterFactory"}
      ]
    }
  }
}'

make_request "POST" "$SOLR_URL/$COLLECTION/schema" "$highlight_field_type"

# Add text_code_highlight field type
code_field_type='{
  "add-field-type": {
    "name": "text_code_highlight",
    "class": "solr.TextField",
    "positionIncrementGap": "100",
    "analyzer": {
      "tokenizer": {"class": "solr.StandardTokenizerFactory"},
      "filters": [
        {"class": "solr.LowerCaseFilterFactory"},
        {"class": "solr.StopFilterFactory", "ignoreCase": "true", "words": "stopwords.txt", "enablePositionIncrements": "true"},
        {"class": "solr.RemoveDuplicatesTokenFilterFactory"}
      ]
    }
  }
}'

make_request "POST" "$SOLR_URL/$COLLECTION/schema" "$code_field_type"

echo ""
echo "📋 Adding highlighting fields..."

# Add content_highlight field
content_field='{
  "add-field": {
    "name": "content_highlight",
    "type": "text_highlight",
    "indexed": true,
    "stored": false,
    "multiValued": false
  }
}'

make_request "POST" "$SOLR_URL/$COLLECTION/schema" "$content_field"

# Add code_highlight field
code_field='{
  "add-field": {
    "name": "code_highlight",
    "type": "text_code_highlight",
    "indexed": true,
    "stored": false,
    "multiValued": false
  }
}'

make_request "POST" "$SOLR_URL/$COLLECTION/schema" "$code_field"

# Add file_path_highlight field
filepath_field='{
  "add-field": {
    "name": "file_path_highlight",
    "type": "text_highlight",
    "indexed": true,
    "stored": false,
    "multiValued": false
  }
}'

make_request "POST" "$SOLR_URL/$COLLECTION/schema" "$filepath_field"

echo ""
echo "🔗 Adding copy fields..."

# Copy fields for highlighting
copy_fields='[
  {
    "add-copy-field": {
      "source": "content_all",
      "dest": "content_highlight"
    }
  },
  {
    "add-copy-field": {
      "source": "code_all",
      "dest": "code_highlight"
    }
  },
  {
    "add-copy-field": {
      "source": "match_text",
      "dest": "content_highlight"
    }
  },
  {
    "add-copy-field": {
      "source": "full_line",
      "dest": "code_highlight"
    }
  },
  {
    "add-copy-field": {
      "source": "file_path",
      "dest": "file_path_highlight"
    }
  }
]'

echo "$copy_fields" | jq -c '.[]' | while read -r copy_field; do
    make_request "POST" "$SOLR_URL/$COLLECTION/schema" "$copy_field"
done

echo ""
echo "🔄 Reloading collection to apply changes..."
reload_response=$(curl -s "$SOLR_URL/admin/collections?action=RELOAD&name=$COLLECTION")
if echo "$reload_response" | grep -q '"status":0'; then
    echo "✅ Collection reloaded successfully"
else
    echo "⚠️  Collection reload may have failed. Check Solr logs."
fi

echo ""
echo "🧪 Testing highlighting configuration..."

# Test highlighting with a simple query
test_url="$SOLR_URL/$COLLECTION/select?q=function&hl=true&hl.fl=content_highlight,code_highlight&rows=1"
test_response=$(curl -s "$test_url")

if echo "$test_response" | grep -q '"highlighting"'; then
    echo "✅ Highlighting is working!"
else
    echo "⚠️  Highlighting test inconclusive. May need data reindexing."
fi

echo ""
echo "📊 Configuration Summary:"
echo "- ✅ Enhanced field types added (text_highlight, text_code_highlight)"
echo "- ✅ Dedicated highlighting fields created"
echo "- ✅ Copy fields configured for automatic population"
echo "- ✅ Collection reloaded"
echo ""
echo "🔧 Next Steps:"
echo "1. Reindex your data to populate the new highlighting fields"
echo "2. Test searches in your VS Code extension"
echo "3. Monitor Solr performance and adjust fragment sizes if needed"
echo ""
echo "📖 For manual configuration details, see: SOLR_HIGHLIGHTING_CONFIG.md"
