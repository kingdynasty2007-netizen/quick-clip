/**
 * Quick Clip Server
 * Real-time code sharing with Socket.IO
 */

const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
app.set("trust proxy", 1); // Important for Render

const server = http.createServer(app);

// Socket.IO configuration
const io = new Server(server, {
  cors: {
    origin: "*", // Fine for V1
    methods: ["GET", "POST"]
  },
  transports: ["websocket", "polling"]
});

const PORT = process.env.PORT || 3000;

// ============ MIDDLEWARE ============
app.use(express.json());

// Keep your current structure (since you refused to move frontend)
app.use(express.static(__dirname));

// Serve frontend
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// ============ ROOM STORAGE ============
const rooms = new Map();

function normalizeRoomId(roomId) {
  return roomId.toLowerCase();
}

function createRoom(roomId) {
  const normalizedId = normalizeRoomId(roomId);

  if (!rooms.has(normalizedId)) {
    rooms.set(normalizedId, {
      files: [
        {
          name: "welcome.txt",
          content: "Welcome to Quick Clip!"
        }
      ],
      users: [],
      content: [],
      createdAt: new Date()
    });

    console.log(`✓ Room created: ${normalizedId}`);
  }

  return rooms.get(normalizedId);
}

function getRoom(roomId) {
  return rooms.get(normalizeRoomId(roomId));
}

function deleteRoom(roomId) {
  const normalizedId = normalizeRoomId(roomId);

  if (rooms.has(normalizedId)) {
    rooms.delete(normalizedId);
    console.log(`✓ Room ${normalizedId} deleted`);
  }
}

function removeUserFromRoom(socketId) {
  for (const [roomId, room] of rooms) {
    const index = room.users.indexOf(socketId);

    if (index !== -1) {
      room.users.splice(index, 1);

      io.to(roomId).emit("userLeft", {
        userId: socketId,
        userCount: room.users.length
      });

      if (room.users.length === 0) {
        deleteRoom(roomId);
      }

      return roomId;
    }
  }

  return null;
}

// ============ SOCKET HANDLERS ============
io.on("connection", (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on("joinRoom", (roomId) => {
    try {
      const normalizedId = normalizeRoomId(roomId);
      socket.join(normalizedId);

      const room = createRoom(roomId);

      if (!room.users.includes(socket.id)) {
        room.users.push(socket.id);
      }

      console.log(
        `${socket.id} joined ${normalizedId} (${room.users.length} users)`
      );

      socket.emit("roomData", {
        files: room.files,
        users: room.users.length
      });

      socket.to(normalizedId).emit("userJoined", {
        userId: socket.id,
        userCount: room.users.length
      });
    } catch (err) {
      console.error("joinRoom error:", err);
      socket.emit("error", "Failed to join room");
    }
  });

  socket.on("addFile", ({ roomId, file }) => {
    try {
      const room = getRoom(roomId);
      if (!room) return;

      room.files.push(file);

      io.to(normalizeRoomId(roomId)).emit(
        "fileListUpdate",
        room.files
      );
    } catch (err) {
      console.error("addFile error:", err);
    }
  });

  socket.on("deleteFile", ({ roomId, fileIndex }) => {
    try {
      const room = getRoom(roomId);
      if (!room || !room.files[fileIndex]) return;

      room.files.splice(fileIndex, 1);

      io.to(normalizeRoomId(roomId)).emit(
        "fileListUpdate",
        room.files
      );
    } catch (err) {
      console.error("deleteFile error:", err);
    }
  });

  socket.on("editorUpdate", ({ roomId, content, fileIndex }) => {
    try {
      const room = getRoom(roomId);
      if (!room || !room.files[fileIndex]) return;

      room.files[fileIndex].content = content;

      socket
        .to(normalizeRoomId(roomId))
        .emit("editorUpdate", { content, fileIndex });
    } catch (err) {
      console.error("editorUpdate error:", err);
    }
  });

  socket.on(
    "sendContent",
    ({ roomId, file, timerEnabled, timerMinutes }) => {
      try {
        const normalizedId = normalizeRoomId(roomId);
        const room = getRoom(roomId);

        if (!room) return;

        const contentItem = {
          file,
          timestamp: new Date(),
          sender: socket.id,
          timerEnabled,
          timerMinutes
        };

        room.content.push(contentItem);

        io.in(normalizedId).emit("contentReceived", {
          file,
          sender: socket.id,
          timerEnabled,
          timerMinutes
        });

        // 🔴 YOUR TIMER — UNTOUCHED
        if (timerEnabled && timerMinutes > 0) {
          const duration = timerMinutes * 60 * 1000;

          setTimeout(() => {
            const currentRoom = getRoom(roomId);

            if (currentRoom) {
              currentRoom.content = [];

              io.in(normalizedId).emit("contentDeleted", {
                message:
                  "⏰ Timer expired! Content has been auto-deleted."
              });
            }
          }, duration);
        }
      } catch (err) {
        console.error("sendContent error:", err);
      }
    }
  );

  socket.on("leaveRoom", (roomId) => {
    try {
      const normalizedId = normalizeRoomId(roomId);
      socket.leave(normalizedId);

      const room = getRoom(roomId);
      if (!room) return;

      room.users = room.users.filter((id) => id !== socket.id);

      io.to(normalizedId).emit("userLeft", {
        userId: socket.id,
        userCount: room.users.length
      });

      if (room.users.length === 0) {
        deleteRoom(roomId);
      }
    } catch (err) {
      console.error("leaveRoom error:", err);
    }
  });

  socket.on("disconnect", () => {
    console.log(`User disconnected: ${socket.id}`);
    removeUserFromRoom(socket.id);
  });
});

// ============ START SERVER ============
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("Shutting down...");
  server.close(() => process.exit(0));
});