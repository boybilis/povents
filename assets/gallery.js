(() => {
  const links = [...document.querySelectorAll('.gallery .shot a')];
  if (!links.length) return;

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
