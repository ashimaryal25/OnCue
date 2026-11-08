const form = document.getElementById('chatForm');
const input = document.getElementById('questionInput');
const conversation = document.getElementById('conversation');
const micBtn = document.getElementById('micBtn');
const voiceStatus = document.getElementById('voiceStatus');
const heardSpeech = document.getElementById('heardSpeech');
const photoPanel = document.getElementById('photoPanel');
const cameraPreview = document.getElementById('cameraPreview');
const photoPreview = document.getElementById('photoPreview');
const capturedLabel = document.getElementById('capturedLabel');
const retakePhotoBtn = document.getElementById('retakePhotoBtn');
const removePhotoBtn = document.getElementById('removePhotoBtn');
let voiceSession;
let cameraStream;
const chats = Object.fromEntries(['training', 'general'].map(name => [name, {
  view: document.getElementById(`${name}Chat`),
  welcome: document.getElementById(`${name}Welcome`),
  messages: document.getElementById(`${name}Messages`),
  history: [], draft: '', image: undefined, sending: false, abort: null, id: 0,
}]));
let mode = 'training';
const activeChat = () => chats[mode];
const sendBtn = form.querySelector('button[type="submit"]');

function scrollToBottom(chat) {
  if (chat === activeChat()) conversation.scrollTop = conversation.scrollHeight;
}

function addMessage(chat, role, text) {
  const message = document.createElement('article');
  message.className = `message ${role}`;
  const label = document.createElement('p');
  label.className = 'message-label';
  label.textContent = role === 'user' ? 'You' : 'OnCue';
  const body = document.createElement('p');
  body.className = 'message-body';
  body.textContent = text;
  message.append(label, body);
  chat.messages.append(message);
  scrollToBottom(chat);
  return body;
}

// Keep this question tied to its chat if the user switches tabs mid-answer.
form.addEventListener('submit', async event => {
  event.preventDefault();
  const chat = activeChat();
  const chatMode = mode;
  const question = input.value.trim();
  if (!question || chat.sending) return;
  const photo = chat.image;
  if (photo) setPhotoQuestionMode(false);
  const prior = photo ? chat.history.map(({ image, ...turn }) => turn) : chat.history;
  const currentConversation = chat.id;
  chat.sending = true;
  chat.abort = new AbortController();
  sendBtn.disabled = true;
  chat.welcome.hidden = true;
  const userMessage = addMessage(chat, 'user', question);
  if (photo) {
    const thumbnail = document.createElement('img');
    thumbnail.className = 'sent-photo';
    thumbnail.src = photo;
    thumbnail.alt = 'Attached photo';
    userMessage.parentElement.append(thumbnail);
  }
  const answer = addMessage(chat, 'assistant', 'Thinking…');
  input.value = '';
  input.focus();
  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: chatMode, question, history: prior, image: photo }),
      signal: chat.abort.signal,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not get an answer. Try again.');
    if (currentConversation !== chat.id) return;
    answer.textContent = result.answer;
    if (result.video) {
      const clip = document.createElement('video');
      clip.controls = true;
      clip.preload = 'metadata';
      clip.playsInline = true;
      clip.addEventListener('loadedmetadata', () => scrollToBottom(chat), { once: true });
      clip.src = result.video.src;
      clip.setAttribute('aria-label', result.video.title);
      clip.addEventListener('playing', () => {
        if (activeVideo() === clip) voiceStatus.textContent = clip.muted ? 'Playing video muted. Use its controls for sound.' : 'Playing video.';
      });
      clip.addEventListener('pause', () => {
        if (activeVideo() === clip) voiceStatus.textContent = 'Video paused.';
      });
      clip.addEventListener('ended', () => {
        if (activeVideo() === clip) voiceStatus.textContent = 'Video ended.';
      });
      const caption = document.createElement('p');
      caption.className = 'video-caption';
      caption.textContent = result.video.title;
      answer.parentElement.append(clip, caption);
    }
    // Don't resend older photos with every later question.
    if (photo) chat.history.forEach(turn => { delete turn.image; });
    chat.history.push({ role: 'user', text: question, ...(photo ? { image: photo } : {}) }, { role: 'model', text: result.answer });
    chat.history = chat.history.slice(-20);
    if (photo && chat.image === photo) {
      chat.image = undefined;
      if (chat === activeChat()) {
        renderPhoto();
        voiceStatus.textContent = '';
      }
    }
  } catch (error) {
    if (currentConversation === chat.id) answer.textContent = error.message;
  } finally {
    if (currentConversation === chat.id) {
      chat.sending = false;
      chat.abort = null;
      if (chat === activeChat()) sendBtn.disabled = false;
      scrollToBottom(chat);
    }
  }
});

input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.getElementById('newChatBtn').addEventListener('click', () => {
  const chat = activeChat();
  chat.id++;
  chat.abort?.abort();
  chat.abort = null;
  chat.sending = false;
  sendBtn.disabled = false;
  chat.history = [];
  chat.draft = '';
  removePhoto();
  chat.messages.replaceChildren();
  chat.welcome.hidden = false;
  input.value = '';
  voiceStatus.textContent = '';
  heardSpeech.hidden = true;
  input.focus();
});

document.querySelectorAll('.chat-modes button').forEach(button => button.addEventListener('click', () => {
  if (button.dataset.mode === mode) return;
  activeChat().draft = input.value;
  mode = button.dataset.mode;
  for (const [name, chat] of Object.entries(chats)) chat.view.hidden = name !== mode;
  document.querySelectorAll('.chat-modes button').forEach(tab => {
    if (tab === button) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  renderPhoto();
  input.value = activeChat().draft;
  sendBtn.disabled = activeChat().sending;
  voiceStatus.textContent = activeChat().image ? (voiceSession ? 'Photo attached. Listening for your question…' : 'Photo attached. Ask your question.') : (voiceSession ? 'Listening…' : '');
  conversation.scrollTop = conversation.scrollHeight;
  input.focus();
}));
