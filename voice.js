const voiceFunctions = [
  ['take_photo', 'Attach a new photo when none is attached. Call this for capture, captured, snap, take a photo or picture, or requests like can you capture this.'],
  ['retake_photo', 'Replace an attached photo with the current camera frame when the user says retake, take it again, or take another photo.'],
  ['remove_photo', 'Remove the attached photo without taking another when the user says remove, remove photo, or discard photo.'],
  ['play_video', 'Play the latest training video when the user asks to play or resume it.'],
  ['pause_video', 'Pause the latest training video when the user asks to pause or stop it.'],
  ['rewind_video', 'Move the latest training video backward 3 seconds when the user asks to rewind or go back.'],
  ['forward_video', 'Move the latest training video forward 3 seconds when the user asks to skip ahead or go forward.'],
].map(([name, description]) => ({ name, description, parameters: { type: 'object', properties: {} }, defer_until_eot: false }));
voiceFunctions.push({
  name: 'ask_question',
  description: 'Route a spoken question or greeting to the active chat. Never route a camera or video command here. The app uses the user transcript, so do not generate question text.',
  parameters: { type: 'object', properties: {} },
  defer_until_eot: true,
});

const voiceSettings = {
  type: 'Settings',
  audio: {
    input: { encoding: 'linear16', sample_rate: 16000 },
    output: { encoding: 'linear16', sample_rate: 24000, container: 'none' },
  },
  agent: {
    language: 'en',
    listen: { provider: { type: 'deepgram', version: 'v2', model: 'flux-general-en' } },
    think: {
      provider: { type: 'open_ai', model: 'gpt-4o-mini', temperature: 0 },
      prompt: 'Route each spoken turn to exactly one function. Commands take priority even when a photo is attached. "Capture", "Captured", "capture this", and "can you capture this?" mean take_photo; "captured" is often a transcription of "capture". "Retake" means replace the photo with the current camera frame; "remove" means delete it without capturing. "Capture, retake" means retake_photo. Use play_video, pause_video, rewind_video, or forward_video for playback commands. Only genuine questions and greetings go to ask_question, with the user’s words. After a photo, send the next actual question to ask_question. Never send command words to ask_question. Do not answer or narrate.',
      functions: voiceFunctions,
    },
    speak: { provider: { type: 'deepgram', model: 'aura-2-thalia-en' } },
  },
};

// Close the mic, audio processing, and socket when voice mode ends.
function stopVoice(message = '') {
  const session = voiceSession;
  voiceSession = undefined;
  session?.processor?.disconnect();
  session?.source?.disconnect();
  session?.gain?.disconnect();
  session?.context.close();
  session?.stream.getTracks().forEach(track => track.stop());
  session?.socket.close();
  micBtn.setAttribute('aria-pressed', 'false');
  micBtn.setAttribute('aria-label', 'Enable voice');
  micBtn.title = 'Enable voice';
  voiceStatus.textContent = message;
  heardSpeech.hidden = true;
}

// Use the clip on screen, not an older one farther up the conversation.
function activeVideo() {
  const view = conversation.getBoundingClientRect();
  const visible = [...activeChat().messages.querySelectorAll('video')].filter(video => {
    const rect = video.getBoundingClientRect();
    return rect.width > 0 && rect.bottom > Math.max(0, view.top) && rect.top < Math.min(innerHeight, view.bottom);
  });
  return visible.find(video => !video.paused) || visible.at(-1);
}

function sendVoiceQuestion(question) {
  if (!question) throw new Error('No question was heard.');
  if (activeChat().sending) throw new Error('Wait for the current answer, then ask again.');
  setPhotoQuestionMode(false);
  input.value = question;
  form.requestSubmit();
  voiceStatus.textContent = 'Question sent.';
  return { ok: true };
}

// Sometimes a clear camera command arrives as a question. Catch it here.
function cameraCommandOnly(speech) {
  const names = speech.toLowerCase().split(/[,;.!?]+|\band(?: then)?\b/).map(part => {
    const phrase = part.trim();
    if (/^(?:capture(?:d| this)?|take (?:a )?(?:photo|picture)|snap(?: (?:a )?(?:photo|picture))?)$/.test(phrase)) return 'take_photo';
    if (/^retake(?: (?:the )?(?:photo|picture))?$/.test(phrase)) return 'retake_photo';
    if (/^(?:remove|discard)(?: (?:the )?(?:photo|picture))?$/.test(phrase)) return 'remove_photo';
    return phrase ? null : undefined;
  }).filter(name => name !== undefined);
  return names.length && names.every(Boolean) ? names.at(-1) : null;
}

