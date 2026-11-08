function stopCamera() {
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = undefined;
  cameraPreview.srcObject = null;
  cameraPreview.hidden = true;
}

// Start with a working camera, then switch to the external one if we find it.
async function openCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera is unavailable in this browser.');
  photoPanel.hidden = false;
  stopCamera();
  let stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  const cameras = (await navigator.mediaDevices.enumerateDevices().catch(() => [])).filter(device => device.kind === 'videoinput');
  const external = cameras.find(device => /\b(usb|external|webcam)\b/i.test(device.label) && !/\b(integrated|built-in|internal)\b/i.test(device.label));
  if (external && external.deviceId !== stream.getVideoTracks()[0].getSettings().deviceId) {
    try {
      const preferred = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: external.deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
      stream.getTracks().forEach(track => track.stop());
      stream = preferred;
    } catch { /* Keep the working camera. */ }
  }
  cameraStream = stream;
  cameraPreview.srcObject = cameraStream;
  cameraPreview.hidden = false;
  await cameraPreview.play();
}

// Keep photos small enough to send with a chat question.
function jpegFrom(source, width, height) {
  const scale = Math.min(1, 1280 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.82);
}

// Each chat has its own photo; show the one for the tab that's open.
function renderPhoto() {
  const data = activeChat().image;
  photoPanel.classList.toggle('has-photo', !!data);
  if (data) photoPreview.src = data;
  else photoPreview.removeAttribute('src');
  photoPreview.hidden = !data;
  capturedLabel.hidden = !data;
  retakePhotoBtn.hidden = !data;
  removePhotoBtn.hidden = !data;
  setPhotoQuestionMode(!!data);
}

function showPhoto(data, chat = activeChat()) {
  chat.image = data;
  if (chat !== activeChat()) return;
  photoPanel.hidden = false;
  renderPhoto();
  voiceStatus.textContent = voiceSession ? 'Photo attached. Listening for your question…' : 'Photo attached. Ask your question.';
}

function removePhoto() {
  activeChat().image = undefined;
  renderPhoto();
}

// Wait for a real preview frame before taking the snapshot.
async function capturePhoto() {
  const chat = activeChat();
  if (!cameraStream) await openCamera();
  if (!cameraPreview.videoWidth) await new Promise(resolve => cameraPreview.addEventListener('loadeddata', resolve, { once: true }));
  showPhoto(jpegFrom(cameraPreview, cameraPreview.videoWidth, cameraPreview.videoHeight), chat);
}

retakePhotoBtn.addEventListener('click', () => capturePhoto().catch(error => { voiceStatus.textContent = error.message; }));
removePhotoBtn.addEventListener('click', () => {
  removePhoto();
  voiceStatus.textContent = 'Photo removed. Camera ready for another capture.';
});
navigator.mediaDevices?.addEventListener?.('devicechange', () => openCamera().catch(() => {}));

voiceStatus.textContent = 'Allow camera access to start the live preview…';
const cameraReady = openCamera();
cameraReady.then(() => {
  if (voiceStatus.textContent === 'Allow camera access to start the live preview…') voiceStatus.textContent = '';
}).catch(error => {
  voiceStatus.textContent = error.name === 'NotAllowedError' ? 'Allow camera access for localhost in your browser, then reload.' : 'Could not open camera.';
});
