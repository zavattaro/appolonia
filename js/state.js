// Appolonia — wspólny stan aplikacji (treść wczytana z content/sessions.json)
export const APP_VERSION = '1.0.0';

export const state = {
  brand: null,
  categories: [],
  sessions: [],
};

export function getSession(id) { return state.sessions.find((s) => s.id === id) || null; }
export function getCategory(id) { return state.categories.find((c) => c.id === id) || null; }

export function applyTextSize(size) {
  const html = document.documentElement;
  html.classList.remove('text-s', 'text-m', 'text-l');
  html.classList.add('text-' + (['s', 'm', 'l'].includes(size) ? size : 'm'));
}
