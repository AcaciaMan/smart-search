#!/bin/bash

# Test script to verify Solr configuration
# This script tests if the smart-search-results core can be created successfully

SOLR_URL="${SOLR_URL:-http://localhost:8983/solr}"
CORE_NAME="smart-search-results"

echo "🧪 Testing Solr Configuration..."
echo "Solr URL: $SOLR_URL"
echo "Core Name: $CORE_NAME"
echo ""

# Function to check if Solr is running
check_solr() {
    echo "🔍 Checking if Solr is running..."
    if curl -s "$SOLR_URL/admin/info/system" >/dev/null 2>&1; then
        echo "✅ Solr is running"
        return 0
    else
        echo "❌ Solr is not running at $SOLR_URL"
        echo "Please start Solr and try again."
        return 1
    fi
}

# Function to delete existing core (for testing)
delete_core() {
    echo "🗑️  Deleting existing core (if exists)..."
    curl -s "$SOLR_URL/admin/cores?action=UNLOAD&core=$CORE_NAME&deleteIndex=true&deleteDataDir=true&deleteInstanceDir=true" >/dev/null 2>&1
    echo "Done (errors are normal if core didn't exist)"
}

# Function to create core
create_core() {
    echo "🏗️  Creating core with configuration..."
    local config_dir="$(pwd)/solr/smart-search-results/conf"
    
    if [ ! -d "$config_dir" ]; then
        echo "❌ Configuration directory not found: $config_dir"
        echo "Please ensure you're running this from the smart-search root directory"
        return 1
    fi
    
    # Create core using the configuration files
    response=$(curl -s -w "\n%{http_code}" "$SOLR_URL/admin/cores?action=CREATE&name=$CORE_NAME&configSet=_default&instanceDir=$CORE_NAME")
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n -1)
    
    if [ "$http_code" -eq 200 ]; then
        echo "✅ Core created successfully"
        return 0
    else
        echo "❌ Failed to create core (HTTP $http_code)"
        echo "Response: $body"
        return 1
    fi
}

# Function to test core functionality
test_core() {
    echo "🧪 Testing core functionality..."
    
    # Test basic query
    response=$(curl -s "$SOLR_URL/$CORE_NAME/select?q=*:*&rows=0")
    
    if echo "$response" | grep -q '"numFound"'; then
        echo "✅ Core is responding to queries"
    else
        echo "⚠️  Core query test failed"
        return 1
    fi
    
    # Test highlighting
    response=$(curl -s "$SOLR_URL/$CORE_NAME/select?q=test&hl=true&hl.fl=content_highlight&rows=0")
    
    if echo "$response" | grep -q '"highlighting"'; then
        echo "✅ Highlighting is configured correctly"
    else
        echo "⚠️  Highlighting test failed"
        return 1
    fi
    
    return 0
}

# Main execution
main() {
    if ! check_solr; then
        exit 1
    fi
    
    delete_core
    
    if create_core; then
        echo ""
        if test_core; then
            echo ""
            echo "🎉 Success! Solr configuration is working correctly."
            echo ""
            echo "Next steps:"
            echo "1. Copy your configuration files to the Solr instance directory"
            echo "2. Reload the core to apply the configuration"
            echo "3. Test with your VS Code extension"
        else
            echo ""
            echo "⚠️  Core created but some tests failed. Check configuration."
        fi
    else
        echo ""
        echo "❌ Failed to create core. Check the error message above."
        echo "Common issues:"
        echo "- Configuration syntax errors"
        echo "- Missing field types or fields"
        echo "- Type mismatches (int vs float vs string)"
    fi
}

main "$@"
