const { after, before, test } = require("node:test");
const assert = require("node:assert/strict");
const { io } = require("socket.io-client");
const { createQuickClipServer } = require("../server");

let instance;
let baseUrl;

function event(socket, name, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${name}`)), timeout);
    socket.once(name, (value) => { clearTimeout(timer); resolve(value); });
  });
}

function emitAck(socket, name, payload, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out acknowledging ${name}`)), timeout);
    socket.emit(name, payload, (value) => { clearTimeout(timer); resolve(value); });
  });
}

function connect() {
  return io(baseUrl, { transports: ["websocket"], forceNew: true });
}

before(async () => {
  instance = await createQuickClipServer({ port: 0, roomIdleMs: 200, reconnectGraceMs: 100 });
  const address = await instance.start();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => instance?.stop());

test("serves the built React application", async () => {
  const health = await fetch(`${baseUrl}/health`);
  assert.deepEqual(await health.json(), { status: "ok" });
  const response = await fetch(baseUrl);
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /\/assets\/index-/);
});

test("supports room, file, editor, chat, timer, presence, and leave flows", async (t) => {
  const first = connect();
  const second = connect();
  t.after(() => { first.disconnect(); second.disconnect(); });
  await Promise.all([event(first, "connect"), event(second, "connect")]);

  const firstData = event(first, "roomData");
  assert.equal((await emitAck(first, "joinRoom", { roomId: "qc-audit1", clientId: "client-one" })).ok, true);
  assert.equal((await firstData).users, 1);

  const joined = event(first, "userJoined");
  const secondData = event(second, "roomData");
  assert.equal((await emitAck(second, "joinRoom", { roomId: "qc-audit1", clientId: "client-two" })).ok, true);
  assert.equal((await secondData).users, 2);
  assert.equal((await joined).userCount, 2);

  const fileUpdate = event(second, "fileListUpdate");
  assert.equal((await emitAck(first, "addFile", { roomId: "qc-audit1", file: { name: "notes.txt", content: "Shared baseline" } })).ok, true);
  assert.equal((await fileUpdate)[1].content, "Shared baseline");

  const invalidPdf = await emitAck(first, "addFile", { roomId: "qc-audit1", file: { name: "bad.pdf", kind: "pdf", data: Buffer.from("not a pdf") } });
  assert.equal(invalidPdf.ok, false);
  assert.equal(invalidPdf.error.code, "INVALID_PDF");

  const edit = event(second, "editorUpdate");
  assert.equal((await emitAck(first, "editorUpdate", { roomId: "qc-audit1", fileIndex: 1, content: "Live edit" })).ok, true);
  assert.equal((await edit).content, "Live edit");

  const chat = event(second, "chatMessage");
  assert.equal((await emitAck(first, "sendMessage", { roomId: "qc-audit1", text: "Hello room" })).ok, true);
  assert.equal((await chat).text, "Hello room");

  const received = event(second, "contentReceived");
  const expired = event(second, "contentDeleted", 4000);
  assert.equal((await emitAck(first, "sendContent", { roomId: "qc-audit1", file: { name: "notes.txt", content: "Timed" }, timerEnabled: true, timerMinutes: 0.001 })).ok, true);
  assert.equal((await received).file.content, "Timed");
  assert.match((await expired).message, /expired/i);

  const left = event(first, "userLeft");
  assert.equal((await emitAck(second, "leaveRoom", "qc-audit1")).ok, true);
  assert.equal((await left).userCount, 1);
});

test("rejects invalid rooms and oversized text", async (t) => {
  const socket = connect();
  t.after(() => socket.disconnect());
  await event(socket, "connect");
  assert.equal((await emitAck(socket, "joinRoom", { roomId: "bad", clientId: "client-three" })).ok, false);
  await emitAck(socket, "joinRoom", { roomId: "qc-limits", clientId: "client-three" });
  const result = await emitAck(socket, "addFile", { roomId: "qc-limits", file: { name: "huge.txt", content: "x".repeat(1024 * 1024 + 1) } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "FILE_TOO_LARGE");
});
