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
  const normalControls = camera.querySelector('.camera-controls');
  normalControls.style.zIndex = '3';
  const reviewControls = document.createElement('div');
  reviewControls.className = 'capture-review';
  reviewControls.hidden = true;
  reviewControls.innerHTML = '<button type="button" data-retake>Retake</button><button type="button" data-approve>Use photo</button>';
  camera.appendChild(reviewControls);
  const galleryTitle = document.createElement('div');
  galleryTitle.innerHTML = '<strong>Your shots</strong><span>Photos save automatically</span>';
  Object.assign(galleryTitle.style, {display: 'none', justifyContent: 'space-between', alignItems: 'center', marginTop: '18px', color: '#fff'});
  Object.assign(galleryTitle.querySelector('span').style, {fontSize: '12px', color: '#8f9b95'});
  strip.parentNode.insertBefore(galleryTitle, strip);
  Object.assign(strip.style, {display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', overflow: 'visible'});
  const token = camera.dataset.token;
  let facingMode = 'environment';
  let stream;
  let imageCapture = null;
  let remaining = Number(camera.dataset.remaining || 5);
  let nativeCapture = false;
  const maxPhotoBytes = 1536 * 1024;
  let pendingPhoto = null;
  let pendingPreviewUrl = '';
  let previewTimer = null;
  let cameraRequestId = 0;

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
    const requestId = ++cameraRequestId;
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
      switchButton.disabled = true;
      if (stream) stream.getTracks().forEach(track => track.stop());
      stream = null;
      imageCapture = null;
      video.pause();
      video.srcObject = null;
      await new Promise(resolve => setTimeout(resolve, 180));
      const mediaRequest = navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: facingMode}, width: {ideal: 1920}, height: {ideal: 1080}}, audio: false});
      let requestTimedOut = false;
      mediaRequest.then(lateStream => {
        if (requestTimedOut || requestId !== cameraRequestId) lateStream.getTracks().forEach(track => track.stop());
      }).catch(() => {});
      const timeout = new Promise((_, reject) => setTimeout(() => { requestTimedOut = true; reject(new Error('Camera preview timed out')); }, 7000));
      stream = await Promise.race([mediaRequest, timeout]);
      if (requestId !== cameraRequestId) { stream.getTracks().forEach(track => track.stop()); return; }
      if (requestTimedOut) { stream.getTracks().forEach(track => track.stop()); return; }
      nativeCapture = false;
      video.srcObject = stream;
      await video.play().catch(() => {});
      const videoTrack = stream.getVideoTracks()[0];
      imageCapture = 'ImageCapture' in window && videoTrack ? new ImageCapture(videoTrack) : null;
      switchButton.style.display = '';
      switchButton.disabled = false;
      setStatus(`${remaining} photo${remaining === 1 ? '' : 's'} remaining`);
    } catch (_) {
      switchButton.disabled = false;
      useNativeCamera();
    }
  }

  async function fitAtFullQuality(blob) {
    if (blob.size <= maxPhotoBytes) return blob;
    const bitmap = await createImageBitmap(blob);
    let width = bitmap.width;
    let height = bitmap.height;
    let result = blob;
    for (let attempt = 0; attempt < 8 && result.size > maxPhotoBytes; attempt++) {
      const ratio = attempt === 0 ? Math.min(1, 2400 / Math.max(width, height)) : Math.min(.9, Math.sqrt(maxPhotoBytes / result.size) * .94);
      width = Math.max(640, Math.round(width * ratio));
      height = Math.max(480, Math.round(height * ratio));
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
      result = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 1));
    }
    bitmap.close?.();
    return result;
  }

  async function upload(blob) {
    capture.disabled = true;
    try {
      blob = await fitAtFullQuality(blob);
      if (blob.size > maxPhotoBytes) throw new Error('This photo could not be fitted within the 1.5 MB limit.');
    } catch (error) {
      setStatus(error.message || 'Could not prepare this photo.', true);
      capture.disabled = false;
      return false;
    }
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
        clearTimeout(previewTimer);
        previewTimer = setTimeout(() => { lastPhoto.style.display = 'none'; }, 1200);
      }
      const img = new Image();
      img.src = data.url;
      img.alt = 'Your captured photo';
      Object.assign(img.style, {width: '100%', height: 'auto', aspectRatio: '1 / 1', objectFit: 'cover', borderRadius: '14px', border: '2px solid #29322e'});
      strip.prepend(img);
      galleryTitle.style.display = 'flex';
      setStatus(remaining ? `${remaining} photo${remaining === 1 ? '' : 's'} remaining` : 'All 5 moments captured — thank you!');
      capture.disabled = remaining < 1;
      return true;
    } catch (error) {
      setStatus(error.message, true); capture.disabled = false;
      return false;
    }
  }

  function review(blob) {
    clearTimeout(previewTimer);
    pendingPhoto = blob;
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingPreviewUrl = URL.createObjectURL(blob);
    lastPhoto.src = pendingPreviewUrl;
    lastPhoto.style.display = 'block';
    normalControls.style.display = 'none';
    reviewControls.hidden = false;
    reviewControls.style.display = 'grid';
    reviewControls.style.pointerEvents = 'auto';
    reviewControls.querySelectorAll('button').forEach(button => { button.disabled = false; });
    setStatus('Keep this photo or retake it?');
  }

  function finishReview(keepPreview = false) {
    if (pendingPreviewUrl && !keepPreview) URL.revokeObjectURL(pendingPreviewUrl);
    pendingPreviewUrl = '';
    pendingPhoto = null;
    reviewControls.hidden = true;
    reviewControls.style.display = 'none';
    reviewControls.style.pointerEvents = 'none';
    normalControls.style.display = 'flex';
    if (!keepPreview) lastPhoto.style.display = 'none';
  }

  reviewControls.querySelector('[data-retake]').addEventListener('click', () => {
    finishReview(false);
    capture.disabled = remaining < 1;
    setStatus(`${remaining} photo${remaining === 1 ? '' : 's'} remaining`);
  });

  reviewControls.querySelector('[data-approve]').addEventListener('click', async () => {
    if (!pendingPhoto) return;
    const approvedPhoto = pendingPhoto;
    const approvedPreviewUrl = pendingPreviewUrl;
    finishReview(true);
    setStatus('Uploading approved photo…');
    const uploaded = await upload(approvedPhoto);
    if (approvedPreviewUrl) URL.revokeObjectURL(approvedPreviewUrl);
    if (!uploaded) review(approvedPhoto);
  });

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
    let blob = null;
    if (imageCapture) {
      try {
        const fullResolution = await imageCapture.takePhoto();
        blob = fullResolution;
      } catch (_) {}
    }
    if (!blob) {
      canvas.width = Math.min(video.videoWidth, 2400);
      canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 1));
    }
    review(blob);
  });

  fileCamera.addEventListener('change', async () => {
    if (fileCamera.files?.[0]) review(fileCamera.files[0]);
    fileCamera.value = '';
  });

  switchButton?.addEventListener('click', () => {
    lastPhoto.style.display = 'none';
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    start();
  });
  window.addEventListener('pagehide', () => {
    cameraRequestId++;
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
  });
  window.addEventListener('pageshow', event => { if (event.persisted && remaining > 0) start(); });
  start();
})();
