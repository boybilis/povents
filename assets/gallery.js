(() => {
  const links = [...document.querySelectorAll('.gallery .shot a')];
  if (!links.length) return;

  const eventId = new URLSearchParams(location.search).get('id');
  const csrf = document.querySelector('meta[name="csrf-token"]')?.content || '';
  const toolbar = document.createElement('form');
  toolbar.className = 'gallery-toolbar';
  toolbar.id = 'gallery-download';
  toolbar.method = 'post';
  toolbar.action = '?action=download_zip';
  toolbar.innerHTML = `<input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="event_id" value="${eventId || ''}"><label><input type="checkbox" data-select-all> Select page</label><span data-selected>0 selected</span><button type="submit" disabled>Download ZIP</button><a class="button light album-download" href="?action=download_photo_album&amp;event_id=${encodeURIComponent(eventId || '')}">Download photo album</a><button class="button light album-share" type="button">Copy shareable album link</button>`;
  document.querySelector('.gallery').before(toolbar);
  const selectedLabel = toolbar.querySelector('[data-selected]');
  const downloadButton = toolbar.querySelector('button');
  const selectAll = toolbar.querySelector('[data-select-all]');
  const gallery = document.querySelector('.gallery');
  const shots = links.map(link => link.closest('.shot'));
  const photosPerPage = 30;
  const totalPages = Math.ceil(links.length / photosPerPage);
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
  shareButton.addEventListener('click', async () => {
    shareButton.disabled = true;
    try {
      const response = await fetch(`?action=shared_album_link&event_id=${encodeURIComponent(eventId || '')}`, {headers: {'Accept': 'application/json'}});
      const data = await response.json();
      if (!response.ok || !data.url) throw new Error(data.error || 'Could not create the share link.');
      await navigator.clipboard.writeText(data.url);
      shareButton.textContent = 'Album link copied!';
      setTimeout(() => { shareButton.textContent = 'Copy shareable album link'; }, 2500);
    } catch (error) {
      shareButton.textContent = error.message || 'Copy failed';
    } finally { shareButton.disabled = false; }
  });

  const checks = links.map(link => {
    const fileName = decodeURIComponent(new URL(link.href).pathname.split('/').pop());
    const label = document.createElement('label');
    label.className = 'photo-select';
    label.innerHTML = `<input type="checkbox" name="files[]" value="${fileName}"><span aria-hidden="true">✓</span>`;
    link.closest('.shot').appendChild(label);
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
    const pageChecks = checks.filter((_, index) => Math.floor(index / photosPerPage) === currentPage);
    const pageSelected = pageChecks.filter(check => check.checked).length;
    selectAll.checked = pageChecks.length > 0 && pageSelected === pageChecks.length;
    selectAll.indeterminate = pageSelected > 0 && pageSelected < pageChecks.length;
    links.forEach((link,index) => link.closest('.shot').classList.toggle('is-selected',checks[index].checked));
  }
  checks.forEach(check => check.addEventListener('change',updateSelection));
  selectAll.addEventListener('change',() => {checks.forEach((check,index) => {if(Math.floor(index/photosPerPage)===currentPage)check.checked=selectAll.checked;});updateSelection();});
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
