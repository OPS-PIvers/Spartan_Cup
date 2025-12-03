
function testToSnakeCaseBug() {
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

  Logger.log("Running testToSnakeCaseBug...");

  // Test Case: Numeric 0
  try {
    const res0 = toSnakeCase(0);
    Logger.log("Result for 0: '" + res0 + "'");
    Logger.assert(res0 === "0", "Numeric 0 should be converted to string '0'");
  } catch (e) {
    Logger.log("Error with numeric 0: " + e.message);
    // Continue testing
  }

  // Test Case: Numeric 1
  try {
    const res1 = toSnakeCase(1);
    Logger.log("Result for 1: '" + res1 + "'");
    Logger.assert(res1 === "1", "Numeric 1 should be converted to string '1'");
  } catch (e) {
    Logger.log("Error with numeric 1: " + e.message);
  }
}