// Give the user more time to finish speaking after attaching a photo.
function setPhotoQuestionMode(active) {
  if (!voiceSession?.settingsApplied || voiceSession.awaitingPhotoQuestion === active || voiceSession.socket.readyState !== WebSocket.OPEN) return;
  voiceSession.awaitingPhotoQuestion = active;
  voiceSession.socket.send(JSON.stringify({
    type: 'UpdateListen',
    listen: { provider: { type: 'deepgram', version: 'v2', model: 'flux-general-en', eot_threshold: active ? 1 : 0.7, eot_timeout_ms: active ? 3000 : 5000 } },
  }));
}

async function runVoiceFunction(session, call) {
  const video = activeVideo();
  if (['take_photo', 'retake_photo', 'remove_photo'].includes(call.name)) {
    if (!session.lastSpeech?.trim()) return { ok: true, ignored: true };
  }
  switch (call.name) {
    case 'take_photo': {
      if (activeChat().image) throw new Error('A photo is already attached. Say retake to replace it.');
      await capturePhoto();
      return { ok: true, message: 'Photo attached. Listening for a question.' };
    }
    case 'retake_photo': {
      if (!activeChat().image) throw new Error('No photo to retake. Say capture to take one.');
      await capturePhoto();
      return { ok: true, message: 'Photo replaced. Listening for a question.' };
    }
    case 'remove_photo': {
      removePhoto();
      voiceStatus.textContent = 'Photo removed. Camera ready for another capture.';
      return { ok: true };
    }
    case 'play_video':
      if (!video) throw new Error('No video is visible yet. Ask a procedure question to show a clip.');
      try { await video.play(); }
      catch (error) {
        if (error.name !== 'NotAllowedError') throw error;
        video.muted = true;
        await video.play();
      }
      voiceStatus.textContent = video.muted ? 'Playing video muted. Use its controls for sound.' : 'Playing video.';
      return { ok: true };
    case 'pause_video':
      if (!video) throw new Error('No video is visible yet. Ask a procedure question to show a clip.');
      video.pause();
      voiceStatus.textContent = 'Video paused.';
      return { ok: true };
    case 'rewind_video':
    case 'forward_video': {
      if (!video) throw new Error('No video is visible yet. Ask a procedure question to show a clip.');
      const offset = call.name === 'rewind_video' ? -3 : 3;
      video.currentTime = Math.max(0, Math.min(Number.isFinite(video.duration) ? video.duration : Infinity, video.currentTime + offset));
      voiceStatus.textContent = offset < 0 ? 'Rewound 3 seconds.' : 'Forwarded 3 seconds.';
      return { ok: true };
    }
    case 'ask_question': {
      const question = (session.lastSpeech || '').trim();
      if (!question) return { ok: true, ignored: true };
      const command = cameraCommandOnly(question);
      if (command) return runVoiceFunction(session, { name: command, arguments: '{}' });
      if (session.lastQuestion?.text === question && Date.now() - session.lastQuestion.at < 30_000) return { ok: true, ignored: true };
      const result = sendVoiceQuestion(question);
      session.lastQuestion = { text: question, at: Date.now() };
      return result;
    }
    default:
      throw new Error('Unknown voice command.');
  }
}

