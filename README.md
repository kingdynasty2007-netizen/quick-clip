# Quick Clip

Quick Clip creates temporary real-time rooms for moving text, code, PDFs, and short messages between devices. It requires no account and keeps active room state in server memory.

**Live application:** [quick-clip.onrender.com](https://quick-clip.onrender.com)

## Features

- Create or join a room with a short room code.
- Edit text and code collaboratively with optional live sharing.
- Upload text/code files up to 1 MiB and PDFs up to 10 MiB.
- Read shared text and render PDFs directly in the browser.
- Send room messages and content with an optional auto-delete timer.
- Recover presence after brief network interruptions.
- Invite another device with a link or QR code.

Rooms are ephemeral. Files, messages, and editor content are held in process memory and can disappear when a room expires, the server restarts, or the free Render service is recycled. Quick Clip is not permanent storage.

## Technology

- React 19 and Vite 8
- Express 4
- Socket.IO 4
- PDF.js
- Node.js

## Requirements

- Node.js 20.19+ or 22.12+
- npm

The repository includes an `.nvmrc` pinned to Node 22.12.0.

## Local development

```bash
git clone https://github.com/kingdynasty2007-netizen/quick-clip.git
cd quick-clip
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The development command runs Express, Socket.IO, and Vite through the same local server.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the development server with Vite middleware |
| `npm run build` | Create the production frontend in `dist/` |
| `npm test` | Run the Socket.IO and HTTP contract tests |
| `npm start` | Build and start the production server |
| `npm run preview` | Preview the Vite production bundle |

`npm install` and `npm ci` also run the production frontend build. This supports the existing Render service's build command.

## Deployment

The production service is connected to GitHub and automatically deploys each commit to `main`.

- Render service: `quick-clip`
- Build command: `npm install` (the `postinstall` script runs `npm run build`)
- Start command: `node server.js`
- Health endpoint: [`/health`](https://quick-clip.onrender.com/health)

The checked-in [`render.yaml`](render.yaml) describes the same free Node web service for reproducible Blueprint setup.

## Configuration

All settings are optional.

| Variable | Default | Purpose |
| --- | ---: | --- |
| `PORT` | `3000` | HTTP and Socket.IO port |
| `ALLOWED_ORIGINS` | same origin | Comma-separated Socket.IO origins |
| `TEXT_FILE_MAX_BYTES` | `1048576` | Maximum text/code file size |
| `PDF_FILE_MAX_BYTES` | `10485760` | Maximum PDF size |
| `FILES_PER_ROOM` | `20` | Maximum files per room |
| `ROOM_MAX_BYTES` | `26214400` | Maximum combined file bytes per room |
| `CHAT_MESSAGE_MAX_BYTES` | `4096` | Maximum chat message size |
| `CHAT_RETENTION` | `200` | Messages retained per room |
| `ROOM_IDLE_MS` | `7200000` | Empty-room retention period |
| `RECONNECT_GRACE_MS` | `120000` | Presence grace period after disconnect |
| `SOCKET_MAX_PAYLOAD_BYTES` | `12582912` | Socket.IO payload ceiling |
| `PDF_MAX_PAGES` | `500` | PDF page limit exposed to clients |

See [Socket.IO events](docs/SOCKET_EVENTS.md) for the realtime contract.

## Project structure

```text
src/                    React application and styles
server.js               Express and Socket.IO server
test/contract.test.js   HTTP and realtime integration tests
render.yaml             Render Blueprint definition
index.html              Vite entry document
```

## Contributing and security

Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting a change. Report vulnerabilities according to [SECURITY.md](SECURITY.md), not through a public issue.

## License

[ISC](LICENSE) © 2026 Osigwe Wisdom.
