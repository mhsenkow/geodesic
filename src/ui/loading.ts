let overlay: HTMLElement | null = null;
let count = 0;

export function showLoading(message = 'Building geometry…'): void {
  count++;
  if (!overlay) {
    overlay = document.getElementById('loading-overlay');
  }
  if (!overlay) return;
  const msg = overlay.querySelector('.loading-message');
  if (msg) msg.textContent = message;
  overlay.classList.add('visible');
  overlay.setAttribute('aria-busy', 'true');
}

export function hideLoading(): void {
  count = Math.max(0, count - 1);
  if (count > 0 || !overlay) return;
  overlay.classList.remove('visible');
  overlay.setAttribute('aria-busy', 'false');
}

export async function withLoading<T>(fn: () => T | Promise<T>, message?: string): Promise<T> {
  showLoading(message);
  try {
    await new Promise((r) => requestAnimationFrame(r));
    return await fn();
  } finally {
    hideLoading();
  }
}
