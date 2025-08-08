// Test file for highlighting functionality
function testHighlighting() {
  const searchTerm = "highlighting";
  console.log("Testing search highlighting feature");
  
  // This function demonstrates search highlighting
  if (searchTerm === "highlighting") {
    console.log("Found highlighting term");
  }
  
  return "Search highlighting works!";
}

// Another function for testing
function anotherTest() {
  const message = "highlighting is working";
  return message;
}

// Test with different content
const config = {
  enableHighlighting: true,
  highlightColor: "yellow",
  searchTerms: ["highlighting", "search", "test"]
};

module.exports = { testHighlighting, anotherTest, config };
