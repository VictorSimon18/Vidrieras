// Pequeñas utilidades de UI: debounce y cambio de pestañas Original/Resultado.

/**
 * Devuelve una versión "debounced" de fn: solo se ejecuta después de que
 * pasen `delay` ms sin nuevas llamadas.
 */
export function debounce(fn, delay) {
  let timer = null;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

/**
 * Conecta un grupo de botones de pestaña con sus paneles asociados.
 * Cada botón debe tener `data-tab="id"` y cada panel `id="${id}-wrap"`.
 */
export function setupTabs(tabButtons, panelsById) {
  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      tabButtons.forEach((b) => b.classList.toggle('active', b === btn));
      const targetId = btn.dataset.tab;
      Object.entries(panelsById).forEach(([id, panel]) => {
        panel.dataset.active = String(id === targetId);
      });
    });
  });
}

export function setStatus(el, message, isError = false) {
  el.textContent = message || '';
  el.classList.toggle('error', Boolean(isError));
}
