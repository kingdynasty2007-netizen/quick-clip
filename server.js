/**
 * Quick Clip server
 * Express + Socket.IO with bounded, ephemeral in-memory rooms.
 */

const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const DEFAULTS = Object.freeze({
  port: 3000,
  textFileBytes: 1024 * 1024,
  pdfFileBytes: 10 * 1024 * 1024,
  filesPerRoom: 20,
  roomBytes: 25 * 1024 * 1024,
  chatMessageBytes: 4 * 1024,
  chatRetention: 200,
  roomIdleMs: 2 * 60 * 60 * 1000,
  reconnectGraceMs: 2 * 60 * 1000,
  maxSocketPayloadBytes: 12 * 1024 * 1024,
  maxPdfPages: 500
});

const TEXT_EXTENSIONS = new Set([
  "txt", "js", "jsx", "ts", "tsx", "py", "html", "css", "json", "md",
  "csv", "xml", "yaml", "yml", "sh", "sql", "java", "c", "cpp", "go", "rs"
]);

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function loadConfig(overrides = {}) {
  return {
    port: overrides.port ?? positiveInteger(process.env.PORT, DEFAULTS.port),
    textFileBytes: overrides.textFileBytes ?? positiveInteger(process.env.TEXT_FILE_MAX_BYTES, DEFAULTS.textFileBytes),
    pdfFileBytes: overrides.pdfFileBytes ?? positiveInteger(process.env.PDF_FILE_MAX_BYTES, DEFAULTS.pdfFileBytes),
    filesPerRoom: overrides.filesPerRoom ?? positiveInteger(process.env.FILES_PER_ROOM, DEFAULTS.filesPerRoom),
    roomBytes: overrides.roomBytes ?? positiveInteger(process.env.ROOM_MAX_BYTES, DEFAULTS.roomBytes),
    chatMessageBytes: overrides.chatMessageBytes ?? positiveInteger(process.env.CHAT_MESSAGE_MAX_BYTES, DEFAULTS.chatMessageBytes),
    chatRetention: overrides.chatRetention ?? positiveInteger(process.env.CHAT_RETENTION, DEFAULTS.chatRetention),
    roomIdleMs: overrides.roomIdleMs ?? positiveInteger(process.env.ROOM_IDLE_MS, DEFAULTS.roomIdleMs),
    reconnectGraceMs: overrides.reconnectGraceMs ?? positiveInteger(process.env.RECONNECT_GRACE_MS, DEFAULTS.reconnectGraceMs),
    maxSocketPayloadBytes: overrides.maxSocketPayloadBytes ?? positiveInteger(process.env.SOCKET_MAX_PAYLOAD_BYTES, DEFAULTS.maxSocketPayloadBytes),
    maxPdfPages: overrides.maxPdfPages ?? positiveInteger(process.env.PDF_MAX_PAGES, DEFAULTS.maxPdfPages),
    allowedOrigins: overrides.allowedOrigins ?? String(process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean)
  };
}

function applicationError(code, message, details) {
  return { code, message, ...(details ? { details } : {}) };
}

function normalizeRoomId(roomId) {
  if (typeof roomId !== "string") return null;
  const normalized = roomId.trim().toLowerCase();
  return /^qc-[a-z0-9]{3,32}$/.test(normalized) ? normalized : null;
}

function normalizeClientId(clientId, socketId) {
  if (clientId === undefined || clientId === null || clientId === "") return socketId;
  if (typeof clientId !== "string") return null;
  const normalized = clientId.trim();
  return /^[a-zA-Z0-9_-]{8,80}$/.test(normalized) ? normalized : null;
}

function normalizeFilename(filename) {
  if (typeof filename !== "string") return null;
  const withoutPath = path.posix.basename(filename.replace(/\\/g, "/"));
  const normalized = withoutPath.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 120);
  if (!normalized || normalized === "." || normalized === "..") return null;
  return normalized;
}

