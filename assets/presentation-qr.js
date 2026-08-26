(() => {
  const trigger = document.querySelector('.presentation-qr-create');
  if (!trigger) return;
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const eventId = trigger.dataset.eventId || '';
  const modal = document.createElement('div');
  modal.className = 'album-modal presentation-qr-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-labelledby', 'presentation-qr-title');
  modal.innerHTML = `<form class="album-modal__panel" enctype="multipart/form-data"><div class="album-modal__cover presentation-qr-preview"><img data-qr-preview alt="Selected presentation background" hidden><div data-qr-placeholder><img src="assets/povents-logo-dark.png?v=5" alt="POVents"><span>16:9 presentation background</span></div></div><div class="album-modal__content"><div class="eyebrow">TV · PowerPoint · LED wall</div><h2 id="presentation-qr-title">Create Presentation QR</h2><p>Choose an optional background image. It will be center-cropped to 16:9 and darkened slightly so the event details and QR code remain easy to see.</p><label class="album-modal__picker"><span>Choose background</span><input type="file" name="qr_background" accept="image/jpeg,image/png,image/webp"></label><small>JPG, PNG, or WebP · maximum 8 MB · output is Full HD 1920 × 1080</small><p class="album-modal__error" data-qr-error hidden></p><div class="album-modal__actions"><button class="button light" type="button" data-qr-cancel>Cancel</button><button class="button" type="submit" data-qr-submit>Create and download</button></div></div></form>`;
  document.body.appendChild(modal);
  const form = modal.querySelector('form');
  const input = modal.querySelector('input[type="file"]');
  const preview = modal.querySelector('[data-qr-preview]');
  const placeholder = modal.querySelector('[data-qr-placeholder]');
  const cancel = modal.querySelector('[data-qr-cancel]');
  const submit = modal.querySelector('[data-qr-submit]');
  const errorBox = modal.querySelector('[data-qr-error]');
  let previewUrl = '';
  function close() { modal.hidden = true; document.body.style.overflow = ''; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ''; form.reset(); preview.hidden = true; preview.removeAttribute('src'); placeholder.hidden = false; trigger.focus(); }
  trigger.addEventListener('click', () => { errorBox.hidden = true; modal.hidden = false; document.body.style.overflow = 'hidden'; input.focus(); });
  cancel.addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !modal.hidden) close(); });
  input.addEventListener('change', () => { if (previewUrl) URL.revokeObjectURL(previewUrl); const file = input.files[0]; if (!file) { preview.hidden = true; placeholder.hidden = false; return; } previewUrl = URL.createObjectURL(file); preview.src = previewUrl; preview.hidden = false; placeholder.hidden = true; });
  form.addEventListener('submit', async event => {
    event.preventDefault(); submit.disabled = true; cancel.disabled = true; submit.textContent = 'Creating…'; errorBox.hidden = true;
    const data = new FormData(form); data.append('csrf', csrf);
    try {
      const response = await fetch(`?action=download_event_qr&event_id=${encodeURIComponent(eventId)}`, {method: 'POST', body: data});
      if (!response.ok) throw new Error(await response.text() || 'The presentation QR could not be created.');
      const blob = await response.blob(); const disposition = response.headers.get('Content-Disposition') || ''; const match = disposition.match(/filename="?([^";]+)"?/i);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = match?.[1] || 'POVents-presentation-QR.svg'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000); close();
      trigger.textContent = 'Presentation QR Created'; setTimeout(() => trigger.textContent = 'Create Presentation QR', 2500);
    } catch (error) { errorBox.textContent = error.message || 'The presentation QR could not be created.'; errorBox.hidden = false; }
    finally { submit.disabled = false; cancel.disabled = false; submit.textContent = 'Create and download'; }
  });
})();
