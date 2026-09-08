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
  const eventFinished=metadataSource?.dataset.eventFinished==='1';
  const reelsAllowed=Number(metadataSource?.dataset.reelsAllowed||3),reelDuration=Number(metadataSource?.dataset.reelDuration||30),reelImages=Number(metadataSource?.dataset.reelImages||20);
  const unlimitedReels=metadataSource?.dataset.reelsUnlimited==='1';
  toolbar.innerHTML = `<input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="event_id" value="${eventId || ''}"><input type="hidden" name="all_photos" value="1" data-all-photos disabled><label><input type="checkbox" data-select-all> Select all photos</label><span data-selected>0 selected</span><button type="submit" disabled>Download ZIP</button><button class="button light reel-create" type="button" data-reel-create disabled>Create ${reelDuration}s Reel</button><button class="button light album-create" type="button" ${eventFinished?'':'disabled'} title="${eventFinished?'Create the offline photo album set':'Photo album creation unlocks after the event ends.'}">Create Photo Album</button><button class="button light slideshow-create" type="button">Play Slideshow</button>`;
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
  const slideshowButton = toolbar.querySelector('.slideshow-create');
  const reelButton = toolbar.querySelector('[data-reel-create]');
  let reelsCreated = Number(document.querySelector('.presentation-qr-create')?.dataset.reelsCreated || 0);
  const albumCreate = toolbar.querySelector('.album-create');

  const albumModal = document.createElement('div');
  albumModal.className = 'album-modal';
  albumModal.hidden = true;
  albumModal.setAttribute('role','dialog');
  albumModal.setAttribute('aria-modal','true');
  albumModal.setAttribute('aria-labelledby','album-create-title');
  albumModal.innerHTML = `<form class="album-modal__panel" enctype="multipart/form-data"><div class="album-modal__cover"><img data-album-preview alt="Selected album cover preview" hidden><div data-album-placeholder><img src="assets/povents-logo.png?v=5" alt="POVents"><span>Optional cover background</span></div></div><div class="album-modal__content"><div class="eyebrow">Offline photo album</div><h2 id="album-create-title">Create Photo Album</h2><p>Optionally choose a background image for the album cover. POVents will create saved offline albums in groups of up to 30 photos and replace the previous album set.</p><label class="album-modal__picker"><span>Choose cover image</span><input type="file" name="album_cover" accept="image/jpeg,image/png,image/webp"></label><small>JPG, PNG, or WebP · maximum 5 MB · cropped to landscape</small><p class="album-modal__error" data-album-error hidden></p><div class="album-modal__actions"><button class="button light" type="button" data-album-cancel>Cancel</button><button class="button" type="submit" data-album-submit>Create album set</button></div></div></form>`;
  document.body.appendChild(albumModal);
  const albumForm=albumModal.querySelector('form'),albumInput=albumModal.querySelector('input[type="file"]'),albumPreview=albumModal.querySelector('[data-album-preview]'),albumPlaceholder=albumModal.querySelector('[data-album-placeholder]'),albumCancel=albumModal.querySelector('[data-album-cancel]'),albumSubmit=albumModal.querySelector('[data-album-submit]'),albumError=albumModal.querySelector('[data-album-error]');
  const albumProgress=document.createElement('div');
  albumProgress.className='album-progress';
  albumProgress.hidden=true;
  albumProgress.setAttribute('role','status');
  albumProgress.setAttribute('aria-live','polite');
  albumProgress.innerHTML='<div class="album-progress__panel"><img src="assets/povents-logo.png?v=5" alt=""><strong>Creating your photo album</strong><p>Please keep this page open while POVents prepares and saves your album.</p><div class="album-progress__track"><span data-album-progress-bar></span></div><span class="album-progress__value" data-album-progress-value>0%</span></div>';
  document.body.appendChild(albumProgress);
  const albumProgressBar=albumProgress.querySelector('[data-album-progress-bar]'),albumProgressValue=albumProgress.querySelector('[data-album-progress-value]');
  let albumProgressTimer=0,albumProgressPercent=0;
  function renderAlbumProgress(value){albumProgressPercent=Math.max(0,Math.min(100,Math.round(value)));albumProgressBar.style.width=`${albumProgressPercent}%`;albumProgressValue.textContent=`${albumProgressPercent}%`;albumProgress.setAttribute('aria-label',`Creating photo album: ${albumProgressPercent}%`);}
  function startAlbumProgress(){clearInterval(albumProgressTimer);renderAlbumProgress(0);albumProgress.hidden=false;}
  function hideAlbumProgress(){clearInterval(albumProgressTimer);albumProgressTimer=0;albumProgress.hidden=true;}
  let albumPreviewUrl='';
  function closeAlbumModal(){albumModal.hidden=true;document.body.style.overflow='';if(albumPreviewUrl)URL.revokeObjectURL(albumPreviewUrl);albumPreviewUrl='';albumForm.reset();albumPreview.hidden=true;albumPreview.removeAttribute('src');albumPlaceholder.hidden=false;albumCreate.focus();}
  albumCreate.addEventListener('click',()=>{albumError.hidden=true;albumModal.hidden=false;document.body.style.overflow='hidden';albumInput.focus();});
  document.querySelector('.album-notice-create')?.addEventListener('click',event=>{event.preventDefault();albumCreate.click();});
  albumCancel.addEventListener('click',closeAlbumModal);
  albumModal.addEventListener('click',event=>{if(event.target===albumModal)closeAlbumModal();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!albumModal.hidden)closeAlbumModal();});
  albumInput.addEventListener('change',()=>{if(albumPreviewUrl)URL.revokeObjectURL(albumPreviewUrl);const file=albumInput.files[0];if(!file){albumPreview.hidden=true;albumPlaceholder.hidden=false;return;}albumPreviewUrl=URL.createObjectURL(file);albumPreview.src=albumPreviewUrl;albumPreview.hidden=false;albumPlaceholder.hidden=true;});
  albumForm.addEventListener('submit',async event=>{event.preventDefault();albumSubmit.disabled=true;albumCancel.disabled=true;albumSubmit.textContent='Creating…';albumError.hidden=true;startAlbumProgress();const formData=new FormData(albumForm);formData.append('csrf',csrf);formData.append('event_id',eventId||'');try{let response=await fetch('?action=create_album_job',{method:'POST',body:formData,headers:{Accept:'application/json'}});let result=await response.json();if(!response.ok)throw new Error(result.error||'The album job could not be started.');let job=result.job;while(job&&['queued','processing'].includes(job.status)){renderAlbumProgress(job.total_photos?job.processed_photos/job.total_photos*100:0);const body=new URLSearchParams({csrf,event_id:eventId||''});response=await fetch('?action=process_album_job',{method:'POST',body,headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'}});result=await response.json();if(!response.ok)throw new Error(result.error||'An album volume could not be created.');job=result.job;if(job?.status==='failed')throw new Error(job.error_message||'An album volume could not be created.');}if(!job||job.status!=='completed')throw new Error('Album creation stopped before completion.');renderAlbumProgress(100);await new Promise(resolve=>setTimeout(resolve,450));hideAlbumProgress();closeAlbumModal();window.POVentsToast?.(`${job.total_volumes} album${Number(job.total_volumes)===1?'':'s'} created.`, 'success');location.reload();}catch(error){hideAlbumProgress();albumError.textContent=error.message||'The photo albums could not be created.';albumError.hidden=false;window.POVentsToast?.(error.message||'The photo albums could not be created.','error');}finally{albumSubmit.disabled=false;albumCancel.disabled=false;albumSubmit.textContent='Create album set';}});

  const slideshowSetup=document.createElement('div');
  slideshowSetup.className='slideshow-setup';
  slideshowSetup.hidden=true;
  slideshowSetup.setAttribute('role','dialog');
  slideshowSetup.setAttribute('aria-modal','true');
  slideshowSetup.setAttribute('aria-labelledby','slideshow-setup-title');
  slideshowSetup.innerHTML=`<form class="slideshow-setup__panel"><div class="eyebrow">LED wall presentation</div><h2 id="slideshow-setup-title">Play Slideshow</h2><p>Every slide displays three photos upright. Optionally choose a background image for the full-screen presentation.</p><label class="album-modal__picker"><span>Choose background image</span><input type="file" accept="image/jpeg,image/png,image/webp"></label><small>JPG, PNG, or WebP · used only on this device</small><div class="album-modal__actions"><button class="button light" type="button" data-slideshow-cancel>Cancel</button><button class="button" type="submit">Start slideshow</button></div></form>`;
  document.body.appendChild(slideshowSetup);
  const slideshow=document.createElement('div');
  slideshow.className='event-slideshow';
  slideshow.hidden=true;
  slideshow.setAttribute('role','dialog');
  slideshow.setAttribute('aria-modal','true');
  slideshow.setAttribute('aria-label','Event photo slideshow');
  slideshow.innerHTML=`<div class="event-slideshow__backdrop"></div><header><img src="assets/povents-logo-dark.png?v=5" alt="POVents"><h2></h2><button type="button" data-slideshow-close aria-label="Close slideshow">×</button></header><main><div class="event-slideshow__photos"></div></main><footer><button type="button" data-slideshow-prev aria-label="Previous slide">‹</button><button type="button" data-slideshow-toggle>Pause</button><span data-slideshow-position></span><button type="button" data-slideshow-next aria-label="Next slide">›</button></footer>`;
  document.body.appendChild(slideshow);
  const slideshowForm=slideshowSetup.querySelector('form'),slideshowInput=slideshowSetup.querySelector('input[type="file"]'),slideshowPhotos=slideshow.querySelector('.event-slideshow__photos'),slideshowPosition=slideshow.querySelector('[data-slideshow-position]'),slideshowToggle=slideshow.querySelector('[data-slideshow-toggle]');
  let slideshowIndex=0,slideshowTimer=0,slideshowPollTimer=0,slideshowBackgroundUrl='',slideshowPhotoUrls=[];
  const slideshowPreloaded=new Set();
  const slideshowSlides=()=>{const slides=[];for(let index=0;index<slideshowPhotoUrls.length;index+=3)slides.push(slideshowPhotoUrls.slice(index,index+3));return slides;};
  function preloadSlideshowBatch(start,count=6){const urls=slideshowPhotoUrls;for(let offset=0;offset<Math.min(count,urls.length);offset++){const index=(start+offset)%urls.length,url=urls[index];if(slideshowPreloaded.has(url))continue;const preload=new Image();preload.decoding='async';preload.src=url;slideshowPreloaded.add(url);}}
  function renderSlideshow(){const slides=slideshowSlides();if(!slides.length)return;slideshowIndex=(slideshowIndex+slides.length)%slides.length;slideshowPhotos.querySelectorAll('.event-slideshow__photo').forEach(card=>card.classList.add('is-under'));slides[slideshowIndex].forEach((url,index)=>{const frame=document.createElement('figure'),photo=document.createElement('img');frame.className=`event-slideshow__photo toss-${index+1}`;frame.style.setProperty('--toss-order',String(index));photo.src=url;photo.alt=`Event photo ${slideshowIndex*3+index+1}`;photo.draggable=false;photo.decoding='async';frame.appendChild(photo);slideshowPhotos.appendChild(frame);requestAnimationFrame(()=>frame.classList.add('is-landed'));});const cards=[...slideshowPhotos.querySelectorAll('.event-slideshow__photo')];cards.slice(0,-9).forEach(card=>card.remove());slideshowPosition.textContent=`${slideshowIndex+1} / ${slides.length}`;if(slideshowIndex>0)preloadSlideshowBatch((slideshowIndex+1)*3,6);}
  function stopSlideshowTimer(){clearInterval(slideshowTimer);slideshowTimer=0;slideshowToggle.textContent='Play';}
  function startSlideshowTimer(){clearInterval(slideshowTimer);slideshowTimer=setInterval(()=>{slideshowIndex++;renderSlideshow();},5000);slideshowToggle.textContent='Pause';}
  async function refreshSlideshowPhotos(){try{const response=await fetch(`?action=slideshow_photos&event_id=${encodeURIComponent(eventId)}`,{headers:{Accept:'application/json'},cache:'no-store'}),data=await response.json();if(!response.ok||!Array.isArray(data.photos))throw new Error(data.error||'Could not refresh slideshow photos.');const known=new Set(slideshowPhotoUrls.map(url=>new URL(url,location.href).href)),added=[];data.photos.forEach(url=>{const absolute=new URL(url,location.href).href;if(!known.has(absolute)){known.add(absolute);added.push(absolute);}});if(added.length){slideshowPhotoUrls.push(...added);window.POVentsToast?.(`${added.length} new photo${added.length===1?'':'s'} added to the slideshow.`,'success');}}catch(error){console.warn('Slideshow photo refresh failed:',error);}}
  function startSlideshowPolling(){clearInterval(slideshowPollTimer);slideshowPollTimer=setInterval(refreshSlideshowPhotos,15000);}
  function closeSlideshow(){stopSlideshowTimer();clearInterval(slideshowPollTimer);slideshowPollTimer=0;slideshow.hidden=true;slideshowSetup.hidden=true;document.body.style.overflow='';if(document.fullscreenElement===slideshow)document.exitFullscreen().catch(()=>{});if(slideshowBackgroundUrl)URL.revokeObjectURL(slideshowBackgroundUrl);slideshowBackgroundUrl='';slideshow.style.removeProperty('--slideshow-background');slideshowForm.reset();slideshowButton.focus();}
  slideshowButton.addEventListener('click',()=>{slideshowSetup.hidden=false;document.body.style.overflow='hidden';slideshowInput.focus();});
  slideshowSetup.querySelector('[data-slideshow-cancel]').addEventListener('click',closeSlideshow);
  slideshowSetup.addEventListener('click',event=>{if(event.target===slideshowSetup)closeSlideshow();});
  slideshowForm.addEventListener('submit',event=>{event.preventDefault();const file=slideshowInput.files[0];if(file){slideshowBackgroundUrl=URL.createObjectURL(file);slideshow.style.setProperty('--slideshow-background',`url("${slideshowBackgroundUrl}")`);}slideshow.querySelector('h2').textContent=metadataSource?.dataset.eventTitle||document.querySelector('.dash-head h1')?.textContent||'POVents Event';slideshowSetup.hidden=true;slideshow.hidden=false;slideshowIndex=0;slideshowPhotoUrls=links.map(link=>link.href);slideshowPreloaded.clear();slideshowPhotos.replaceChildren();preloadSlideshowBatch(0,6);renderSlideshow();startSlideshowTimer();startSlideshowPolling();slideshow.requestFullscreen?.().catch(()=>{});});
  slideshow.querySelector('[data-slideshow-close]').addEventListener('click',closeSlideshow);
  slideshow.querySelector('[data-slideshow-prev]').addEventListener('click',()=>{slideshowIndex--;renderSlideshow();startSlideshowTimer();});
  slideshow.querySelector('[data-slideshow-next]').addEventListener('click',()=>{slideshowIndex++;renderSlideshow();startSlideshowTimer();});
  slideshowToggle.addEventListener('click',()=>{if(slideshowTimer)stopSlideshowTimer();else startSlideshowTimer();});
  document.addEventListener('keydown',event=>{if(slideshow.hidden)return;if(event.key==='Escape')closeSlideshow();if(event.key==='ArrowLeft'){slideshowIndex--;renderSlideshow();startSlideshowTimer();}if(event.key==='ArrowRight'){slideshowIndex++;renderSlideshow();startSlideshowTimer();}if(event.key===' '){event.preventDefault();slideshowToggle.click();}});

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
