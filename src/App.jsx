import {
  ArrowRight,
  BookOpenText,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  Code2,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCode2,
  FilePlus2,
  FileText,
  Focus,
  Fullscreen,
  Link2,
  Menu,
  MessageSquareText,
  Minus,
  MonitorSmartphone,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Radio,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Users,
  X
} from "lucide-react";
import QRCode from "qrcode";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const DEFAULT_FILE = {
  name: "welcome.txt",
  content: "Welcome to Quick Clip!\n\nStart typing or paste text here."
};

const ACCEPTED_EXTENSIONS = ["txt", "js", "py", "html", "css", "json", "md", "pdf"];
const MAX_TEXT_FILE_BYTES = 1024 * 1024;
const MAX_PDF_FILE_BYTES = 10 * 1024 * 1024;

function readStorage(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage is a preference enhancement; the app remains usable without it.
  }
}

function getClientId() {
  const stored = readStorage("qc-client-id");
  if (stored) return stored;
  const generated = window.crypto?.randomUUID?.() || `client-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  writeStorage("qc-client-id", generated);
  return generated;
}

function binaryToUint8Array(data) {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  if (Array.isArray(data)) return Uint8Array.from(data);
  if (data?.type === "Buffer" && Array.isArray(data.data)) return Uint8Array.from(data.data);
  if (data && typeof data === "object") return Uint8Array.from(Object.values(data));
  return null;
}

function LogoMark() {
  return (
    <span className="logo-mark" aria-hidden="true">
      <span />
      <span />
    </span>
  );
}

function Brand({ compact = false }) {
  return (
    <span className={`brand${compact ? " brand--compact" : ""}`}>
      <LogoMark />
      <span>Quick Clip</span>
    </span>
  );
}

function Button({ tone = "neutral", className = "", children, ...props }) {
  return (
    <button className={`button button--${tone} ${className}`} type="button" {...props}>
      {children}
    </button>
  );
}

function ToastRegion({ toasts, dismiss }) {
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <div className={`toast toast--${toast.tone}`} key={toast.id}>
          <span className="toast__icon" aria-hidden="true">
            {toast.tone === "error" ? <CircleAlert size={17} /> : <Check size={17} />}
          </span>
          <span>{toast.message}</span>
          <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Modal({ title, description, children, onClose, size = "medium" }) {
  const panelRef = useRef(null);

  useEffect(() => {
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const panel = panelRef.current;
    const focusables = panel?.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
    );
    focusables?.[0]?.focus();

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !focusables?.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        aria-describedby={description ? "modal-description" : undefined}
        aria-labelledby="modal-title"
        aria-modal="true"
        className={`modal modal--${size}`}
        onMouseDown={(event) => event.stopPropagation()}
        ref={panelRef}
        role="dialog"
      >
        <div className="modal__header">
          <div>
            <h2 id="modal-title">{title}</h2>
            {description ? <p id="modal-description">{description}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            <X size={19} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function ProductDemo() {
  return (
    <div className="product-demo" aria-label="Quick Clip workspace shown across desktop and phone">
      <div className="demo-window">
        <div className="demo-window__topbar">
          <span className="window-dots" aria-hidden="true"><i /><i /><i /></span>
          <span>Quick Clip&nbsp; / &nbsp;Room QC-7XK29P</span>
          <span className="demo-presence"><i /> 2 connected</span>
        </div>
        <div className="demo-window__body">
          <aside>
            <small>WORKSPACE</small>
            <strong><FileText size={13} /> notes.txt</strong>
            <span><FileCode2 size={13} /> snippet.js</span>
            <span><FileText size={13} /> anatomy.pdf</span>
          </aside>
          <div className="demo-document">
            <small>notes.txt</small>
            <h3># Shared notes</h3>
            <p>Move text between screens.<br />Share a code snippet.<br />Keep your work in one room.</p>
            <span className="live-label"><Radio size={12} /> Live across devices</span>
          </div>
        </div>
      </div>
      <div className="demo-phone">
        <div className="demo-phone__speaker" />
        <Brand compact />
        <small>Room QC-7XK29P</small>
        <div>
          <strong># Shared notes</strong>
          <p>Move text between screens.</p>
        </div>
      </div>
    </div>
  );
}

function FeatureVisual({ type }) {
  if (type === "transfer") {
    return (
      <div className="feature-visual feature-visual--code">
        <div className="mini-toolbar"><span>snippet.js</span><span><i /> Live</span></div>
        <pre><code><span>1</span> const message = 'Hello';{"\n"}<span>2</span>{"\n"}<span>3</span> function share() {'{'}{"\n"}<span>4</span>   return message;{"\n"}<span>5</span> {'}'}</code></pre>
        <div className="transfer-pulse" aria-hidden="true"><i /><i /><i /></div>
      </div>
    );
  }

  if (type === "collaborate") {
    return (
      <div className="feature-visual feature-visual--chat">
        <div className="mini-toolbar"><span>Room conversation</span><Users size={15} /></div>
        <p>Here’s the snippet!</p>
        <p className="chat-reply">Got it, thanks!</p>
        <span><i /> 2 people connected</span>
      </div>
    );
  }

  return (
    <div className="feature-visual feature-visual--reader">
      <div className="mini-toolbar"><span>anatomy.pdf</span><span>100%</span></div>
      <article>
        <small>HUMAN ANATOMY</small>
        <h4>The Skeletal System</h4>
        <p>Bones provide structural support, protect organs, and enable movement.</p>
        <div>Anatomical illustration / diagram</div>
      </article>
    </div>
  );
}

function Landing({ initialCode, lastRoom, onCreate, onJoin }) {
  const [roomCode, setRoomCode] = useState(initialCode || "");
  const [joinOpen, setJoinOpen] = useState(Boolean(initialCode));
  const joinRef = useRef(null);

  useEffect(() => {
    if (joinOpen) joinRef.current?.focus();
  }, [joinOpen]);

  const submitJoin = (event) => {
    event.preventDefault();
    onJoin(roomCode);
  };

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="brand-link" href="#top" aria-label="Quick Clip home"><Brand /></a>
        <nav aria-label="Primary navigation">
          <a href="#product">Product</a>
          <a href="#how-it-works">How it works</a>
          <a href="#use-cases">Use cases</a>
        </nav>
        <Button tone="primary" onClick={onCreate}>Open workspace <ArrowRight size={16} /></Button>
      </header>

      <main id="top">
        <section className="hero" id="product">
          <p className="eyebrow">SHARE MORE. DO MORE.</p>
          <h1>Everything you want<br />to share. One room.</h1>
          <p className="hero__lede">
            Share text, code, files and more instantly between devices. Work together in real time,
            or pick up where you left off.
          </p>
          <div className="hero__actions">
            <Button tone="primary" onClick={onCreate}>Create a room <ArrowRight size={17} /></Button>
            <Button onClick={() => setJoinOpen((value) => !value)}>Join a room</Button>
          </div>
          {joinOpen ? (
            <form className="join-form" onSubmit={submitJoin} noValidate>
              <label htmlFor="landing-room-code">Room code</label>
              <div>
                <input
                  id="landing-room-code"
                  ref={joinRef}
                  value={roomCode}
                  onChange={(event) => setRoomCode(event.target.value)}
                  placeholder="QC-7XK29P"
                  autoComplete="off"
                />
                <Button tone="primary" type="submit">Join room</Button>
              </div>
            </form>
          ) : null}
          {lastRoom ? (
            <button className="recent-room" type="button" onClick={() => onJoin(lastRoom)}>
              <Clock3 size={16} /> Continue room <strong>{lastRoom.toUpperCase()}</strong>
              <ArrowRight size={15} />
            </button>
          ) : null}
          <ProductDemo />
        </section>

        <section className="editorial-intro" id="how-it-works">
          <h2>Made for the way you actually work.</h2>
          <p>No complicated setup. Just a room that connects your content and your people.</p>
        </section>

        <section className="feature-sequence" id="use-cases">
          <article className="feature-row">
            <div className="feature-copy"><span>01 / TRANSFER</span><h3>From one screen<br />to another.</h3><p>Move notes, links, snippets and documents between your phone and laptop.</p></div>
            <FeatureVisual type="transfer" />
          </article>
          <article className="feature-row feature-row--reverse">
            <div className="feature-copy"><span>02 / COLLABORATE</span><h3>A room for<br />you and your people.</h3><p>Share the room and work together with the people already around you.</p></div>
            <FeatureVisual type="collaborate" />
          </article>
          <article className="feature-row">
            <div className="feature-copy"><span>03 / READ</span><h3>Read comfortably.<br />Stay focused.</h3><p>Switch from editing to a calm reading surface without leaving the room.</p></div>
            <FeatureVisual type="reader" />
          </article>
        </section>

        <section className="landing-cta">
          <div><span>YOUR NEXT SHARE STARTS HERE.</span><h2>One room. Every screen.</h2></div>
          <Button tone="primary" onClick={onCreate}>Create a room <ArrowRight size={17} /></Button>
        </section>
      </main>
      <footer className="landing-footer"><Brand /><p>Temporary rooms for text, code and files.</p><span>Built for the moment, not forever.</span></footer>
    </div>
  );
}

function QrDialog({ inviteUrl, onClose }) {
  const [qrData, setQrData] = useState("");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(inviteUrl, { width: 280, margin: 1, color: { dark: "#142033", light: "#ffffff" } })
      .then((value) => active && setQrData(value));
    return () => { active = false; };
  }, [inviteUrl]);

  return (
    <Modal title="Join this room" description="Scan the code on another device or use the invite link." onClose={onClose} size="small">
      <div className="qr-panel">
        {qrData ? <img src={qrData} alt={`QR code for ${inviteUrl}`} /> : <div className="qr-loading">Generating code…</div>}
        <code>{inviteUrl}</code>
      </div>
    </Modal>
  );
}

function ConfirmDialog({ title, description, actionLabel, onCancel, onConfirm }) {
  return (
    <Modal title={title} description={description} onClose={onCancel} size="small">
      <div className="modal__actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button tone="danger" onClick={onConfirm}>{actionLabel}</Button>
      </div>
    </Modal>
  );
}

function FileIcon({ name, size = 16 }) {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext === "js" || ext === "py" || ext === "html" || ext === "css" || ext === "json"
    ? <FileCode2 size={size} />
    : <FileText size={size} />;
}

function Sidebar({ files, activeIndex, mode, open, collapsed, onClose, onCollapse, onDelete, onMode, onSelect, onUpload }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const receiveFiles = (fileList) => {
    setDragging(false);
    const file = fileList?.[0];
    if (file) onUpload(file);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <>
      {open ? <button className="drawer-backdrop" type="button" onClick={onClose} aria-label="Close file panel" /> : null}
      <aside className={`workspace-sidebar${open ? " is-open" : ""}${collapsed ? " is-collapsed" : ""}`} aria-label="Workspace navigation">
        <div className="sidebar-heading">
          <span>{collapsed ? "" : "Your files"}</span>
          <button className="icon-button" type="button" onClick={onCollapse} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {collapsed ? null : (
          <>
            <div className="file-list" role="listbox" aria-label="Room files">
              {files.map((file, index) => (
                <div className={`file-row${activeIndex === index ? " is-active" : ""}`} key={`${file.name}-${index}`}>
                  <button type="button" onClick={() => onSelect(index)} role="option" aria-selected={activeIndex === index}>
                    <FileIcon name={file.name} /> <span>{file.name}</span>
                  </button>
                  <button type="button" onClick={() => onDelete(index)} aria-label={`Delete ${file.name}`}><Trash2 size={15} /></button>
                </div>
              ))}
            </div>

            <div
              className={`upload-zone${dragging ? " is-dragging" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => { event.preventDefault(); receiveFiles(event.dataTransfer.files); }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".txt,.js,.py,.html,.css,.json,.md,.pdf,application/pdf"
                onChange={(event) => receiveFiles(event.target.files)}
                tabIndex={-1}
              />
              <button type="button" onClick={() => inputRef.current?.click()}>
                <FilePlus2 size={16} /> Add a file
              </button>
              <span>Text/code 1 MiB · PDF 10 MiB</span>
            </div>

            <div className="view-list">
              <span>Views</span>
              <button className={mode === "editor" ? "is-active" : ""} type="button" onClick={() => onMode("editor")}><Code2 size={16} /> Editor</button>
              <button className={mode === "reader" ? "is-active" : ""} type="button" onClick={() => onMode("reader")}><BookOpenText size={16} /> Text reader</button>
              <button className={mode === "pdf" ? "is-active" : ""} type="button" onClick={() => onMode("pdf")}><FileText size={16} /> PDF reader</button>
              <button className={mode === "chat" ? "is-active" : ""} type="button" onClick={() => onMode("chat")}><MessageSquareText size={16} /> Room chat</button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function EditorView({ file, liveShare, privacy, onChange, onLiveShare, onPrivacy }) {
  return (
    <section className="editor-view" aria-labelledby="active-file-name">
      <div className="workspace-view__toolbar">
        <h2 id="active-file-name">{file?.name || "No file selected"}</h2>
        <div>
          <button className={`toolbar-button${privacy ? " is-active" : ""}`} type="button" onClick={onPrivacy}>
            {privacy ? <Eye size={16} /> : <EyeOff size={16} />} {privacy ? "Show text" : "Hide text"}
          </button>
          <button className={`toolbar-button${liveShare ? " is-live" : ""}`} type="button" onClick={onLiveShare}>
            <Radio size={16} /> {liveShare ? "Live share on" : "Live share off"}
          </button>
        </div>
      </div>
      {file ? (
        <textarea
          className={privacy ? "is-private" : ""}
          value={file.content}
          onChange={(event) => onChange(event.target.value)}
          aria-label={`Editing ${file.name}`}
          spellCheck="false"
        />
      ) : <div className="empty-view"><FileText /><h3>No file selected</h3><p>Add a text or code file to begin.</p></div>}
      <div className="view-status"><span>Plain text</span><span>Changes live in this temporary room</span></div>
    </section>
  );
}

function ReaderView({ file, onFocusMode }) {
  const [size, setSize] = useState(17);
  return (
    <section className="reader-view" aria-labelledby="reader-heading">
      <div className="workspace-view__toolbar">
        <h2 id="reader-heading">Text Reader</h2>
        <div>
          <button className="toolbar-button" type="button" onClick={() => setSize((value) => Math.max(14, value - 1))} aria-label="Decrease text size">A−</button>
          <button className="toolbar-button" type="button" onClick={() => setSize((value) => Math.min(24, value + 1))} aria-label="Increase text size">A+</button>
          <button className="toolbar-button" type="button" onClick={onFocusMode}><Focus size={16} /> Focus view</button>
        </div>
      </div>
      <div className="reader-canvas">
        <article style={{ fontSize: `${size}px` }}>
          <small>{file?.name || "QUICK CLIP NOTE"}</small>
          <h3>{file?.name ? file.name.replace(/\.[^.]+$/, "") : "Nothing to read yet"}</h3>
          <p>{file?.content || "Choose a text file from the sidebar to open it in a comfortable reading view."}</p>
        </article>
      </div>
      <div className="view-status"><span>Comfortable width</span><span>Adjustable text size</span></div>
    </section>
  );
}

function PdfView({ file, maxPages = 500 }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const documentRef = useRef(null);
  const renderRef = useRef(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const bytes = file?.kind === "pdf" || file?.name?.toLowerCase().endsWith(".pdf")
      ? binaryToUint8Array(file.data)
      : null;
    setPage(1);
    setPages(0);
    setError("");
    if (!bytes?.length) {
      setStatus("idle");
      return undefined;
    }
    setStatus("loading");
    const task = pdfjsLib.getDocument({ data: bytes.slice(), isEvalSupported: false });
    task.promise.then((pdf) => {
      if (cancelled) return pdf.destroy();
      if (pdf.numPages > maxPages) {
        pdf.destroy();
        throw new Error(`PDFs are limited to ${maxPages} pages.`);
      }
      documentRef.current = pdf;
      setPages(pdf.numPages);
      setStatus("ready");
    }).catch((reason) => {
      if (!cancelled) {
        setError(reason?.message || "This PDF could not be opened.");
        setStatus("error");
      }
    });
    return () => {
      cancelled = true;
      renderRef.current?.cancel?.();
      task.destroy();
      documentRef.current?.destroy?.();
      documentRef.current = null;
    };
  }, [file, maxPages]);

  useEffect(() => {
    const pdf = documentRef.current;
    const canvas = canvasRef.current;
    if (!pdf || !canvas || status !== "ready") return undefined;
    let cancelled = false;
    pdf.getPage(page).then((pdfPage) => {
      if (cancelled) return;
      const viewport = pdfPage.getViewport({ scale: zoom });
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const context = canvas.getContext("2d", { alpha: false });
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      renderRef.current = pdfPage.render({ canvasContext: context, viewport, transform: ratio === 1 ? null : [ratio, 0, 0, ratio, 0, 0] });
      return renderRef.current.promise;
    }).catch((reason) => {
      if (!cancelled && reason?.name !== "RenderingCancelledException") setError("This page could not be rendered.");
    });
    return () => {
      cancelled = true;
      renderRef.current?.cancel?.();
    };
  }, [page, status, zoom]);

  const download = () => {
    const bytes = binaryToUint8Array(file?.data);
    if (!bytes) return;
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = file.name || "document.pdf";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="pdf-view" aria-labelledby="pdf-heading">
      <div className="workspace-view__toolbar">
        <h2 id="pdf-heading">PDF Reader</h2>
        <div>
          <button className="toolbar-button" type="button" disabled={status !== "ready"} onClick={() => setZoom((value) => value >= 1.25 ? value - .25 : value)}><Minus size={15} /></button>
          <span className="pdf-zoom">{Math.round(zoom * 100)}%</span>
          <button className="toolbar-button" type="button" disabled={status !== "ready"} onClick={() => setZoom((value) => value <= 2.25 ? value + .25 : value)}><Plus size={15} /></button>
          <button className="toolbar-button" type="button" disabled={status !== "ready"} onClick={download}><Download size={16} /> Download</button>
          <button className="toolbar-button" type="button" disabled={status !== "ready"} onClick={() => containerRef.current?.requestFullscreen?.()}><Fullscreen size={16} /> Fullscreen</button>
        </div>
      </div>
      <div className="pdf-canvas" ref={containerRef}>
        {status === "ready" ? <canvas ref={canvasRef} aria-label={`${file.name}, page ${page} of ${pages}`} /> : null}
        {status === "loading" ? <p role="status">Opening PDF…</p> : null}
        {status === "error" ? <p role="alert">{error}</p> : null}
        {status === "idle" ? <article><FileText size={42} /><h3>Select a PDF file</h3><p>Upload a PDF up to 10 MiB, then choose it from the file list.</p></article> : null}
      </div>
      <div className="pdf-pagination"><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={15} /> Previous</button><span>Page {pages ? page : "—"} of {pages || "—"}</span><button type="button" disabled={!pages || page >= pages} onClick={() => setPage((value) => value + 1)}>Next <ChevronRight size={15} /></button></div>
    </section>
  );
}

function ChatView({ messages, onSend }) {
  const [value, setValue] = useState("");
  const submit = (event) => {
    event.preventDefault();
    const text = value.trim();
    if (!text) return;
    onSend(text);
    setValue("");
  };
  return (
    <section className="chat-view" aria-labelledby="chat-heading">
      <div className="workspace-view__toolbar"><h2 id="chat-heading">Room chat</h2><span>{messages.length} messages</span></div>
      <div className="chat-messages" aria-live="polite">
        {messages.length ? messages.map((message) => <article key={message.id}><strong>{message.senderLabel || "Device"}</strong><p>{message.text}</p><time>{new Date(message.createdAt || Date.now()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></article>) : <p className="chat-empty">No messages yet. Say hello to the room.</p>}
      </div>
      <form className="chat-compose" onSubmit={submit}><label htmlFor="chat-message">Message</label><textarea id="chat-message" value={value} maxLength={4096} onChange={(event) => setValue(event.target.value)} placeholder="Write a message…" /><Button tone="primary" type="submit"><Send size={16} /> Send</Button></form>
    </section>
  );
}

function Workspace({ roomId, files, currentIndex, connection, presence, isHost, messages, limits, onChatSend, onCopy, onDelete, onEditorChange, onFileSelect, onLeave, onLiveShare, onModeChange, onPrivacy, onSend, onUpload, liveShare, mode, privacy, timerEnabled, timerMinutes, timerRemaining, onTimerEnabled, onTimerMinutes }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => readStorage("qc-sidebar") === "collapsed");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [deleteIndex, setDeleteIndex] = useState(null);

  const activeFile = files[currentIndex];
  const inviteUrl = useMemo(() => {
    const url = new URL(window.location.origin);
    url.searchParams.set("room", roomId);
    return url.toString();
  }, [roomId]);

  const toggleSidebar = () => {
    setSidebarCollapsed((value) => {
      writeStorage("qc-sidebar", value ? "expanded" : "collapsed");
      return !value;
    });
  };

  return (
    <div className={`workspace${focusMode ? " is-focus-mode" : ""}`}>
      <header className="workspace-header">
        <div><button className="mobile-menu" type="button" onClick={() => setMobileOpen(true)} aria-label="Open file panel"><Menu size={20} /></button><Brand /></div>
        <div className="room-identity"><span>Room</span><strong>{roomId.toUpperCase()}</strong><span className="role-label">{isHost ? "Host" : "Guest"}</span></div>
        <div className="workspace-header__actions">
          <Button onClick={() => setQrOpen(true)}>Show QR</Button>
          <Button onClick={() => onCopy(inviteUrl)}><Link2 size={16} /> Copy invite</Button>
        </div>
      </header>

      <div className="connection-bar" aria-live="polite">
        <span className={`connection-pill connection-pill--${connection}`}><i /> {connection === "connected" ? "Connected" : connection === "reconnecting" ? "Reconnecting" : "Offline"}</span>
        <span><Users size={14} /> {presence} {presence === 1 ? "device" : "devices"}</span>
        <span>Temporary room · Stored in server memory</span>
      </div>

      <div className="workspace-layout">
        {!focusMode && (!sidebarCollapsed || mobileOpen) ? (
          <Sidebar
            files={files}
            activeIndex={currentIndex}
            mode={mode}
            open={mobileOpen}
            collapsed={sidebarCollapsed && !mobileOpen}
            onClose={() => setMobileOpen(false)}
            onCollapse={toggleSidebar}
            onDelete={setDeleteIndex}
            onMode={(value) => { onModeChange(value); setMobileOpen(false); }}
            onSelect={(index) => { onFileSelect(index); onModeChange(files[index]?.kind === "pdf" || files[index]?.name?.toLowerCase().endsWith(".pdf") ? "pdf" : mode === "pdf" ? "editor" : mode); setMobileOpen(false); }}
            onUpload={onUpload}
          />
        ) : null}

        <main className="workspace-main">
          <div className="workspace-main__topline">
            {sidebarCollapsed && !focusMode ? <Button onClick={toggleSidebar}><PanelLeftOpen size={16} /> Expand sidebar</Button> : <span />}
            <Button onClick={() => setFocusMode((value) => !value)}><Focus size={16} /> {focusMode ? "Exit focus" : "Focus mode"}</Button>
          </div>
          {mode === "editor" ? <EditorView file={activeFile} liveShare={liveShare} privacy={privacy} onChange={onEditorChange} onLiveShare={onLiveShare} onPrivacy={onPrivacy} /> : null}
          {mode === "reader" ? <ReaderView file={activeFile} onFocusMode={() => setFocusMode(true)} /> : null}
          {mode === "pdf" ? <PdfView file={activeFile} maxPages={limits.maxPdfPages} /> : null}
          {mode === "chat" ? <ChatView messages={messages} onSend={onChatSend} /> : null}
        </main>
      </div>

      <footer className="share-bar">
        <label className="timer-toggle"><input type="checkbox" checked={timerEnabled} onChange={(event) => onTimerEnabled(event.target.checked)} /><span>Auto-delete sent content</span></label>
        <div className="timer-stepper" aria-label="Auto-delete timer in minutes">
          <button type="button" onClick={() => onTimerMinutes(Math.max(1, timerMinutes - 1))} aria-label="Decrease timer"><Minus size={15} /></button>
          <strong>{timerMinutes} min</strong>
          <button type="button" onClick={() => onTimerMinutes(Math.min(60, timerMinutes + 1))} aria-label="Increase timer"><Plus size={15} /></button>
          {timerRemaining ? <span>{timerRemaining}</span> : null}
        </div>
        <Button tone="primary" onClick={onSend}><Send size={16} /> Share content</Button>
        <Button className="leave-button" onClick={() => setLeaveOpen(true)}>Leave room</Button>
      </footer>

      {qrOpen ? <QrDialog inviteUrl={inviteUrl} onClose={() => setQrOpen(false)} /> : null}
      {leaveOpen ? <ConfirmDialog title="Leave this room?" description="This device will leave the room. The room disappears when the last device leaves." actionLabel="Leave room" onCancel={() => setLeaveOpen(false)} onConfirm={() => { setLeaveOpen(false); onLeave(); }} /> : null}
      {deleteIndex !== null ? <ConfirmDialog title={`Delete ${files[deleteIndex]?.name || "this file"}?`} description="The file will be removed for every device in this room." actionLabel="Delete file" onCancel={() => setDeleteIndex(null)} onConfirm={() => { onDelete(deleteIndex); setDeleteIndex(null); }} /> : null}
    </div>
  );
}

export default function App() {
  const initialRoom = useMemo(() => new URLSearchParams(window.location.search).get("room") || "", []);
  const [roomId, setRoomId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [files, setFiles] = useState([DEFAULT_FILE]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [presence, setPresence] = useState(1);
  const [messages, setMessages] = useState([]);
  const [limits, setLimits] = useState({ maxPdfPages: 500 });
  const [connection, setConnection] = useState("offline");
  const [liveShare, setLiveShare] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [mode, setMode] = useState("editor");
  const [timerEnabled, setTimerEnabled] = useState(true);
  const [timerMinutes, setTimerMinutes] = useState(5);
  const [timerEnd, setTimerEnd] = useState(null);
  const [timerRemaining, setTimerRemaining] = useState("");
  const [toasts, setToasts] = useState([]);
  const socketRef = useRef(null);
  const roomRef = useRef(null);
  const clientIdRef = useRef(getClientId());

  const dismissToast = useCallback((id) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback((message, tone = "success") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((items) => [...items.slice(-2), { id, message, tone }]);
    window.setTimeout(() => dismissToast(id), 4200);
  }, [dismissToast]);

  useEffect(() => {
    roomRef.current = roomId;
  }, [roomId]);

  useEffect(() => {
    document.title = roomId
      ? `${roomId.toUpperCase()} | Quick Clip`
      : "Quick Clip — One room for everything you share";
  }, [roomId]);

  useEffect(() => {
    const socket = io({ transports: ["websocket", "polling"] });
    socketRef.current = socket;

    const rejoinCurrentRoom = () => {
      setConnection("connected");
      if (roomRef.current) socket.emit("joinRoom", { roomId: roomRef.current, clientId: clientIdRef.current });
    };

    socket.on("connect", rejoinCurrentRoom);
    socket.io.on("reconnect_attempt", () => setConnection("reconnecting"));
    socket.io.on("reconnect_failed", () => setConnection("offline"));
    socket.on("connect_error", () => setConnection("offline"));
    socket.on("disconnect", () => setConnection("reconnecting"));
    socket.on("roomData", (data) => {
      if (Array.isArray(data?.files) && data.files.length) {
        setFiles(data.files);
        setCurrentIndex(0);
      }
      setPresence(Number(data?.users) || 1);
      setMessages(Array.isArray(data?.messages) ? data.messages : []);
      setLimits((current) => ({ ...current, ...(data?.limits || {}) }));
    });
    socket.on("fileListUpdate", (nextFiles) => {
      if (!Array.isArray(nextFiles)) return;
      setFiles(nextFiles);
      setCurrentIndex((index) => Math.max(0, Math.min(index, nextFiles.length - 1)));
    });
    socket.on("editorUpdate", ({ content, fileIndex }) => {
      setFiles((items) => items.map((file, index) => index === fileIndex ? { ...file, content: String(content ?? "") } : file));
    });
    socket.on("contentReceived", (data) => {
      if (!data?.file?.name) return;
      setFiles((items) => {
        const index = items.findIndex((file) => file.name === data.file.name);
        if (index === -1) return [...items, data.file];
        return items.map((file, itemIndex) => itemIndex === index ? data.file : file);
      });
      if (data.sender !== socket.id) notify(`Received ${data.file.name}`);
    });
    socket.on("contentDeleted", (data) => {
      setTimerEnd(null);
      notify(data?.message || "Sent content expired.", "error");
    });
    socket.on("userJoined", (data) => {
      setPresence(Number(data?.userCount) || 1);
      notify("Another device joined the room.");
    });
    socket.on("userLeft", (data) => {
      setPresence(Math.max(1, Number(data?.userCount) || 1));
      notify("A device left the room.");
    });
    socket.on("presenceUpdate", (data) => setPresence(Math.max(1, Number(data?.userCount) || 1)));
    socket.on("chatMessage", (message) => {
      if (!message?.id) return;
      setMessages((items) => items.some((item) => item.id === message.id) ? items : [...items, message].slice(-200));
    });
    socket.on("appError", (data) => notify(data?.message || "Something went wrong.", "error"));
    socket.on("roomExpired", () => {
      roomRef.current = null;
      setRoomId(null);
      notify("The inactive room expired.", "error");
    });
    socket.on("error", (message) => notify(String(message || "The room could not be opened."), "error"));

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [notify]);

  useEffect(() => {
    if (!timerEnd) {
      setTimerRemaining("");
      return undefined;
    }
    const update = () => {
      const remaining = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
      const minutes = Math.floor(remaining / 60);
      const seconds = String(remaining % 60).padStart(2, "0");
      setTimerRemaining(`${minutes}:${seconds}`);
      if (!remaining) setTimerEnd(null);
    };
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [timerEnd]);

  const normalizeRoom = (value) => {
    const cleaned = String(value || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
    if (!cleaned) return "";
    return cleaned.startsWith("qc-") ? cleaned : `qc-${cleaned}`;
  };

  const enterRoom = (value, host) => {
    const normalized = normalizeRoom(value);
    if (!normalized) {
      notify("Enter a room code to continue.", "error");
      return;
    }
    roomRef.current = normalized;
    setRoomId(normalized);
    setIsHost(host);
    setFiles([DEFAULT_FILE]);
    setCurrentIndex(0);
    setPresence(1);
    writeStorage("qc-last-room", normalized);
    const url = new URL(window.location.href);
    url.searchParams.set("room", normalized);
    window.history.replaceState({}, "", url);
    if (socketRef.current?.connected) socketRef.current.emit("joinRoom", { roomId: normalized, clientId: clientIdRef.current });
    notify(host ? "Room created." : "Room joined.");
  };

  const createRoom = () => enterRoom(`qc-${Math.random().toString(36).slice(2, 8)}`, true);
  const joinRoom = (value) => enterRoom(value, false);

  const copyInvite = async (value) => {
    try {
      await navigator.clipboard.writeText(value);
      notify("Invite link copied.");
    } catch {
      notify("Clipboard access was unavailable. Use Show QR instead.", "error");
    }
  };

  const uploadFile = (file) => {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!ACCEPTED_EXTENSIONS.includes(extension)) {
      notify("Choose a supported text or code file.", "error");
      return;
    }
    const isPdf = extension === "pdf";
    const maxBytes = isPdf ? MAX_PDF_FILE_BYTES : MAX_TEXT_FILE_BYTES;
    if (file.size > maxBytes) {
      notify(`That file is larger than the ${isPdf ? "10 MiB PDF" : "1 MiB text-file"} limit.`, "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const payload = isPdf
        ? { name: file.name, kind: "pdf", data: new Uint8Array(reader.result) }
        : { name: file.name, kind: "text", content: String(reader.result || "") };
      socketRef.current?.emit("addFile", { roomId, file: payload }, (result) => {
        if (result?.ok) notify(`${file.name} added.`);
        else notify(result?.error?.message || "The file could not be added.", "error");
      });
    };
    reader.onerror = () => notify("The file could not be read.", "error");
    if (isPdf) reader.readAsArrayBuffer(file);
    else reader.readAsText(file);
  };

  const editCurrentFile = (content) => {
    setFiles((items) => items.map((file, index) => index === currentIndex ? { ...file, content } : file));
    if (liveShare) socketRef.current?.emit("editorUpdate", { roomId, content, fileIndex: currentIndex });
  };

  const sendCurrentFile = () => {
    const file = files[currentIndex];
    if (!file || (file.kind !== "pdf" && !file?.content?.trim())) {
      notify("Add some content before sharing.", "error");
      return;
    }
    socketRef.current?.emit("sendContent", { roomId, file, timerEnabled, timerMinutes }, (result) => {
      if (!result?.ok) return notify(result?.error?.message || "The content could not be shared.", "error");
      if (timerEnabled) setTimerEnd(Date.now() + timerMinutes * 60 * 1000);
      notify(`${file.name} shared with the room.`);
    });
  };

  const sendChatMessage = (text) => {
    socketRef.current?.emit("sendMessage", { roomId, text }, (result) => {
      if (!result?.ok) notify(result?.error?.message || "The message could not be sent.", "error");
    });
  };

  const leaveRoom = () => {
    socketRef.current?.emit("leaveRoom", roomId);
    roomRef.current = null;
    setRoomId(null);
    setFiles([DEFAULT_FILE]);
    setCurrentIndex(0);
    setMessages([]);
    setTimerEnd(null);
    setLiveShare(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url);
    notify("You left the room.");
  };

  return (
    <>
      {roomId ? (
        <Workspace
          roomId={roomId}
          files={files}
          currentIndex={currentIndex}
          connection={connection}
          presence={presence}
          messages={messages}
          limits={limits}
          isHost={isHost}
          liveShare={liveShare}
          privacy={privacy}
          mode={mode}
          timerEnabled={timerEnabled}
          timerMinutes={timerMinutes}
          timerRemaining={timerRemaining}
          onCopy={copyInvite}
          onChatSend={sendChatMessage}
          onDelete={(index) => socketRef.current?.emit("deleteFile", { roomId, fileIndex: index })}
          onEditorChange={editCurrentFile}
          onFileSelect={setCurrentIndex}
          onLeave={leaveRoom}
          onLiveShare={() => setLiveShare((value) => !value)}
          onModeChange={setMode}
          onPrivacy={() => setPrivacy((value) => !value)}
          onSend={sendCurrentFile}
          onUpload={uploadFile}
          onTimerEnabled={setTimerEnabled}
          onTimerMinutes={setTimerMinutes}
        />
      ) : (
        <Landing
          initialCode={initialRoom}
          lastRoom={readStorage("qc-last-room")}
          onCreate={createRoom}
          onJoin={joinRoom}
        />
      )}
      <ToastRegion toasts={toasts} dismiss={dismissToast} />
    </>
  );
}