async function handleVoiceEvent(session, event) {
  if (voiceSession !== session || typeof event.data !== 'string') return;
  const message = JSON.parse(event.data);
  if (message.type === 'Welcome') session.socket.send(JSON.stringify(voiceSettings));
  if (message.type === 'SettingsApplied') {
    session.settingsApplied = true;
    // Send the mic audio to Deepgram as 16-bit samples.
    session.source = session.context.createMediaStreamSource(session.stream);
    session.processor = session.context.createScriptProcessor(2048, 1, 1);
    session.gain = session.context.createGain();
    session.gain.gain.value = 0;
    session.processor.onaudioprocess = audio => {
      if (session.socket.readyState !== WebSocket.OPEN) return;
      const samples = audio.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(samples.length);
      for (let i = 0; i < samples.length; i++) pcm[i] = Math.max(-1, Math.min(1, samples[i])) * 0x7fff;
      session.socket.send(pcm.buffer);
    };
    session.source.connect(session.processor);
    session.processor.connect(session.gain);
    session.gain.connect(session.context.destination);
    voiceStatus.textContent = 'Listening…';
    heardSpeech.textContent = 'Heard: waiting for speech…';
    heardSpeech.hidden = false;
    if (activeChat().image) setPhotoQuestionMode(true);
  }
  if (message.type === 'UserStartedSpeaking') heardSpeech.textContent = 'Heard: speech detected…';
  if (message.type === 'ConversationText' && message.role === 'user') {
    session.lastSpeech = message.content;
    heardSpeech.textContent = `Heard: ${message.content}`;
    heardSpeech.hidden = false;
  }
  if (message.type === 'FunctionCallRequest') {
    for (const call of message.functions || []) {
      if (call.client_side === false) continue;
      let result;
      try { result = await runVoiceFunction(session, call); }
      catch (error) {
        result = { ok: false, error: error.message };
        voiceStatus.textContent = error.message;
      }
      if (voiceSession === session && session.socket.readyState === WebSocket.OPEN) {
        session.socket.send(JSON.stringify({ type: 'FunctionCallResponse', id: call.id, name: call.name, content: JSON.stringify(result) }));
      }
    }
    session.lastSpeech = '';
  }
  if (message.type === 'Error') stopVoice(message.description || 'Voice agent stopped.');
}

micBtn.addEventListener('click', async () => {
  if (voiceSession) return stopVoice();
  if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext || !window.WebSocket) {
    voiceStatus.textContent = 'Voice mode is unavailable in this browser.';
    return;
  }
  micBtn.disabled = true;
  voiceStatus.textContent = 'Starting voice mode…';
  heardSpeech.hidden = true;
  let stream;
  let context;
  try {
    const voiceConfig = await fetch('/api/voice-status').then(response => response.json());
    if (!voiceConfig.configured) throw new Error('Voice needs a Deepgram API key in .env.');
    const audio = { echoCancellation: true, noiseSuppression: true, channelCount: 1 };
    // Mic permission lets us see which input is paired with the camera.
    stream = await navigator.mediaDevices.getUserMedia({ audio });
    await cameraReady.catch(() => {});
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const cameraId = cameraStream?.getVideoTracks()[0]?.getSettings().deviceId;
    const camera = devices.find(device => device.kind === 'videoinput' && device.deviceId === cameraId);
    const cameraMic = camera?.groupId && devices.find(device => device.kind === 'audioinput' && device.groupId === camera.groupId);
    if (cameraMic && cameraMic.deviceId !== stream.getAudioTracks()[0].getSettings().deviceId) {
      try {
        const preferred = await navigator.mediaDevices.getUserMedia({ audio: { ...audio, deviceId: { exact: cameraMic.deviceId } } });
        stream.getTracks().forEach(track => track.stop());
        stream = preferred;
      } catch { /* Keep the working microphone. */ }
    }
    context = new AudioContext({ sampleRate: 16000 });
    await context.resume();
    const socket = new WebSocket(`ws${location.protocol === 'https:' ? 's' : ''}://${location.host}/api/voice`);
    const session = { stream, context, socket, awaitingPhotoQuestion: false, settingsApplied: false };
    voiceSession = session;
    socket.onmessage = event => handleVoiceEvent(session, event).catch(error => {
      voiceStatus.textContent = error.message || 'Voice mode failed.';
    });
    socket.onerror = () => { if (voiceSession === session) stopVoice('Could not connect to Voice Agent.'); };
    socket.onclose = () => { if (voiceSession === session) stopVoice('Voice connection ended.'); };
    micBtn.setAttribute('aria-pressed', 'true');
    micBtn.setAttribute('aria-label', 'Disable voice');
    micBtn.title = 'Disable voice';
  } catch (error) {
    stream?.getTracks().forEach(track => track.stop());
    context?.close();
    voiceStatus.textContent = error.name === 'NotAllowedError' ? 'Microphone access was denied.' : error.message || 'Could not start voice mode.';
  } finally {
    micBtn.disabled = false;
  }
});
