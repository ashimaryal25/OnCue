const form = document.getElementById('chatForm');
const input = document.getElementById('questionInput');
const messages = document.getElementById('messages');
const welcome = document.getElementById('welcome');
const conversation = document.getElementById('conversation');

function addMessage(role, text) {
  const message = document.createElement('article');
  message.className = `message ${role}`;
  const label = document.createElement('p');
  label.className = 'message-label';
  label.textContent = role === 'user' ? 'You' : 'OnCue';
  const body = document.createElement('p');
  body.className = 'message-body';
  body.textContent = text;
  message.append(label, body);
  messages.append(message);
  conversation.scrollTop = conversation.scrollHeight;
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question) return;
  welcome.hidden = true;
  addMessage('user', question);
  addMessage('assistant', 'I don’t have procedure information to answer that yet.');
  input.value = '';
  input.focus();
});

input.addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    form.requestSubmit();
  }
});

document.getElementById('newChatBtn').addEventListener('click', () => {
  messages.replaceChildren();
  welcome.hidden = false;
  input.value = '';
  input.focus();
});
