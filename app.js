/**
 * Quick Clip - Main Application
 * Real-time code sharing with auto-delete timer
 */

// ============ STATE MANAGEMENT ============
const AppState = {
  socket: null,
  currentRoomId: null,
  files: [{ 
    name: "welcome.txt", 
    content: "Welcome to Quick Clip!\n\nStart typing or paste code here." 
  }],
  currentFileIndex: 0,
  timerMinutes: 1,
  timerInterval: null,
  isTimerEnabled: true,
  isPrivacyMode: false,
  isLiveShareEnabled: false
};

// ============ DOM ELEMENTS ============
const Elements = {
  // Screens
  homeScreen: document.getElementById('home-screen'),
  roomScreen: document.getElementById('room-screen'),
  
  // Home page
  btnCreate: document.getElementById('btn-create'),
  btnJoin: document.getElementById('btn-join'),
  roomInput: document.getElementById('room-input'),
  
  // Room page - Header
  roomId: document.getElementById('room-id'),
  btnCopy: document.getElementById('btn-copy'),
  timerValue: document.getElementById('timer-value'),
  timerCountdown: document.getElementById('timer-countdown'),
  timerToggle: document.getElementById('timer-toggle'),
  timerSection: document.querySelector('.timer-section'),
  
  // Room page - Buttons
  btnTimerMinus: document.getElementById('btn-timer-minus'),
  btnTimerPlus: document.getElementById('btn-timer-plus'),
  btnPrivacy: document.getElementById('btn-privacy'),
  btnFormat: document.getElementById('btn-format'),
  btnLiveShare: document.getElementById('btn-live-share'),
  btnSend: document.getElementById('btn-send'),
  btnLeave: document.getElementById('btn-leave'),
  
  // Room page - Sidebar
  dropZone: document.getElementById('drop-zone'),
  fileInput: document.getElementById('file-input'),
  fileList: document.getElementById('file-list'),
  
  // Room page - Editor
  currentFile: document.getElementById('current-file'),
  editor: document.getElementById('editor')
};

// ============ SOCKET.IO ============
function initSocket() {
  if (AppState.socket) return;
  
  AppState.socket = io({ transports: ['websocket', 'polling'] });
  
  AppState.socket.on('connect', () => {
    console.log('Connected to server');
  });
  
  AppState.socket.on('connect_error', (err) => {
    console.error('Connection error:', err.message);
  });

  AppState.socket.on('roomData', (data) => {
    if (data.files) {
      AppState.files = data.files;
      renderFileList();
      loadCurrentFile();
    }
  });

  AppState.socket.on('fileListUpdate', (files) => {
    AppState.files = files;
    renderFileList();
    loadCurrentFile();
  });

  AppState.socket.on('editorUpdate', (data) => {
    if (AppState.files[data.fileIndex]) {
      AppState.files[data.fileIndex].content = data.content;
      if (data.fileIndex === AppState.currentFileIndex) {
        Elements.editor.value = data.content;
      }
    }
  });

  AppState.socket.on('contentReceived', (data) => {
    console.log('Content sent:', data.file.name);
  });

  AppState.socket.on('contentDeleted', (data) => {
    alert(data.message);
  });

  AppState.socket.on('disconnect', () => {
    console.log('Disconnected from server');
  });
}

function joinRoom(roomId) {
  if (!AppState.socket) return;
  
  const attemptJoin = () => {
    if (AppState.socket.connected) {
      AppState.socket.emit('joinRoom', roomId);
    } else {
      setTimeout(attemptJoin, 100);
    }
  };
  attemptJoin();
}

// ============ NAVIGATION ============
function showRoom() {
  Elements.homeScreen.classList.add('hidden');
  Elements.roomScreen.classList.add('active');
}

function showHome() {
  Elements.homeScreen.classList.remove('hidden');
  Elements.roomScreen.classList.remove('active');
}

function enterRoom(roomId) {
  AppState.currentRoomId = roomId;
  Elements.roomId.textContent = roomId;
  
  initSocket();
  joinRoom(roomId);
  showRoom();
}

// ============ FILE MANAGEMENT ============
function loadCurrentFile() {
  const file = AppState.files[AppState.currentFileIndex];
  if (file) {
    Elements.editor.value = file.content;
    Elements.currentFile.textContent = file.name;
  }
}

