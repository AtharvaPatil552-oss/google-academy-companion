import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";

const BASE_URL = "http://localhost:3000";
const AUTH_TOKEN = "valid-test-token";

async function runTests() {
  console.log("▶ Starting Google Academy Companion Regression Tests...\n");

  const testUid = "test_learner_" + Date.now();

  // Helper for requests with custom uid
  const authFetch = (urlPath: string, options: any = {}) => {
    const headers = {
      "Authorization": `Bearer ${AUTH_TOKEN}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    return fetch(`${BASE_URL}${urlPath}`, {
      ...options,
      headers
    });
  };

  // 1. Health check
  console.log("Test 1: Health check");
  const healthRes = await fetch(`${BASE_URL}/api/health`);
  assert.strictEqual(healthRes.status, 200);
  const healthData: any = await healthRes.json();
  assert.strictEqual(healthData.status, "ok");
  console.log("✓ Health check OK\n");

  // 2. Clean startup: Verify no hardcoded demo workspaces for a new user
  console.log("Test 2: Verify zero default workspaces for clean state");
  // We can pass a bearer token containing a JWT payload with testUid
  const base64Payload = Buffer.from(JSON.stringify({ sub: testUid })).toString("base64");
  const userToken = `header.${base64Payload}.signature`;

  const wsListRes = await fetch(`${BASE_URL}/api/workspaces`, {
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.strictEqual(wsListRes.status, 200);
  const wsListData: any = await wsListRes.json();
  assert.ok(Array.isArray(wsListData.workspaces));
  assert.strictEqual(wsListData.workspaces.length, 0, "Default state should have 0 workspaces (no hardcoded demos)");
  console.log("✓ Zero hardcoded workspaces verified\n");

  // 3. Strict Chat vs Resource Separation
  console.log("Test 3: Normal Chat separation (does not create workspaces or auto-generate resources)");
  const chatRes = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ question: "Hello, can you explain the concept of entropy?" })
  });
  assert.strictEqual(chatRes.status, 200);
  const chatData: any = await chatRes.json();
  assert.ok(chatData.answer, "Chat should return an answer");
  // Check workspaces again to ensure none were created by chat
  const wsAfterChat: any = await fetch(`${BASE_URL}/api/workspaces`, {
    headers: { Authorization: `Bearer ${userToken}` }
  }).then(r => r.json());
  assert.strictEqual(wsAfterChat.workspaces.length, 0, "Chat must not create unsolicited workspaces");
  console.log("✓ Strict chat separation verified\n");

  // 4. Workspace Creation with intentFromResources
  console.log("Test 4: Create Workspace with intentFromResources");
  const createRes = await fetch(`${BASE_URL}/api/workspaces`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      learningGoal: "Understand Distributed Consensus Algorithms",
      subject: "Computer Science",
      title: "Raft & Paxos Mastery",
      learningIntent: {
        goal: "Understand Distributed Consensus Algorithms",
        achievement: "Implement Raft consensus in Go",
        depth: "mastery",
        intentFromResources: "Master leader election, log replication, and split-brain safety from whitepapers"
      }
    })
  });
  assert.strictEqual(createRes.status, 201);
  const createData: any = await createRes.json();
  assert.ok(createData.workspace);
  const wsId = createData.workspace.id;
  assert.strictEqual(createData.workspace.title, "Raft & Paxos Mastery");
  assert.ok(Array.isArray(createData.workspace.learningPath));
  assert.ok(Array.isArray(createData.workspace.tasks));
  assert.ok(createData.workspace.analytics);
  assert.ok(createData.workspace.sessionOverview);
  console.log(`✓ Workspace created: ${wsId}\n`);

  // 5. Direct Storage Reference Upload Flow (413 Prevention)
  console.log("Test 5: Add direct Storage Reference resource");
  const storageRefRes = await fetch(`${BASE_URL}/api/workspaces/${wsId}/resources/storage-ref`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      fileName: "Raft_Consensus_Whitepaper_Extended.pdf",
      contentType: "application/pdf",
      size: 52428800, // 50MB file reference
      storagePath: `workspaces/${wsId}/Raft_Consensus_Whitepaper_Extended.pdf`,
      url: "https://storage.googleapis.com/cloud-academy/raft.pdf"
    })
  });
  assert.strictEqual(storageRefRes.status, 201);
  const storageRefData: any = await storageRefRes.json();
  assert.ok(storageRefData.resource);
  assert.strictEqual(storageRefData.resource.title, "Raft_Consensus_Whitepaper_Extended.pdf");
  assert.strictEqual(storageRefData.resource.fileType, "pdf");
  assert.strictEqual(storageRefData.resource.status, "ready");
  assert.ok(storageRefData.resource.intelligence.summary);
  console.log("✓ Direct storage reference resource ingested successfully\n");

  // 6. Resource Operations: Duplicate, Rename, Delete
  console.log("Test 6: Resource management (duplicate, rename, delete)");
  const resId = storageRefData.resource._id;

  // Duplicate
  const dupRes = await fetch(`${BASE_URL}/api/workspaces/${wsId}/resources/${resId}/duplicate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.strictEqual(dupRes.status, 201);
  const dupData: any = await dupRes.json();
  assert.strictEqual(dupData.resource.title, "Raft_Consensus_Whitepaper_Extended.pdf (Copy)");
  const copyResId = dupData.resource._id;

  // Rename
  const renameRes = await fetch(`${BASE_URL}/api/workspaces/${wsId}/resources/${copyResId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ title: "Raft Annotated Notes.pdf" })
  });
  assert.strictEqual(renameRes.status, 200);
  const renameData: any = await renameRes.json();
  assert.strictEqual(renameData.resource.title, "Raft Annotated Notes.pdf");

  // Delete
  const delRes = await fetch(`${BASE_URL}/api/workspaces/${wsId}/resources/${copyResId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${userToken}` }
  });
  assert.strictEqual(delRes.status, 200);
  console.log("✓ Resource operations (duplicate, rename, delete) verified\n");

  // 7. Progress Milestones and Task Toggling
  console.log("Test 7: Progress & Task Toggle");
  const wsDetail: any = await fetch(`${BASE_URL}/api/workspaces/${wsId}`, {
    headers: { Authorization: `Bearer ${userToken}` }
  }).then(r => r.json());
  const firstTaskId = wsDetail.workspace.tasks[0]?.id;
  assert.ok(firstTaskId, "Workspace must have initial tasks");

  const toggleRes = await fetch(`${BASE_URL}/api/workspaces/${wsId}/tasks/toggle`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ taskId: firstTaskId })
  });
  assert.strictEqual(toggleRes.status, 200);
  const toggleData: any = await toggleRes.json();
  assert.strictEqual(typeof toggleData.analytics.overallProgress, "number");
  console.log(`✓ Task toggled, updated progress: ${toggleData.analytics.overallProgress}%\n`);

  // 8. Surfing Mode in Workspace Companion
  console.log("Test 8: Surfing Mode screen context chat");
  const surfChatRes = await fetch(`${BASE_URL}/api/workspaces/${wsId}/chat`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${userToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      question: "Explain what I am looking at and summarize the active screen.",
      surfingEnabled: true,
      screenContext: {
        activeView: "Resources",
        viewSummary: "Viewing Raft_Consensus_Whitepaper_Extended.pdf (50 MB)"
      }
    })
  });
  assert.strictEqual(surfChatRes.status, 200);
  const surfChatData: any = await surfChatRes.json();
  assert.ok(surfChatData.answer);
  assert.strictEqual(surfChatData.surfingActive, true);
  console.log("✓ Surfing mode workspace companion verified\n");

  // 9. Disk Persistence Check
  console.log("Test 9: Disk persistence verification");
  const dataStorePath = path.join(process.cwd(), "data_store.json");
  assert.ok(fs.existsSync(dataStorePath), "data_store.json file must exist on disk");
  const savedData = JSON.parse(fs.readFileSync(dataStorePath, "utf-8"));
  assert.ok(savedData.workspaces[testUid], "User workspaces must be persisted on disk");
  const persistedWs = savedData.workspaces[testUid].find((w: any) => w.id === wsId);
  assert.ok(persistedWs, "Specific workspace must exist in persisted file");
  assert.strictEqual(persistedWs.title, "Raft & Paxos Mastery");
  console.log("✓ Disk persistence verified across storage file\n");

  console.log("==================================================");
  console.log("🎉 ALL REGRESSION TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================");
}

runTests().catch((err) => {
  console.error("\n❌ Regression test failed:", err);
  process.exit(1);
});
