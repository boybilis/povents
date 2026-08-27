(() => {
  const stack = document.createElement('div');
  stack.className = 'toast-stack';
  stack.setAttribute('aria-live', 'polite');
  stack.setAttribute('aria-atomic', 'false');
  document.body.appendChild(stack);

  const labels = {success: 'Success', error: 'Something went wrong', info: 'Notice', warning: 'Please note'};
  window.POVentsToast = (message, type = 'info', duration = 4200) => {
    if (!message) return;
    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.innerHTML = `<span class="toast__icon" aria-hidden="true"></span><div><strong>${labels[type] || labels.info}</strong><p></p></div><button type="button" aria-label="Dismiss notification">×</button><span class="toast__timer"></span>`;
    toast.querySelector('p').textContent = message;
    const close = () => { toast.classList.add('is-leaving'); setTimeout(() => toast.remove(), 230); };
    toast.querySelector('button').addEventListener('click', close);
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('is-visible'));
    if (duration > 0) setTimeout(close, duration);
  };

  document.querySelectorAll('[data-toast-message]').forEach(item => {
    window.POVentsToast(item.dataset.toastMessage, item.dataset.toastType || 'info');
    item.remove();
  });
  document.addEventListener('povents:toast', event => window.POVentsToast(event.detail?.message, event.detail?.type, event.detail?.duration));
})();