function extensionOf(filename) {
  const extension = path.extname(filename).slice(1).toLowerCase();
  return extension || null;
}

function toBuffer(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof ArrayBuffer) return Buffer.from(data);
  if (ArrayBuffer.isView(data)) return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  if (data && data.type === "Buffer" && Array.isArray(data.data)) return Buffer.from(data.data);
  return null;
}

function roomFileBytes(room) {
  return room.files.reduce((total, file) => total + file.size, 0);
}

function serializeFile(file) {
  if (file.kind === "pdf") {
    return {
      id: file.id,
      name: file.name,
      kind: file.kind,
      mimeType: file.mimeType,
      size: file.size,
      data: file.data
    };
  }
  return {
    id: file.id,
    name: file.name,
    kind: file.kind,
    mimeType: file.mimeType,
    size: file.size,
    content: file.content
  };
}

function validateIncomingFile(payload, config) {
  if (!payload || typeof payload !== "object") {
    return { error: applicationError("INVALID_FILE", "The file payload is invalid.") };
  }
  const name = normalizeFilename(payload.name);
  if (!name) return { error: applicationError("INVALID_FILENAME", "Choose a valid filename.") };
  const extension = extensionOf(name);
  if (!extension) return { error: applicationError("UNSUPPORTED_FILE", "The file must have a supported extension.") };

  if (extension === "pdf") {
    const data = toBuffer(payload.data);
    if (!data || data.length === 0) {
      return { error: applicationError("INVALID_PDF", "The PDF contains no readable data.") };
    }
    if (data.length > config.pdfFileBytes) {
      return { error: applicationError("FILE_TOO_LARGE", "PDF files are limited to 10 MiB.", { maxBytes: config.pdfFileBytes }) };
    }
    if (data.subarray(0, 5).toString("ascii") !== "%PDF-") {
      return { error: applicationError("INVALID_PDF", "The file does not have a valid PDF signature.") };
    }
    return {
      file: {
        id: crypto.randomUUID(),
        name,
        kind: "pdf",
        mimeType: "application/pdf",
        size: data.length,
        data
      }
    };
  }

  if (!TEXT_EXTENSIONS.has(extension)) {
    return { error: applicationError("UNSUPPORTED_FILE", "That text or code file type is not supported.") };
  }
  if (typeof payload.content !== "string") {
    return { error: applicationError("INVALID_FILE", "Text files must contain text content.") };
  }
  const size = Buffer.byteLength(payload.content, "utf8");
  if (size > config.textFileBytes) {
    return { error: applicationError("FILE_TOO_LARGE", "Text and code files are limited to 1 MiB.", { maxBytes: config.textFileBytes }) };
  }
  return {
    file: {
      id: crypto.randomUUID(),
      name,
      kind: "text",
      mimeType: "text/plain",
      size,
      content: payload.content
    }
  };
}

function createInitialFile() {
  const content = "Welcome to Quick Clip!";
  return {
    id: crypto.randomUUID(),
    name: "welcome.txt",
    kind: "text",
    mimeType: "text/plain",
    size: Buffer.byteLength(content),
    content
  };
}

