(() => {
  const dialog = document.querySelector('[data-delete-event-dialog]');
  const openButton = document.querySelector('[data-delete-event-open]');
  const cancelButton = document.querySelector('[data-delete-event-cancel]');
  if (!dialog || !openButton || !cancelButton) return;

  const eventHeading = document.querySelector('.dash-head');
  const photoCount = eventHeading?.querySelector(':scope > strong');
  if (eventHeading && photoCount) {
    const actions = document.createElement('div');
    actions.className = 'event-heading-actions';
    photoCount.replaceWith(actions);
    actions.append(photoCount, openButton);
    document.querySelector('.event-admin-danger')?.remove();
  }

  openButton.addEventListener('click', () => {
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    cancelButton.focus();
  });
  cancelButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) dialog.close();
  });
  dialog.querySelector('form').addEventListener('submit', () => {
    const submit = dialog.querySelector('.event-delete-confirm');
    submit.disabled = true;
    submit.textContent = 'Deleting…';
    cancelButton.disabled = true;
  });
})();
