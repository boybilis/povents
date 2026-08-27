(() => {
  function bindAlbumShare(button, eventId) {
    if (!button || button.dataset.shareReady) return;
    button.dataset.shareReady = '1';
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const response = await fetch(`?action=shared_album_link&event_id=${encodeURIComponent(eventId || '')}`, {headers: {'Accept': 'application/json'}});
        const data = await response.json();
        if (!response.ok || !data.url) throw new Error(data.error || 'Could not create the share link.');
        await navigator.clipboard.writeText(data.url);
        window.POVentsToast?.('Shareable album link copied.', 'success');
      } catch (error) {
        window.POVentsToast?.(error.message || 'The album link could not be copied.', 'error');
      } finally { button.disabled = false; }
    });
  }

  document.querySelectorAll('.album-share[data-event-id]').forEach(button => bindAlbumShare(button, button.dataset.eventId));
  let links = [...document.querySelectorAll('.gallery .shot a')];
  if (!links.length) return;

  const eventId = document.querySelector('.presentation-qr-create')?.dataset.eventId || '';
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const toolbar = document.createElement('form');
  toolbar.className = 'gallery-toolbar';
  toolbar.id = 'gallery-download';
  toolbar.method = 'post';
  toolbar.action = '?action=download_zip';
  const metadataSource=document.querySelector('.presentation-qr-create');
  const reelsAllowed=Number(metadataSource?.dataset.reelsAllowed||3),reelDuration=Number(metadataSource?.dataset.reelDuration||30),reelImages=Number(metadataSource?.dataset.reelImages||20);
  const unlimitedReels=metadataSource?.dataset.reelsUnlimited==='1';
  toolbar.innerHTML = `<input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="event_id" value="${eventId || ''}"><input type="hidden" name="all_photos" value="1" data-all-photos disabled><label><input type="checkbox" data-select-all> Select all photos</label><span data-selected>0 selected</span><button type="submit" disabled>Download ZIP</button><button class="button light reel-create" type="button" data-reel-create disabled>Create ${reelDuration}s Reel</button><button class="button light album-create" type="button">Create Photo Album</button><button class="button light album-share" type="button">Copy shareable album link</button>`;
  document.querySelector('.gallery').before(toolbar);
  const selectedLabel = toolbar.querySelector('[data-selected]');
  const downloadButton = toolbar.querySelector('button');
  const selectAll = toolbar.querySelector('[data-select-all]');
  const allPhotos = toolbar.querySelector('[data-all-photos]');
  const gallery = document.querySelector('.gallery');
  let shots = links.map(link => link.closest('.shot'));
  const photosPerPage = 30;
  let totalPages = Math.ceil(links.length / photosPerPage);
  let currentPage = 0;
  links.forEach(link => { const image = link.querySelector('img'); if (image) { image.loading = 'lazy'; image.decoding = 'async'; } });
  const pagination = document.createElement('nav');
  pagination.className = 'gallery-pagination';
  pagination.setAttribute('aria-label', 'Gallery pages');
  pagination.innerHTML = '<button type="button" data-page-prev>← Previous</button><span data-page-status></span><button type="button" data-page-next>Next →</button>';
  gallery.after(pagination);
  pagination.hidden = totalPages <= 1;
  const pagePrevious = pagination.querySelector('[data-page-prev]');
  const pageNext = pagination.querySelector('[data-page-next]');
  const pageStatus = pagination.querySelector('[data-page-status]');
  const shareButton = toolbar.querySelector('.album-share');
  const reelButton = toolbar.querySelector('[data-reel-create]');
  let reelsCreated = Number(document.querySelector('.presentation-qr-create')?.dataset.reelsCreated || 0);
  bindAlbumShare(shareButton, eventId);
  const albumCreate = toolbar.querySelector('.album-create');

  const albumModal = document.createElement('div');
  albumModal.className = 'album-modal';
  albumModal.hidden = true;
  albumModal.setAttribute('role','dialog');
  albumModal.setAttribute('aria-modal','true');
  albumModal.setAttribute('aria-labelledby','album-create-title');
  albumModal.innerHTML = `<form class="album-modal__panel" enctype="multipart/form-data"><div class="album-modal__cover"><img data-album-preview alt="Selected album cover preview" hidden><div data-album-placeholder><img src="assets/povents-logo.png?v=5" alt="POVents"><span>Optional cover background</span></div></div><div class="album-modal__content"><div class="eyebrow">Offline photo album</div><h2 id="album-create-title">Create Photo Album</h2><p>Optionally choose a background image for the album cover. POVents will save and overwrite the event’s previous album copy.</p><label class="album-modal__picker"><span>Choose cover image</span><input type="file" name="album_cover" accept="image/jpeg,image/png,image/webp"></label><small>JPG, PNG, or WebP · maximum 5 MB · cropped to landscape</small><p class="album-modal__error" data-album-error hidden></p><div class="album-modal__actions"><button class="button light" type="button" data-album-cancel>Cancel</button><button class="button" type="submit" data-album-submit>Create and download</button></div></div></form>`;
  document.body.appendChild(albumModal);
  const albumForm=albumModal.querySelector('form'),albumInput=albumModal.querySelector('input[type="file"]'),albumPreview=albumModal.querySelector('[data-album-preview]'),albumPlaceholder=albumModal.querySelector('[data-album-placeholder]'),albumCancel=albumModal.querySelector('[data-album-cancel]'),albumSubmit=albumModal.querySelector('[data-album-submit]'),albumError=albumModal.querySelector('[data-album-error]');
  let albumPreviewUrl='';
  function closeAlbumModal(){albumModal.hidden=true;document.body.style.overflow='';if(albumPreviewUrl)URL.revokeObjectURL(albumPreviewUrl);albumPreviewUrl='';albumForm.reset();albumPreview.hidden=true;albumPreview.removeAttribute('src');albumPlaceholder.hidden=false;albumCreate.focus();}
  albumCreate.addEventListener('click',()=>{albumError.hidden=true;albumModal.hidden=false;document.body.style.overflow='hidden';albumInput.focus();});
  document.querySelector('.album-notice-create')?.addEventListener('click',event=>{event.preventDefault();albumCreate.click();});
  albumCancel.addEventListener('click',closeAlbumModal);
  albumModal.addEventListener('click',event=>{if(event.target===albumModal)closeAlbumModal();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!albumModal.hidden)closeAlbumModal();});
  albumInput.addEventListener('change',()=>{if(albumPreviewUrl)URL.revokeObjectURL(albumPreviewUrl);const file=albumInput.files[0];if(!file){albumPreview.hidden=true;albumPlaceholder.hidden=false;return;}albumPreviewUrl=URL.createObjectURL(file);albumPreview.src=albumPreviewUrl;albumPreview.hidden=false;albumPlaceholder.hidden=true;});
  albumForm.addEventListener('submit',async event=>{event.preventDefault();albumSubmit.disabled=true;albumCancel.disabled=true;albumSubmit.textContent='Creating…';albumError.hidden=true;const formData=new FormData(albumForm);formData.append('csrf',csrf);try{const response=await fetch(`?action=download_photo_album&event_id=${encodeURIComponent(eventId||'')}`,{method:'POST',body:formData});if(!response.ok)throw new Error(await response.text()||'The photo album could not be created.');const blob=await response.blob();const disposition=response.headers.get('Content-Disposition')||'';const match=disposition.match(/filename="?([^";]+)"?/i);const downloadUrl=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=downloadUrl;anchor.download=match?.[1]||'POVents-photo-album.html';document.body.appendChild(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(downloadUrl),1000);closeAlbumModal();window.POVentsToast?.('Photo album created and downloaded.', 'success');}catch(error){albumError.textContent=error.message||'The photo album could not be created.';albumError.hidden=false;window.POVentsToast?.(error.message||'The photo album could not be created.','error');}finally{albumSubmit.disabled=false;albumCancel.disabled=false;albumSubmit.textContent='Create and download';}});

  const deleteModal = document.createElement('div');
  deleteModal.className = 'delete-modal';
  deleteModal.hidden = true;
  deleteModal.setAttribute('role', 'dialog');
  deleteModal.setAttribute('aria-modal', 'true');
  deleteModal.setAttribute('aria-labelledby', 'delete-photo-title');
  deleteModal.innerHTML = `<div class="delete-modal__panel"><img class="delete-modal__preview" alt="Photo selected for deletion"><div class="delete-modal__content"><div class="eyebrow">Permanent deletion</div><h2 id="delete-photo-title">Delete this photo?</h2><p>This image will be erased from the server and removed from the event gallery. This action cannot be undone.</p><p class="delete-modal__error" data-delete-error hidden></p><div class="delete-modal__actions"><button class="button light" type="button" data-delete-cancel>Cancel</button><button class="button delete-modal__confirm" type="button" data-delete-confirm>Delete permanently</button></div></div></div>`;
  document.body.appendChild(deleteModal);
  const deletePreview = deleteModal.querySelector('.delete-modal__preview');
  const deleteCancel = deleteModal.querySelector('[data-delete-cancel]');
  const deleteConfirm = deleteModal.querySelector('[data-delete-confirm]');
  const deleteError = deleteModal.querySelector('[data-delete-error]');
  let pendingDeleteForm = null;
  let pendingDeleteLink = null;
  let deleteTrigger = null;
  function closeDeleteModal() {
    deleteModal.hidden = true;
    deletePreview.removeAttribute('src');
    document.body.style.overflow = '';
    deleteTrigger?.focus();
    pendingDeleteForm = null;
    pendingDeleteLink = null;
  }
  deleteCancel.addEventListener('click', closeDeleteModal);
  deleteConfirm.addEventListener('click', async () => {
    if (!pendingDeleteForm) return;
    deleteConfirm.disabled = true;
    deleteConfirm.textContent = 'Deleting…';
    deleteCancel.disabled = true;
    deleteError.hidden = true;
    try {
      const response = await fetch(pendingDeleteForm.action, {
        method: 'POST',
        body: new FormData(pendingDeleteForm),
        headers: {'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest'}
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'The photo could not be deleted.');
      const index = links.indexOf(pendingDeleteLink);
      if (index >= 0) {
        selectionOrder = selectionOrder.filter(url => url !== pendingDeleteLink.href);
        shots[index].remove();
        links.splice(index, 1);
        shots.splice(index, 1);
        checks.splice(index, 1);
      }
      document.querySelector('.dash-head > strong')?.replaceChildren(document.createTextNode(`${data.remaining_count} photos`));
      window.POVentsToast?.('Photo permanently deleted.', 'success');
      closeDeleteModal();
      if (!links.length) {
        toolbar.remove();
        pagination.remove();
        const empty = document.createElement('div');
        empty.className = 'empty';
        empty.textContent = 'No photos yet. Share the QR code and watch this gallery come alive.';
        gallery.replaceWith(empty);
        return;
      }
      totalPages = Math.ceil(links.length / photosPerPage);
      currentPage = Math.min(currentPage, totalPages - 1);
      pagination.hidden = totalPages <= 1;
      renderPage(currentPage);
    } catch (error) {
      deleteError.textContent = error.message || 'The photo could not be deleted.';
      deleteError.hidden = false;
      deleteConfirm.disabled = false;
      deleteConfirm.textContent = 'Try again';
      deleteCancel.disabled = false;
      window.POVentsToast?.(error.message || 'The photo could not be deleted.', 'error');
    }
  });
  deleteModal.addEventListener('click', event => { if (event.target === deleteModal) closeDeleteModal(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !deleteModal.hidden) closeDeleteModal(); });

  let selectionOrder = [];
  let checks = links.map(link => {
    const fileName = decodeURIComponent(new URL(link.href).pathname.split('/').pop());
    const label = document.createElement('label');
    label.className = 'photo-select';
    label.innerHTML = `<input type="checkbox" name="files[]" value="${fileName}"><span aria-hidden="true">✓</span>`;
    link.closest('.shot').appendChild(label);
    const deleteForm = document.createElement('form');
    deleteForm.className = 'photo-delete';
    deleteForm.method = 'post';
    deleteForm.action = '?action=delete_photo';
    deleteForm.innerHTML = `<input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="event_id" value="${eventId || ''}"><input type="hidden" name="file_name" value="${fileName}"><button type="submit" aria-label="Permanently delete this photo" title="Delete photo">×</button>`;
    deleteForm.addEventListener('submit', event => {
      event.preventDefault();
      pendingDeleteForm = deleteForm;
      pendingDeleteLink = link;
      deleteTrigger = deleteForm.querySelector('button');
      deletePreview.src = link.href;
      deleteConfirm.disabled = false;
      deleteConfirm.textContent = 'Delete permanently';
      deleteCancel.disabled = false;
      deleteError.hidden = true;
      deleteModal.hidden = false;
      document.body.style.overflow = 'hidden';
      deleteCancel.focus();
    });
    link.closest('.shot').appendChild(deleteForm);
    const check = label.querySelector('input');
    check.setAttribute('form',toolbar.id);
    return check;
  });

  function renderPage(page) {
    currentPage = Math.max(0, Math.min(totalPages - 1, page));
    shots.forEach((shot, index) => { shot.hidden = Math.floor(index / photosPerPage) !== currentPage; });
    pageStatus.textContent = `Page ${currentPage + 1} of ${totalPages}`;
    pagePrevious.disabled = currentPage === 0;
    pageNext.disabled = currentPage === totalPages - 1;
    updateSelection();
    if (page > 0) gallery.scrollIntoView({behavior: 'smooth', block: 'start'});
  }

  function updateSelection() {
    const count = checks.filter(check => check.checked).length;
    selectedLabel.textContent = `${count} selected`;
    downloadButton.disabled = count === 0;
    const reelsRemaining = unlimitedReels ? -1 : Math.max(0, reelsAllowed - reelsCreated);
    reelButton.disabled = (!unlimitedReels && reelsRemaining === 0) || count !== reelImages;
    reelButton.textContent = reelsAllowed===0&&!unlimitedReels?'Reels not included':(!unlimitedReels&&reelsRemaining===0?`All ${reelsAllowed} reels created`:`Create ${reelDuration}s Reel${unlimitedReels?' · Unlimited':` · ${reelsRemaining} left`}`);
    reelButton.title = reelsAllowed===0&&!unlimitedReels?'Video reels are not included with this event plan':(!unlimitedReels&&reelsRemaining===0?'All reels included with this event plan have been used':(count < reelImages ? `Select ${reelImages-count} more photo${reelImages-count===1?'':'s'}` : (count > reelImages ? `Unselect ${count-reelImages} photo${count-reelImages===1?'':'s'}` : `Create a ${reelDuration}-second reel using these ${reelImages} photos`)));
    selectAll.checked = checks.length > 0 && count === checks.length;
    selectAll.indeterminate = count > 0 && count < checks.length;
    allPhotos.disabled = !selectAll.checked;
    checks.forEach(check => {
      if (selectAll.checked) check.removeAttribute('name');
      else check.name = 'files[]';
    });
    links.forEach((link,index) => link.closest('.shot').classList.toggle('is-selected',checks[index].checked));
  }
  checks.forEach((check,index) => check.addEventListener('change',()=>{const url=links[index].href;if(check.checked&&!selectionOrder.includes(url))selectionOrder.push(url);if(!check.checked)selectionOrder=selectionOrder.filter(item=>item!==url);updateSelection();}));
  selectAll.addEventListener('change',() => { checks.forEach(check => { check.checked = selectAll.checked; }); selectionOrder=selectAll.checked?links.map(link=>link.href):[]; updateSelection(); });
  reelButton.addEventListener('click',()=>{if(!unlimitedReels&&reelsCreated>=reelsAllowed)return;const selected=selectionOrder.filter(url=>links.some((link,index)=>link.href===url&&checks[index]?.checked));window.POVentsReel?.open({images:selected,title:metadataSource?.dataset.eventTitle||document.querySelector('.dash-head h1')?.textContent||'POVents Event',date:metadataSource?.dataset.eventDate||'',time:metadataSource?.dataset.eventTime||'',eventId,csrf,duration:reelDuration,imageCount:reelImages});});
  document.addEventListener('povents:reel-created',event=>{if(!unlimitedReels)reelsCreated=reelsAllowed-Number(event.detail?.remaining??Math.max(0,reelsAllowed-reelsCreated-1));updateSelection();});
  pagePrevious.addEventListener('click', () => renderPage(currentPage - 1));
  pageNext.addEventListener('click', () => renderPage(currentPage + 1));
  renderPage(0);

  const modal = document.createElement('div');
  modal.className = 'photo-modal';
  modal.hidden = true;
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', 'Photo viewer');
  modal.innerHTML = `
    <button class="photo-modal__close" aria-label="Close photo viewer">×</button>
    <button class="photo-modal__nav" data-previous aria-label="Previous photo">‹</button>
    <div class="photo-modal__stage">
      <img class="photo-modal__image" alt="Event photo">
      <div class="photo-modal__meta"><span data-position></span><a class="photo-modal__download" download>Download original</a></div>
    </div>
    <button class="photo-modal__nav" data-next aria-label="Next photo">›</button>`;
  document.body.appendChild(modal);

  const image = modal.querySelector('.photo-modal__image');
  const position = modal.querySelector('[data-position]');
  const download = modal.querySelector('.photo-modal__download');
  let current = 0;
  let touchStart = 0;

  function show(index) {
    current = (index + links.length) % links.length;
    const imagePage = Math.floor(current / photosPerPage);
    if (imagePage !== currentPage) renderPage(imagePage);
    const href = links[current].href;
    image.src = href;
    download.href = href;
    position.textContent = `${current + 1} of ${links.length}`;
  }

  function open(index) {
    show(index);
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    modal.querySelector('.photo-modal__close').focus();
  }

  function close() {
    modal.hidden = true;
    image.removeAttribute('src');
    document.body.style.overflow = '';
    links[current].focus();
  }

  links.forEach((link, index) => link.addEventListener('click', event => {
    event.preventDefault();
    open(index);
  }));
  modal.querySelector('[data-previous]').addEventListener('click', () => show(current - 1));
  modal.querySelector('[data-next]').addEventListener('click', () => show(current + 1));
  modal.querySelector('.photo-modal__close').addEventListener('click', close);
  modal.addEventListener('click', event => { if (event.target === modal) close(); });
  modal.addEventListener('touchstart', event => { touchStart = event.changedTouches[0].clientX; }, {passive: true});
  modal.addEventListener('touchend', event => {
    const distance = event.changedTouches[0].clientX - touchStart;
    if (Math.abs(distance) > 45) show(current + (distance < 0 ? 1 : -1));
  }, {passive: true});
  document.addEventListener('keydown', event => {
    if (modal.hidden) return;
    if (event.key === 'Escape') close();
    if (event.key === 'ArrowLeft') show(current - 1);
    if (event.key === 'ArrowRight') show(current + 1);
  });
})();