function renderFileList() {
  Elements.fileList.innerHTML = '';

  AppState.files.forEach((file, index) => {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    if (index === AppState.currentFileIndex) {
      fileItem.classList.add('active');
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-name';
    nameSpan.textContent = file.name;
    nameSpan.onclick = () => switchFile(index);

    const deleteSpan = document.createElement('span');
    deleteSpan.className = 'file-delete';
    deleteSpan.textContent = '✕';
    deleteSpan.onclick = (e) => {
      e.stopPropagation();
      deleteFile(index);
    };

    fileItem.appendChild(nameSpan);
    fileItem.appendChild(deleteSpan);
    Elements.fileList.appendChild(fileItem);
  });
}

function switchFile(index) {
  AppState.currentFileIndex = index;
  loadCurrentFile();
  renderFileList();
}

function deleteFile(index) {
  const file = AppState.files[index];
  if (!confirm(`Delete "${file.name}"?`)) return;
  
  AppState.files.splice(index, 1);
  
  if (AppState.currentFileIndex >= AppState.files.length) {
    AppState.currentFileIndex = Math.max(0, AppState.files.length - 1);
  }
  
  renderFileList();
  loadCurrentFile();
  
  if (AppState.socket && AppState.currentRoomId) {
    AppState.socket.emit('deleteFile', { 
      roomId: AppState.currentRoomId, 
      fileIndex: index 
    });
  }
}

function handleFileUpload(file) {
  const reader = new FileReader();
  
  reader.onload = (event) => {
    const newFile = { 
      name: file.name, 
      content: event.target.result 
    };
    
    AppState.files.push(newFile);
    AppState.currentFileIndex = AppState.files.length - 1;
    
    if (AppState.socket && AppState.currentRoomId) {
      AppState.socket.emit('addFile', {
        roomId: AppState.currentRoomId,
        file: newFile
      });
    }

    renderFileList();
    loadCurrentFile();
  };
  
  reader.onerror = () => {
    alert('Error reading file');
  };
  
  reader.readAsText(file);
}

// ============ TIMER ============
function updateTimerDisplay() {
  Elements.timerValue.textContent = AppState.timerMinutes;
}

function startTimer(minutes) {
  let seconds = minutes * 60;
  clearInterval(AppState.timerInterval);
  
  AppState.timerInterval = setInterval(() => {
    if (seconds > 0) {
      seconds--;
      const m = Math.floor(seconds / 60);
      const s = seconds % 60;
      Elements.timerCountdown.textContent = `${m}:${s < 10 ? '0' : ''}${s}`;
    } else {
      Elements.timerCountdown.textContent = '0:00';
      clearInterval(AppState.timerInterval);
      alert('⏰ Timer expired!');
    }
  }, 1000);
}

function adjustTimer(delta) {
  AppState.timerMinutes = Math.max(1, Math.min(60, AppState.timerMinutes + delta));
  updateTimerDisplay();
}

// ============ EVENT HANDLERS ============
function setupEventListeners() {
  // Home page
  Elements.btnCreate.onclick = () => {
    const roomId = 'qc-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    enterRoom(roomId);
  };

  Elements.btnJoin.onclick = () => {
    let code = Elements.roomInput.value.trim().toUpperCase();
    if (!code) {
      alert('Please enter a room code');
      return;
    }
    if (!code.startsWith('QC-')) code = 'qc-' + code;
    enterRoom(code);
  };

  Elements.roomInput.onkeypress = (e) => {
    if (e.key === 'Enter') Elements.btnJoin.click();
  };

  // Room page - Copy
  Elements.btnCopy.onclick = () => {
    navigator.clipboard.writeText(AppState.currentRoomId).then(() => {
      Elements.btnCopy.textContent = '✓ Copied!';
      setTimeout(() => {
        Elements.btnCopy.textContent = '📋 Copy';
      }, 2000);
    });
  };

  // Room page - Privacy
  Elements.btnPrivacy.onclick = () => {
    AppState.isPrivacyMode = !AppState.isPrivacyMode;
    Elements.editor.classList.toggle('privacy');
    Elements.btnPrivacy.classList.toggle('active');
    Elements.btnPrivacy.textContent = AppState.isPrivacyMode 
      ? '🔓 Privacy Off' 
      : '🔒 Privacy';
  };

  // Room page - Format
  Elements.btnFormat.onclick = () => {
    const text = Elements.editor.value
      .split('\n')
      .map(line => line.trim())
      .filter(line => line)
      .join('\n\n');
    
    Elements.editor.value = text;
    
    if (AppState.files[AppState.currentFileIndex]) {
      AppState.files[AppState.currentFileIndex].content = text;
    }
  };

  // Room page - Live Share
  Elements.btnLiveShare.onclick = () => {
    AppState.isLiveShareEnabled = !AppState.isLiveShareEnabled;
    Elements.btnLiveShare.style.opacity = AppState.isLiveShareEnabled ? '1' : '0.5';
  };

  // Room page - Send
  Elements.btnSend.onclick = () => {
    const content = AppState.files[AppState.currentFileIndex]?.content;
    
    if (!content || !content.trim()) {
      alert('Cannot send empty content!');
      return;
    }

    Elements.btnSend.classList.add('sent');
    Elements.btnSend.textContent = '✓ Sent';
    Elements.btnSend.disabled = true;

    if (AppState.socket && AppState.currentRoomId) {
      AppState.socket.emit('sendContent', {
        roomId: AppState.currentRoomId,
        file: AppState.files[AppState.currentFileIndex],
        timerEnabled: AppState.isTimerEnabled,
        timerMinutes: AppState.timerMinutes
      });
    }

    if (AppState.isTimerEnabled) {
      startTimer(AppState.timerMinutes);
    }

    setTimeout(() => {
      Elements.btnSend.classList.remove('sent');
      Elements.btnSend.textContent = '✈️ Send';
      Elements.btnSend.disabled = false;
    }, 3000);
  };

  // Room page - Leave
  Elements.btnLeave.onclick = () => {
    if (!confirm('Leave this room?')) return;
    
    if (AppState.socket && AppState.currentRoomId) {
      AppState.socket.emit('leaveRoom', AppState.currentRoomId);
    }
    
    clearInterval(AppState.timerInterval);
    
    // Reset state
    AppState.files = [{ 
      name: "welcome.txt", 
      content: "Welcome to Quick Clip!\n\nStart typing or paste code here." 
    }];
    AppState.currentFileIndex = 0;
    AppState.currentRoomId = null;
    
    renderFileList();
    loadCurrentFile();
    showHome();
  };

  // Timer controls
  let minusInterval, plusInterval;
  
  Elements.btnTimerMinus.onmousedown = () => {
    adjustTimer(-1);
    minusInterval = setInterval(() => adjustTimer(-1), 150);
  };
  Elements.btnTimerMinus.onmouseup = () => clearInterval(minusInterval);
  Elements.btnTimerMinus.onmouseleave = () => clearInterval(minusInterval);

  Elements.btnTimerPlus.onmousedown = () => {
    adjustTimer(1);
    plusInterval = setInterval(() => adjustTimer(1), 150);
  };
  Elements.btnTimerPlus.onmouseup = () => clearInterval(plusInterval);
  Elements.btnTimerPlus.onmouseleave = () => clearInterval(plusInterval);

  Elements.timerToggle.onchange = (e) => {
    AppState.isTimerEnabled = e.target.checked;
    Elements.timerSection.style.opacity = AppState.isTimerEnabled ? '1' : '0.3';
  };

  // Editor
  Elements.editor.oninput = () => {
    if (AppState.files[AppState.currentFileIndex]) {
      AppState.files[AppState.currentFileIndex].content = Elements.editor.value;
      
      if (AppState.isLiveShareEnabled && AppState.socket && AppState.currentRoomId) {
        AppState.socket.emit('editorUpdate', {
          roomId: AppState.currentRoomId,
          content: Elements.editor.value,
          fileIndex: AppState.currentFileIndex
        });
      }
    }
  };

  // File upload - Drag & Drop
  Elements.dropZone.ondragover = (e) => {
    e.preventDefault();
    Elements.dropZone.classList.add('dragover');
  };
  
  Elements.dropZone.ondragleave = () => {
    Elements.dropZone.classList.remove('dragover');
  };
  
  Elements.dropZone.ondrop = (e) => {
    e.preventDefault();
    Elements.dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };
  
  Elements.dropZone.onclick = () => Elements.fileInput.click();

  Elements.fileInput.onchange = (e) => {
    if (e.target.files.length > 0) {
      handleFileUpload(e.target.files[0]);
    }
  };
}

// ============ INITIALIZATION ============
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  renderFileList();
  loadCurrentFile();
});
