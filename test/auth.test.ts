import assert from "node:assert";

const BASE_URL = "http://localhost:3000";

async function runAuthTests() {
  console.log("▶ Starting Authentication Tests...\n");

  // Test 1: Guest Auth
  console.log("Test 1: Guest authentication");
  const guestRes = await fetch(`${BASE_URL}/api/auth/guest`, { method: "POST" });
  assert.strictEqual(guestRes.status, 200);
  const guestData: any = await guestRes.json();
  assert.ok(guestData.token, "Should return auth token");
  assert.strictEqual(guestData.user.provider, "guest");
  console.log("✓ Guest auth passed\n");

  // Test 2: Signup
  console.log("Test 2: Email signup");
  const testEmail = `learner_${Date.now()}@example.com`;
  const signupRes = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: "password123", name: "Test Student" })
  });
  assert.strictEqual(signupRes.status, 201);
  const signupData: any = await signupRes.json();
  assert.ok(signupData.token);
  assert.strictEqual(signupData.user.email, testEmail);
  assert.strictEqual(signupData.user.name, "Test Student");
  console.log("✓ Email signup passed\n");

  // Test 3: Login with wrong password
  console.log("Test 3: Reject incorrect password");
  const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: "wrongpassword" })
  });
  assert.strictEqual(badLoginRes.status, 401);
  console.log("✓ Wrong password rejected\n");

  // Test 4: Login with correct credentials
  console.log("Test 4: Login with correct password");
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: testEmail, password: "password123" })
  });
  assert.strictEqual(loginRes.status, 200);
  const loginData: any = await loginRes.json();
  assert.ok(loginData.token);
  assert.strictEqual(loginData.user.email, testEmail);
  console.log("✓ Login passed\n");

  // Test 5: Verify auth/me with JWT token
  console.log("Test 5: Verify auth/me endpoint");
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Authorization: `Bearer ${loginData.token}` }
  });
  assert.strictEqual(meRes.status, 200);
  const meData: any = await meRes.json();
  assert.strictEqual(meData.email, testEmail);
  assert.strictEqual(meData.authenticated, true);
  console.log("✓ Auth me verification passed\n");

  // Test 6: Google Sign In
  console.log("Test 6: Google Sign In");
  const googleRes = await fetch(`${BASE_URL}/api/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "krishnavr552@gmail.com", name: "Krishna" })
  });
  assert.strictEqual(googleRes.status, 200);
  const googleData: any = await googleRes.json();
  assert.ok(googleData.token);
  assert.strictEqual(googleData.user.email, "krishnavr552@gmail.com");
  assert.strictEqual(googleData.user.name, "Krishna");
  assert.strictEqual(googleData.user.provider, "google");
  console.log("✓ Google sign in passed\n");

  console.log("🎉 ALL AUTH TESTS PASSED SUCCESSFULLY!");
}

runAuthTests().catch(err => {
  console.error("❌ Auth test failed:", err);
  process.exit(1);
});
