(() => {
  const camera = document.querySelector('[data-camera]');
  if (!camera) return;
  const guestSessionId = camera.dataset.sessionId || '';
  const guestSessionCookie = camera.dataset.sessionCookie || '';
  const eventToken = camera.dataset.token || '';
  if (/^[a-f0-9]{32}$/.test(guestSessionId) && eventToken) {
    try { localStorage.setItem(`povents_guest_${eventToken}`, guestSessionId); } catch (error) {}
    if (guestSessionCookie) document.cookie = `${guestSessionCookie}=${guestSessionId}; path=/; SameSite=Lax`;
  }
  const video = camera.querySelector('video');
  const canvas = camera.querySelector('canvas');
  const capture = camera.querySelector('[data-capture]');
  const switchButton = camera.querySelector('[data-switch]');
  const orientationButton = camera.querySelector('[data-orientation]');
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
  reviewControls.innerHTML = '<input type="text" data-caption maxlength="30" placeholder="Add a caption (optional)" aria-label="Photo caption, maximum 30 characters"><button type="button" data-retake>Retake</button><button type="button" data-approve>Use photo</button>';
  camera.appendChild(reviewControls);
  const watermarkPreview = document.createElement('div');
  watermarkPreview.className = 'watermark-preview';
  watermarkPreview.hidden = true;
  const watermarkPreviewLogo = new Image();
  watermarkPreviewLogo.src = 'assets/povents-logo.png?v=5';
  watermarkPreviewLogo.alt = 'POVents';
  const watermarkPreviewCaption = document.createElement('span');
  watermarkPreview.append(watermarkPreviewLogo, watermarkPreviewCaption);
  camera.appendChild(watermarkPreview);
  const captionInput = reviewControls.querySelector('[data-caption]');
  const galleryTitle = document.createElement('div');
  galleryTitle.innerHTML = '<strong>Your shots</strong><span>Photos save automatically</span>';
  Object.assign(galleryTitle.style, {display: 'none', justifyContent: 'space-between', alignItems: 'center', marginTop: '18px', color: '#fff'});
  Object.assign(galleryTitle.querySelector('span').style, {fontSize: '12px', color: '#8f9b95'});
  strip.parentNode.insertBefore(galleryTitle, strip);
  Object.assign(strip.style, {display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', overflow: 'visible'});
  const token = camera.dataset.token;
  let facingMode = 'environment';
  let captureOrientation = 'portrait';
  let stream;
  let imageCapture = null;
  let remaining = Number(camera.dataset.remaining || 5);
  const photoLimit = Math.max(1, Number(camera.dataset.limit || remaining || 5));
  let nativeCapture = false;
  const maxPhotoBytes = 1536 * 1024;
  let pendingPhoto = null;
  let pendingOrientation = 'portrait';
  let pendingPreviewUrl = '';
  let previewTimer = null;
  let cameraRequestId = 0;
  const watermarkLogo = new Image();
  watermarkLogo.src = 'assets/povents-logo.png?v=5';
  const watermarkLogoReady = new Promise((resolve, reject) => {
    watermarkLogo.onload = resolve;
    watermarkLogo.onerror = reject;
    if (watermarkLogo.complete && watermarkLogo.naturalWidth) resolve();
  });

  const setStatus = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle('error', error);
  };

  function useNativeCamera() {
    nativeCapture = true;
    video.style.display = 'none';
    switchButton.style.display = 'none';
    capture.disabled = remaining < 1;
    setStatus(remaining < 1 ? `All ${photoLimit} moments captured — thank you!` : `Tap the shutter to open your phone camera · ${remaining} remaining`);
  }

  async function start() {
    const requestId = ++cameraRequestId;
    if (remaining < 1) {
      capture.disabled = true;
      switchButton.style.display = 'none';
      setStatus(`All ${photoLimit} moments captured — thank you!`);
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
      video.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none';
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

  async function mirrorPhoto(blob) {
    const bitmap = await createImageBitmap(blob);
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    context.save();
    context.translate(canvas.width, 0);
    context.scale(-1, 1);
    context.drawImage(bitmap, 0, 0);
    context.restore();
    bitmap.close?.();
    return await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 1));
  }

  async function addWatermark(blob, caption, orientation) {
    await watermarkLogoReady;
    const bitmap = await createImageBitmap(blob);
    const portrait = orientation !== 'landscape';
    const targetRatio = portrait ? 3 / 4 : 4 / 3;
    const sourceRatio = bitmap.width / bitmap.height;
    let sourceX = 0;
    let sourceY = 0;
    let sourceWidth = bitmap.width;
    let sourceHeight = bitmap.height;
    if (sourceRatio > targetRatio) {
      sourceWidth = bitmap.height * targetRatio;
      sourceX = (bitmap.width - sourceWidth) / 2;
    } else if (sourceRatio < targetRatio) {
      sourceHeight = bitmap.width / targetRatio;
      sourceY = (bitmap.height - sourceHeight) / 2;
    }
    canvas.width = portrait ? 768 : 1024;
    canvas.height = portrait ? 1024 : 768;
    const context = canvas.getContext('2d');
    context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
    if (!caption) {
      bitmap.close?.();
      const cleanPhoto = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .96));
      if (!cleanPhoto) throw new Error('The photo could not be prepared.');
      return cleanPhoto;
    }
    const fontSize = Math.max(22, Math.min(54, Math.round(canvas.width * .035)));
    const padding = Math.round(fontSize * .7);
    context.font = `700 ${fontSize}px system-ui, sans-serif`;
    context.textBaseline = 'middle';
    let logoHeight = Math.round(fontSize * 1.45);
    let logoWidth = Math.round(logoHeight * watermarkLogo.naturalWidth / watermarkLogo.naturalHeight);
    const maximumLogoWidth = Math.round(canvas.width * .38);
    if (logoWidth > maximumLogoWidth) { logoHeight = Math.round(logoHeight * maximumLogoWidth / logoWidth); logoWidth = maximumLogoWidth; }
    const barHeight = Math.max(logoHeight, fontSize) + padding * 1.5;
    context.fillStyle = 'rgba(3, 28, 21, .86)';
    context.fillRect(0, canvas.height - barHeight, canvas.width, barHeight);
    const logoY = canvas.height - barHeight / 2 - logoHeight / 2;
    context.drawImage(watermarkLogo, padding, logoY, logoWidth, logoHeight);
    context.fillStyle = '#ffffff';
    const captionX = padding + logoWidth + padding;
    const captionWidth = Math.max(fontSize * 2, canvas.width - captionX - padding);
    let captionCore = caption;
    let captionText = `“${captionCore}”`;
    while (captionCore.length > 1 && context.measureText(captionText).width > captionWidth) {
      captionCore = captionCore.slice(0, -1);
      captionText = `“${captionCore}…”`;
    }
    context.fillText(captionText, captionX, canvas.height - barHeight / 2);
    bitmap.close?.();
    const result = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .96));
    if (!result) throw new Error('The caption could not be applied to this photo.');
    return result;
  }

  async function upload(blob) {
    capture.disabled = true;
    try {
      blob = await fitAtFullQuality(blob);
      if (blob.size > maxPhotoBytes) throw new Error('This photo could not be fitted within the 1.5 MB limit.');
    } catch (error) {
      capture.disabled = false;
      throw new Error(error.message || 'Could not prepare this photo.');
    }
    const form = new FormData();
    form.append('photo', blob, 'moment.jpg');
    form.append('token', token);
    form.append('csrf', document.querySelector('meta[name="csrf-token"]').content);
    try {
      const response = await fetch('?action=upload', {method: 'POST', body: form});
      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); }
      catch (_) { throw new Error(responseText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || `Upload failed with server status ${response.status}.`); }
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
      setStatus(remaining ? `${remaining} photo${remaining === 1 ? '' : 's'} remaining` : `All ${photoLimit} moments captured — thank you!`);
      capture.disabled = remaining < 1;
      return true;
    } catch (error) {
      capture.disabled = false;
      throw error;
    }
  }

  function review(blob, caption = '', orientation = captureOrientation) {
    clearTimeout(previewTimer);
    pendingPhoto = blob;
    pendingOrientation = orientation;
    if (pendingPreviewUrl) URL.revokeObjectURL(pendingPreviewUrl);
    pendingPreviewUrl = URL.createObjectURL(blob);
    lastPhoto.src = pendingPreviewUrl;
    lastPhoto.style.display = 'block';
    normalControls.style.display = 'none';
    reviewControls.hidden = false;
    reviewControls.style.display = 'grid';
    reviewControls.style.pointerEvents = 'auto';
    reviewControls.querySelectorAll('button').forEach(button => { button.disabled = false; });
    captionInput.value = caption;
    watermarkPreviewCaption.textContent = caption ? `“${caption}”` : '';
    watermarkPreview.hidden = !caption;
    setStatus('Keep this photo or retake it?');
  }

  function finishReview(keepPreview = false) {
    if (pendingPreviewUrl && !keepPreview) URL.revokeObjectURL(pendingPreviewUrl);
    pendingPreviewUrl = '';
    pendingPhoto = null;
    reviewControls.hidden = true;
    reviewControls.style.display = 'none';
    reviewControls.style.pointerEvents = 'none';
    watermarkPreview.hidden = true;
    normalControls.style.display = 'flex';
    if (!keepPreview) lastPhoto.style.display = 'none';
  }

  reviewControls.querySelector('[data-retake]').addEventListener('click', () => {
    finishReview(false);
    capture.disabled = remaining < 1;
    setStatus(`${remaining} photo${remaining === 1 ? '' : 's'} remaining`);
  });

  captionInput.addEventListener('input', () => {
    captionInput.value = captionInput.value.slice(0, 30);
    watermarkPreviewCaption.textContent = captionInput.value ? `“${captionInput.value}”` : '';
    watermarkPreview.hidden = !captionInput.value;
  });

  reviewControls.querySelector('[data-approve]').addEventListener('click', async () => {
    if (!pendingPhoto) return;
    const approvedPhoto = pendingPhoto;
    const caption = captionInput.value.trim().slice(0, 30);
    const approvedPreviewUrl = pendingPreviewUrl;
    finishReview(true);
    setStatus('Adding watermark…');
    let watermarkedPhoto;
    const approvedOrientation = pendingOrientation;
    try { watermarkedPhoto = await addWatermark(approvedPhoto, caption, approvedOrientation); }
    catch (error) {
      if (approvedPreviewUrl) URL.revokeObjectURL(approvedPreviewUrl);
      review(approvedPhoto, caption, approvedOrientation);
      setStatus(error.message || 'Could not add the watermark. Please try again.', true);
      return;
    }
    setStatus('Uploading approved photo…');
    try {
      await upload(watermarkedPhoto);
      if (approvedPreviewUrl) URL.revokeObjectURL(approvedPreviewUrl);
    } catch (error) {
      if (approvedPreviewUrl) URL.revokeObjectURL(approvedPreviewUrl);
      review(approvedPhoto, caption, approvedOrientation);
      const message = error.message || 'The approved photo could not be uploaded.';
      setStatus(message, true);
      window.POVentsToast?.(message, 'error', 7000);
    }
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
    if (facingMode === 'user') blob = await mirrorPhoto(blob);
    review(blob);
  });

  fileCamera.addEventListener('change', async () => {
    if (fileCamera.files?.[0]) {
      const photo = facingMode === 'user' ? await mirrorPhoto(fileCamera.files[0]) : fileCamera.files[0];
      review(photo);
    }
    fileCamera.value = '';
  });

  switchButton?.addEventListener('click', () => {
    lastPhoto.style.display = 'none';
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    start();
  });
  function applyCaptureOrientation(announce = false) {
    const landscape = captureOrientation === 'landscape';
    camera.style.aspectRatio = landscape ? '4 / 3' : '3 / 4';
    orientationButton.textContent = landscape ? '▯' : '▭';
    orientationButton.setAttribute('aria-label', landscape ? 'Switch to portrait photo' : 'Switch to landscape photo');
    orientationButton.title = landscape ? 'Landscape photo selected' : 'Portrait photo selected';
    if (announce) setStatus(`${landscape ? 'Landscape' : 'Portrait'} photo selected · ${remaining} remaining`);
  }
  orientationButton?.addEventListener('click', () => {
    captureOrientation = captureOrientation === 'portrait' ? 'landscape' : 'portrait';
    applyCaptureOrientation(true);
  });
  applyCaptureOrientation(false);
  window.addEventListener('pagehide', () => {
    cameraRequestId++;
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    video.srcObject = null;
  });
  window.addEventListener('pageshow', event => { if (event.persisted && remaining > 0) startAfterConsent(); });
  function startAfterConsent() {
    const consentKey = `povents-guest-terms-v1-${token}`;
    try { if (sessionStorage.getItem(consentKey) === 'accepted') { start(); return; } } catch (_) {}
    const eventTitle = document.querySelector('.camera-top > span:last-child')?.textContent?.trim() || 'this event';
    const consent = document.createElement('section');
    consent.className = 'guest-consent';
    consent.setAttribute('role', 'dialog');
    consent.setAttribute('aria-modal', 'true');
    consent.setAttribute('aria-labelledby', 'guest-consent-title');
    consent.innerHTML = `<div class="guest-consent__panel">
      <header class="guest-consent__head"><img src="assets/povents-logo.png?v=5" alt="POVents"><h1 id="guest-consent-title">Before you take photos</h1><p>Guest terms and privacy notice for <strong data-event-name></strong></p></header>
      <div class="guest-consent__terms" tabindex="0">
        <h2>End User License Agreement and photo ownership</h2>
        <p>By using this camera and approving an upload, you confirm that you are allowed to take and share the photo and that it does not contain unlawful, abusive, or intentionally harmful content.</p>
        <p><strong>Uploaded photos become the property of the event organizer.</strong> You transfer to the organizer the ownership rights you hold in each approved photo. Where a transfer is not legally permitted, you grant the organizer a worldwide, perpetual, royalty-free license to keep, view, download, reproduce, display, and privately share it for personal and event-related purposes.</p>
        <p>The organizer may use uploaded photos for their own viewing, event memories, private galleries, and personal sharing. <strong>The organizer may not sell the photos, license them for payment, use them in paid advertising, or otherwise commercially resell them.</strong></p>
        <p>You remain responsible for respecting the privacy, dignity, and rights of people shown in your photos. Do not upload a photo if you do not agree to these terms.</p>
        <h2>Privacy Policy</h2>
        <ul>
          <li><strong>Information processed:</strong> approved photos, optional captions, capture time, and limited session information needed to enforce the ${photoLimit}-photo limit and secure uploads.</li>
          <li><strong>Purpose:</strong> to deliver photos to the organizer’s private event gallery, ZIP download, offline album, and any organizer-created shareable album link.</li>
          <li><strong>Who controls the photos:</strong> the event organizer controls their event collection; POVents provides the upload and temporary storage service.</li>
          <li><strong>Storage:</strong> POVents permanently deletes hosted photos seven days after the event. An organizer or recipient may download and retain copies beyond that period, which POVents cannot delete or control.</li>
          <li><strong>Sharing risk:</strong> anyone who receives a shareable album link may download the album until that link expires. The organizer is responsible for sharing it carefully.</li>
          <li><strong>Your choices and rights:</strong> you may leave without uploading. To request access, correction, deletion, object to processing, or withdraw consent for an uploaded photo, contact the event organizer who shared this QR code or the administrator of this POVents site. Some requests may be subject to legal limitations and copies already downloaded by others.</li>
        </ul>
        <p>This notice is intended to explain the collection clearly and does not waive rights provided by applicable privacy law.</p>
      </div>
      <footer class="guest-consent__actions"><label class="guest-consent__check"><input type="checkbox" data-consent-check><span>I have read and accept the End User License Agreement and Privacy Policy, including the transfer of uploaded-photo ownership to the event organizer and the prohibition on selling the photos.</span></label><div class="guest-consent__buttons"><button type="button" class="guest-consent__leave" data-consent-leave>Leave event</button><button type="button" data-consent-accept disabled>Accept and open camera</button></div></footer>
    </div>`;
    consent.querySelector('[data-event-name]').textContent = eventTitle;
    const check = consent.querySelector('[data-consent-check]');
    const accept = consent.querySelector('[data-consent-accept]');
    check.addEventListener('change', () => { accept.disabled = !check.checked; });
    accept.addEventListener('click', () => {
      if (!check.checked) return;
      try { sessionStorage.setItem(consentKey, 'accepted'); } catch (_) {}
      consent.remove(); document.body.style.overflow = ''; start();
    });
    consent.querySelector('[data-consent-leave]').addEventListener('click', () => {
      cameraRequestId++;
      if (stream) stream.getTracks().forEach(track => track.stop());
      stream = null; video.srcObject = null;
      try { sessionStorage.removeItem(consentKey); } catch (_) {}
      location.replace(location.pathname);
    });
    document.body.style.overflow = 'hidden';
    document.body.appendChild(consent);
    consent.querySelector('.guest-consent__terms').focus();
  }
  startAfterConsent();
})();
