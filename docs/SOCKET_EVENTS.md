# Socket.IO event contract

Quick Clip uses acknowledgements for client mutations. Successful acknowledgements contain `{ "ok": true }`; failures contain `{ "ok": false, "error": { "code", "message" } }`. The server also emits `appError` for application errors. `joinRoom` additionally emits the legacy `error` string for backward compatibility.

Room IDs are normalized to lowercase and must match `qc-[a-z0-9]{3,32}`. Clients should persist a stable `clientId` containing 8–80 letters, numbers, underscores, or hyphens so reconnects do not duplicate presence.

## Client to server

| Event | Payload | Purpose |
| --- | --- | --- |
| `joinRoom` | `{ roomId, clientId }` or legacy room string | Create or join a room and receive its snapshot |
| `addFile` | `{ roomId, file }` | Add a validated text/code or PDF file |
| `deleteFile` | `{ roomId, fileIndex }` or `{ roomId, fileId }` | Delete a room file |
| `editorUpdate` | `{ roomId, fileIndex, content }` | Replace a text file's live editor content |
| `sendContent` | `{ roomId, file, timerEnabled, timerMinutes }` | Broadcast content, optionally expiring it after 1–60 minutes |
| `sendMessage` | `{ roomId, text, clientMessageId? }` | Send a plain-text room message |
| `leaveRoom` | `{ roomId }` or legacy room string | Explicitly leave the room |

Text file payloads use `{ name, kind: "text", content }`. PDF payloads use `{ name, kind: "pdf", data }`, where `data` is binary and the server verifies the PDF signature.

## Server to client

| Event | Payload | Purpose |
| --- | --- | --- |
| `roomData` | `{ files, users, messages, limits }` | Complete room snapshot after joining |
| `userJoined` | `{ userId, userCount }` | A new device joined |
| `userLeft` | `{ userId, userCount, reason }` | A device left or exceeded its reconnect grace period |
| `presenceUpdate` | `{ userCount, recovered }` | A known device reconnected |
| `fileListUpdate` | `File[]` | Authoritative room file list |
| `editorUpdate` | `{ content, fileIndex, fileId }` | Remote live editor update |
| `contentReceived` | `{ file, sender, timerEnabled, timerMinutes }` | Shared content broadcast |
| `contentDeleted` | `{ message }` | Timed shared content expired |
| `chatMessage` | `{ id, clientMessageId, text, sender, sentAt }` | New room chat message |
| `roomExpired` | `{ roomId, reason }` | The empty room exceeded its retention period |
| `appError` | `{ code, message, details? }` | Structured application error |

## File representation

Serialized files contain `id`, `name`, `kind`, `mimeType`, and `size`. Text files additionally contain `content`; PDFs contain binary `data`.

## Default limits

- Text/code file: 1 MiB
- PDF: 10 MiB and 500 pages in the client reader
- Files per room: 20
- Combined room files: 25 MiB
- Chat message: 4 KiB
- Retained chat messages: 200
- Empty-room retention: 2 hours
- Disconnect grace period: 2 minutes
- Socket.IO payload: 12 MiB

Environment variables documented in the root README can override server-side limits.
