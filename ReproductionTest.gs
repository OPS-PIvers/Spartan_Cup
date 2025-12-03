
/**
 * Tests for Utils.gs toSnakeCase function.
 * Covers bug fix for numeric inputs and standard behavior.
 */
function testToSnakeCase() {
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

  Logger.log("Running testToSnakeCase...");

  // Test Case: Numeric 0 (The Bug Fix)
  const res0 = toSnakeCase(0);
  Logger.assert(res0 === "0", "Numeric 0 should be converted to string '0'");

  // Test Case: Numeric 1 (Runtime Error Fix)
  const res1 = toSnakeCase(1);
  Logger.assert(res1 === "1", "Numeric 1 should be converted to string '1'");

  // Test Case: Null input
  const resNull = toSnakeCase(null);
  Logger.assert(resNull === "", "Null input should return empty string");

  // Test Case: Undefined input
  const resUndefined = toSnakeCase(undefined);
  Logger.assert(resUndefined === "", "Undefined input should return empty string");

  // Test Case: Empty string
  const resEmpty = toSnakeCase("");
  Logger.assert(resEmpty === "", "Empty string input should return empty string");

  // Test Case: Standard string
  const resStandard = toSnakeCase("Hello World");
  Logger.assert(resStandard === "hello_world", "'Hello World' should become 'hello_world'");

  // Test Case: Special characters
  // Logic: Lowercase -> "test-case!" -> replace non-alphanumeric except _ -> "testcase"
  const resSpecial = toSnakeCase("Test-Case!");
  Logger.assert(resSpecial === "testcase", "'Test-Case!' should become 'testcase'");

  Logger.log("All tests passed!");
}