async function createQuickClipServer(options = {}) {
  const config = loadConfig(options);
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(express.json({ limit: "64kb", strict: true }));

  const server = http.createServer(app);
  const ioOptions = {
    transports: ["websocket", "polling"],
    maxHttpBufferSize: config.maxSocketPayloadBytes,
    connectionStateRecovery: {
      maxDisconnectionDuration: config.reconnectGraceMs,
      skipMiddlewares: false
    }
  };
  if (config.allowedOrigins.length) {
    ioOptions.cors = { origin: config.allowedOrigins, methods: ["GET", "POST"] };
  }
  const io = new Server(server, ioOptions);
  const rooms = new Map();
  let frontendConfigured = false;

  function respond(acknowledgement, response) {
    if (typeof acknowledgement === "function") acknowledgement(response);
  }

  function emitApplicationError(socket, error, acknowledgement, includeLegacyError = false) {
    socket.emit("appError", error);
    if (includeLegacyError) socket.emit("error", error.message);
    respond(acknowledgement, { ok: false, error });
  }

  function clearTimer(timer) {
    if (timer) clearTimeout(timer);
  }

  function deleteRoom(roomId, reason = "expired") {
    const room = rooms.get(roomId);
    if (!room) return;
    clearTimer(room.expiryTimer);
    for (const timer of room.disconnectTimers.values()) clearTimer(timer);
    for (const timer of room.contentTimers) clearTimer(timer);
    room.disconnectTimers.clear();
    room.contentTimers.clear();
    rooms.delete(roomId);
    io.to(roomId).emit("roomExpired", { roomId, reason });
  }

  function scheduleRoomExpiry(room) {
    clearTimer(room.expiryTimer);
    room.expiryTimer = null;
    if (room.members.size > 0) return;
    const delay = Math.max(1, room.lastActivity + config.roomIdleMs - Date.now());
    room.expiryTimer = setTimeout(() => deleteRoom(room.id, "idle"), delay);
    room.expiryTimer.unref?.();
  }

  function touchRoom(room) {
    room.lastActivity = Date.now();
    clearTimer(room.expiryTimer);
    room.expiryTimer = null;
  }

  function createRoom(roomId) {
    const now = Date.now();
    const room = {
      id: roomId,
      files: [createInitialFile()],
      members: new Map(),
      messages: [],
      content: [],
      createdAt: now,
      lastActivity: now,
      expiryTimer: null,
      disconnectTimers: new Map(),
      contentTimers: new Set()
    };
    rooms.set(roomId, room);
    return room;
  }

  function getSnapshot(room) {
    return {
      files: room.files.map(serializeFile),
      users: room.members.size,
      messages: room.messages,
      limits: {
        textFileBytes: config.textFileBytes,
        pdfFileBytes: config.pdfFileBytes,
        filesPerRoom: config.filesPerRoom,
        roomBytes: config.roomBytes,
        chatMessageBytes: config.chatMessageBytes,
        chatRetention: config.chatRetention,
        roomIdleMs: config.roomIdleMs,
        reconnectGraceMs: config.reconnectGraceMs,
        maxPdfPages: config.maxPdfPages
      }
    };
  }

  function getMembership(socket, roomIdValue) {
    const roomId = normalizeRoomId(roomIdValue);
    if (!roomId) return { error: applicationError("INVALID_ROOM", "Use a room code such as QC-7XK29P.") };
    const room = rooms.get(roomId);
    if (!room) return { error: applicationError("ROOM_NOT_FOUND", "This room no longer exists.") };
    const clientId = socket.data.clientId;
    const member = clientId ? room.members.get(clientId) : null;
    if (!member || member.socketId !== socket.id) {
      return { error: applicationError("NOT_IN_ROOM", "Join the room before changing its content.") };
    }
    return { room, roomId, clientId };
  }

  function removeMember(roomId, clientId, socketId, reason) {
    const room = rooms.get(roomId);
    if (!room) return;
    const member = room.members.get(clientId);
    if (!member || (socketId && member.socketId !== socketId)) return;
    room.members.delete(clientId);
    clearTimer(room.disconnectTimers.get(clientId));
    room.disconnectTimers.delete(clientId);
    io.to(roomId).emit("userLeft", {
      userId: socketId || member.socketId,
      userCount: room.members.size,
      reason
    });
    scheduleRoomExpiry(room);
  }

  function scheduleDisconnectRemoval(socket) {
    const { roomId, clientId } = socket.data;
    if (!roomId || !clientId) return;
    const room = rooms.get(roomId);
    if (!room || !room.members.has(clientId)) return;
    clearTimer(room.disconnectTimers.get(clientId));
    const timer = setTimeout(() => {
      removeMember(roomId, clientId, socket.id, "disconnect-timeout");
    }, config.reconnectGraceMs);
    timer.unref?.();
    room.disconnectTimers.set(clientId, timer);
  }

  io.on("connection", (socket) => {
    socket.on("joinRoom", (payload, acknowledgement) => {
      const rawRoomId = typeof payload === "string" ? payload : payload?.roomId;
      const roomId = normalizeRoomId(rawRoomId);
      const clientId = normalizeClientId(typeof payload === "object" ? payload?.clientId : null, socket.id);
      if (!roomId) {
        emitApplicationError(socket, applicationError("INVALID_ROOM", "Use a room code such as QC-7XK29P."), acknowledgement, true);
        return;
      }
      if (!clientId) {
        emitApplicationError(socket, applicationError("INVALID_CLIENT", "The device identifier is invalid."), acknowledgement, true);
        return;
      }

      if (socket.data.roomId && socket.data.roomId !== roomId) {
        removeMember(socket.data.roomId, socket.data.clientId, socket.id, "switched-room");
        socket.leave(socket.data.roomId);
      }

      const room = rooms.get(roomId) || createRoom(roomId);
      const previous = room.members.get(clientId);
      const wasPresent = Boolean(previous);
      clearTimer(room.disconnectTimers.get(clientId));
      room.disconnectTimers.delete(clientId);
      if (previous?.socketId && previous.socketId !== socket.id) {
        io.sockets.sockets.get(previous.socketId)?.leave(roomId);
      }
      room.members.set(clientId, { socketId: socket.id, joinedAt: previous?.joinedAt || Date.now() });
      socket.data.roomId = roomId;
      socket.data.clientId = clientId;
      socket.join(roomId);
      touchRoom(room);

      socket.emit("roomData", getSnapshot(room));
      if (!wasPresent) {
        socket.to(roomId).emit("userJoined", { userId: socket.id, userCount: room.members.size });
      } else {
        io.to(roomId).emit("presenceUpdate", { userCount: room.members.size, recovered: socket.recovered });
      }
      respond(acknowledgement, { ok: true, roomId, recovered: socket.recovered, users: room.members.size });
    });

    socket.on("addFile", (payload, acknowledgement) => {
      const membership = getMembership(socket, payload?.roomId);
      if (membership.error) return emitApplicationError(socket, membership.error, acknowledgement);
      const { room, roomId } = membership;
      if (room.files.length >= config.filesPerRoom) {
        return emitApplicationError(socket, applicationError("FILE_LIMIT", `A room can contain up to ${config.filesPerRoom} files.`), acknowledgement);
      }
      const result = validateIncomingFile(payload?.file, config);
      if (result.error) return emitApplicationError(socket, result.error, acknowledgement);
      if (roomFileBytes(room) + result.file.size > config.roomBytes) {
        return emitApplicationError(socket, applicationError("ROOM_SIZE_LIMIT", "This room has reached its 25 MiB file limit."), acknowledgement);
      }
      room.files.push(result.file);
      touchRoom(room);
      io.to(roomId).emit("fileListUpdate", room.files.map(serializeFile));
      respond(acknowledgement, { ok: true, file: serializeFile(result.file) });
    });

    socket.on("deleteFile", (payload, acknowledgement) => {
      const membership = getMembership(socket, payload?.roomId);
      if (membership.error) return emitApplicationError(socket, membership.error, acknowledgement);
      const { room, roomId } = membership;
      const index = Number.isInteger(payload?.fileIndex)
        ? payload.fileIndex
        : room.files.findIndex((file) => file.id === payload?.fileId);
      if (index < 0 || index >= room.files.length) {
        return emitApplicationError(socket, applicationError("FILE_NOT_FOUND", "That file is no longer in the room."), acknowledgement);
      }
      const [removed] = room.files.splice(index, 1);
      touchRoom(room);
      io.to(roomId).emit("fileListUpdate", room.files.map(serializeFile));
      respond(acknowledgement, { ok: true, fileId: removed.id });
    });

    socket.on("editorUpdate", (payload, acknowledgement) => {
      const membership = getMembership(socket, payload?.roomId);
      if (membership.error) return emitApplicationError(socket, membership.error, acknowledgement);
      const { room, roomId } = membership;
      const fileIndex = payload?.fileIndex;
      const file = Number.isInteger(fileIndex) ? room.files[fileIndex] : null;
      if (!file || file.kind !== "text") {
        return emitApplicationError(socket, applicationError("FILE_NOT_EDITABLE", "Choose a text file before editing."), acknowledgement);
      }
      if (typeof payload?.content !== "string") {
        return emitApplicationError(socket, applicationError("INVALID_CONTENT", "Editor content must be text."), acknowledgement);
      }
      const size = Buffer.byteLength(payload.content, "utf8");
      if (size > config.textFileBytes) {
        return emitApplicationError(socket, applicationError("FILE_TOO_LARGE", "Text and code files are limited to 1 MiB."), acknowledgement);
      }
      if (roomFileBytes(room) - file.size + size > config.roomBytes) {
        return emitApplicationError(socket, applicationError("ROOM_SIZE_LIMIT", "This room has reached its 25 MiB file limit."), acknowledgement);
      }
      file.content = payload.content;
      file.size = size;
      touchRoom(room);
      socket.to(roomId).emit("editorUpdate", { content: file.content, fileIndex, fileId: file.id });
      respond(acknowledgement, { ok: true, fileId: file.id, size });
    });

    socket.on("sendContent", (payload, acknowledgement) => {
      const membership = getMembership(socket, payload?.roomId);
      if (membership.error) return emitApplicationError(socket, membership.error, acknowledgement);
      const { room, roomId } = membership;
      const result = validateIncomingFile(payload?.file, config);
      if (result.error) return emitApplicationError(socket, result.error, acknowledgement);
      const timerEnabled = payload?.timerEnabled === true;
      const timerMinutes = Number(payload?.timerMinutes);
      if (timerEnabled && (!Number.isFinite(timerMinutes) || timerMinutes <= 0 || timerMinutes > 60)) {
        return emitApplicationError(socket, applicationError("INVALID_TIMER", "Choose a timer between 1 and 60 minutes."), acknowledgement);
      }
      const contentItem = {
        id: crypto.randomUUID(),
        file: result.file,
        timestamp: new Date().toISOString(),
        sender: socket.data.clientId,
        timerEnabled,
        timerMinutes: timerEnabled ? timerMinutes : null
      };
      room.content.push(contentItem);
      if (room.content.length > 50) room.content.splice(0, room.content.length - 50);
      touchRoom(room);
      io.to(roomId).emit("contentReceived", {
        file: serializeFile(result.file),
        sender: socket.id,
        timerEnabled,
        timerMinutes: contentItem.timerMinutes
      });

      if (timerEnabled) {
        const timer = setTimeout(() => {
          const currentRoom = rooms.get(roomId);
          if (!currentRoom) return;
          currentRoom.content = [];
          for (const activeTimer of currentRoom.contentTimers) clearTimer(activeTimer);
          currentRoom.contentTimers.clear();
          io.to(roomId).emit("contentDeleted", { message: "Timer expired. Sent content has been auto-deleted." });
        }, timerMinutes * 60 * 1000);
        timer.unref?.();
        room.contentTimers.add(timer);
      }
      respond(acknowledgement, { ok: true, contentId: contentItem.id });
    });

    socket.on("sendMessage", (payload, acknowledgement) => {
      const membership = getMembership(socket, payload?.roomId);
      if (membership.error) return respond(acknowledgement, { ok: false, error: membership.error });
      const { room, roomId, clientId } = membership;
      if (typeof payload?.text !== "string") {
        return respond(acknowledgement, { ok: false, error: applicationError("INVALID_MESSAGE", "Messages must be plain text.") });
      }
      const text = payload.text.trim();
      if (!text) {
        return respond(acknowledgement, { ok: false, error: applicationError("EMPTY_MESSAGE", "Write a message before sending.") });
      }
      if (Buffer.byteLength(text, "utf8") > config.chatMessageBytes) {
        return respond(acknowledgement, { ok: false, error: applicationError("MESSAGE_TOO_LARGE", "Messages are limited to 4 KiB.") });
      }
      const message = {
        id: crypto.randomUUID(),
        clientMessageId: typeof payload.clientMessageId === "string" ? payload.clientMessageId.slice(0, 80) : null,
        text,
        sender: clientId,
        sentAt: new Date().toISOString()
      };
      room.messages.push(message);
      if (room.messages.length > config.chatRetention) {
        room.messages.splice(0, room.messages.length - config.chatRetention);
      }
      touchRoom(room);
      io.to(roomId).emit("chatMessage", message);
      respond(acknowledgement, { ok: true, message });
    });

    socket.on("leaveRoom", (payload, acknowledgement) => {
      const rawRoomId = typeof payload === "string" ? payload : payload?.roomId;
      const roomId = normalizeRoomId(rawRoomId);
      if (!roomId || socket.data.roomId !== roomId) {
        return respond(acknowledgement, { ok: false, error: applicationError("NOT_IN_ROOM", "This device is not in that room.") });
      }
      socket.leave(roomId);
      removeMember(roomId, socket.data.clientId, socket.id, "left");
      socket.data.roomId = null;
      socket.data.clientId = null;
      respond(acknowledgement, { ok: true });
    });

    socket.on("disconnect", () => {
      scheduleDisconnectRemoval(socket);
    });
  });

  async function configureFrontend() {
    if (frontendConfigured) return;
    frontendConfigured = true;
    const isDevelopment = options.development ?? process.argv.includes("--dev");
    if (isDevelopment) {
      const { createServer: createViteServer } = await import("vite");
      const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
      app.use(vite.middlewares);
      app.use("*", async (req, res, next) => {
        try {
          const source = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
          const html = await vite.transformIndexHtml(req.originalUrl, source);
          res.status(200).set({ "Content-Type": "text/html" }).end(html);
        } catch (error) {
          vite.ssrFixStacktrace(error);
          next(error);
        }
      });
    } else {
      const distPath = path.join(__dirname, "dist");
      app.use(express.static(distPath, { index: false, maxAge: "1h" }));
      app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
    }
    app.use((error, req, res, next) => {
      if (res.headersSent) return next(error);
      const status = error?.type === "entity.too.large" ? 413 : 500;
      res.status(status).json({
        error: {
          code: status === 413 ? "PAYLOAD_TOO_LARGE" : "SERVER_ERROR",
          message: status === 413 ? "The request payload is too large." : "The server could not complete the request."
        }
      });
    });
  }

  async function start() {
    await configureFrontend();
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(config.port, () => {
        server.off("error", reject);
        resolve();
      });
    });
    return server.address();
  }

  async function stop() {
    for (const roomId of [...rooms.keys()]) deleteRoom(roomId, "shutdown");
    await new Promise((resolve) => io.close(resolve));
    if (server.listening) {
      await new Promise((resolve) => server.close(resolve));
    }
  }

  return { app, config, io, rooms, server, start, stop };
}

if (require.main === module) {
  createQuickClipServer()
    .then(async (quickClip) => {
      const address = await quickClip.start();
      const port = typeof address === "object" && address ? address.port : quickClip.config.port;
      console.log(`Quick Clip running on port ${port}`);
      process.on("SIGINT", async () => {
        console.log("Shutting down...");
        await quickClip.stop();
        process.exit(0);
      });
    })
    .catch((error) => {
      console.error("Failed to start Quick Clip:", error);
      process.exit(1);
    });
}

module.exports = {
  DEFAULTS,
  TEXT_EXTENSIONS,
  createQuickClipServer,
  normalizeFilename,
  normalizeRoomId,
  validateIncomingFile
};
