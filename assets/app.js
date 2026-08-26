(() => {
  const camera = document.querySelector('[data-camera]');
  if (!camera) return;
  const video = camera.querySelector('video');
  const canvas = camera.querySelector('canvas');
  const capture = camera.querySelector('[data-capture]');
  const switchButton = camera.querySelector('[data-switch]');
  const status = document.querySelector('[data-status]');
  const strip = document.querySelector('[data-strip]');
  const fileCamera = camera.querySelector('[data-file-camera]');
  const lastPhoto = new Image();
  lastPhoto.alt = 'Most recently captured photo';
  Object.assign(lastPhoto.style, {position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', display: 'none', pointerEvents: 'none', zIndex: '1'});
  camera.insertBefore(lastPhoto, camera.querySelector('.camera-controls'));
  camera.querySelector('.camera-controls').style.zIndex = '3';
  const galleryTitle = document.createElement('div');
  galleryTitle.innerHTML = '<strong>Your shots</strong><span>Photos save automatically</span>';
  Object.assign(galleryTitle.style, {display: 'none', justifyContent: 'space-between', alignItems: 'center', marginTop: '18px', color: '#fff'});
  Object.assign(galleryTitle.querySelector('span').style, {fontSize: '12px', color: '#8f9b95'});
  strip.parentNode.insertBefore(galleryTitle, strip);
  Object.assign(strip.style, {display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', overflow: 'visible'});
  const token = camera.dataset.token;
  let facingMode = 'environment';
  let stream;
  let remaining = Number(camera.dataset.remaining || 5);
  let nativeCapture = false;

  const setStatus = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('error', error);
  };

  function useNativeCamera() {
    nativeCapture = true;
    video.style.display = 'none';
    switchButton.style.display = 'none';
    capture.disabled = remaining < 1;
    setStatus(remaining < 1 ? 'All 5 moments captured — thank you!' : `Tap the shutter to open your phone camera · ${remaining} remaining`);
  }

  async function start() {
    if (remaining < 1) {
      capture.disabled = true;
      switchButton.style.display = 'none';
      setStatus('All 5 moments captured — thank you!');
      return;
    }
    try {
      lastPhoto.style.display = 'none';
      video.style.display = 'block';
      setStatus('Starting camera…');
      if (location.protocol !== 'https:' || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia) { useNativeCamera(); return; }
      if (stream) stream.getTracks().forEach(track => track.stop());
      stream = await Promise.race([
        navigator.mediaDevices.getUserMedia({video: {facingMode}, audio: false}),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Camera preview timed out')), 5000)),
      ]);
      nativeCapture = false;
      video.srcObject = stream;
      switchButton.style.display = '';
      setStatus(`${remaining} photo${remaining === 1 ? '' : 's'} remaining`);
    } catch (_) {
      useNativeCamera();
    }
  }

  async function upload(blob) {
    capture.disabled = true;
    const form = new FormData();
    form.append('photo', blob, 'moment.jpg');
    form.append('token', token);
    form.append('csrf', document.querySelector('meta[name="csrf-token"]').content);
    try {
      const response = await fetch('?action=upload', {method: 'POST', body: form});
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Upload failed');
      remaining = data.remaining;
      lastPhoto.src = data.url;
      lastPhoto.style.display = 'block';
      if (!nativeCapture && remaining > 0) {
        setTimeout(() => { lastPhoto.style.display = 'none'; }, 1200);
      }
      const img = new Image();
      img.src = data.url;
      img.alt = 'Your captured photo';
      Object.assign(img.style, {width: '100%', height: 'auto', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: '14px', border: '2px solid #29322e'});
      strip.prepend(img);
      galleryTitle.style.display = 'flex';
      setStatus(remaining ? `${remaining} photo${remaining === 1 ? '' : 's'} remaining` : 'All 5 moments captured — thank you!');
      capture.disabled = remaining < 1;
    } catch (error) {
      setStatus(error.message, true); capture.disabled = false;
    }
  }

  capture.addEventListener('click', async () => {
    if (remaining < 1) return;
    if (nativeCapture) {
      fileCamera.value = '';
      fileCamera.click();
      return;
    }
    if (!video.videoWidth) {
      useNativeCamera();
      fileCamera.value = '';
      fileCamera.click();
      return;
    }
    capture.disabled = true;
    canvas.width = Math.min(video.videoWidth, 1600);
    canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
    await upload(blob);
  });

  fileCamera.addEventListener('change', async () => {
    if (fileCamera.files?.[0]) await upload(fileCamera.files[0]);
    fileCamera.value = '';
  });

  switchButton?.addEventListener('click', () => {
    lastPhoto.style.display = 'none';
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    start();
  });
  start();
})();
