/**
 * ConfigTest.gs
 * Tests for configuration and utility functions.
 * Run this function from the Apps Script editor to verify behavior.
 */

function testSafeJSONParse() {
  const Logger = {
    log: function(msg) { console.log(msg); },
    assert: function(condition, message) {
      if (!condition) {
        console.error("FAIL: " + message);
        throw new Error("Test Failed: " + message);
      } else {
        console.log("PASS: " + message);
      }
    }
  };

  Logger.log("Running testSafeJSONParse...");

  // Test Case 1: "null" string with array default (The Bug Fix)
  // Expected: [] (default value), NOT null
  const res1 = safeJSONParse('null', [], "test1");
  Logger.assert(Array.isArray(res1) && res1.length === 0, "'null' with [] default returns []");

  // Test Case 2: "null" string with null default
  // Expected: null
  const res2 = safeJSONParse('null', null, "test2");
  Logger.assert(res2 === null, "'null' with null default returns null");

  // Test Case 3: "null" string with undefined default
  // Expected: null
  const res3 = safeJSONParse('null', undefined, "test3");
  Logger.assert(res3 === null, "'null' with undefined default returns null");

  // Test Case 4: Valid JSON array
  // Expected: ["a"]
  const res4 = safeJSONParse('["a"]', [], "test4");
  Logger.assert(Array.isArray(res4) && res4[0] === "a", "Valid JSON array parses correctly");

  // Test Case 5: Invalid JSON
  // Expected: [] (default value)
  const res5 = safeJSONParse('invalid', [], "test5");
  Logger.assert(Array.isArray(res5) && res5.length === 0, "Invalid JSON returns default value");

  // Test Case 6: Falsy JSON value (0)
  // Expected: 0 (parsed value), NOT default value
  const res6 = safeJSONParse('0', 1, "test6");
  Logger.assert(res6 === 0, "'0' returns 0, not default");

  // Test Case 7: Falsy JSON value (false)
  // Expected: false (parsed value), NOT default value
  const res7 = safeJSONParse('false', true, "test7");
  Logger.assert(res7 === false, "'false' returns false, not default");

  Logger.log("All tests passed!");
}
