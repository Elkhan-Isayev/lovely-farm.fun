// Sign-in / sign-up screen, styled like the original's splash.
import { onLangChange, t } from '../i18n';
import type { Api } from '../net/api';
import { h } from './dom';
import { contactLine } from './about';
import { root } from './modal';
import { langPicker } from './panels';

const FACES = ['👩‍🌾', '👨‍🌾', '👩', '👨', '👧', '👦', '👵', '👴'];

export function showAuth(api: Api, onDone: () => void): HTMLElement {
  let mode: 'login' | 'register' = 'login';
  let face = FACES[0];
  const screen = h('div', { class: 'auth' });

  const render = () => {
    const err = h('div', { class: 'auth-err', role: 'alert' });
    const login = h('input', { class: 'input', name: 'login', placeholder: t('auth.login'), 'aria-label': t('auth.login'), autocomplete: 'username', required: true });
    const name = h('input', { class: 'input', name: 'name', placeholder: t('auth.name'), 'aria-label': t('auth.name') });
    const pass = h('input', {
      class: 'input', name: 'password', type: 'password', placeholder: t('auth.password'), 'aria-label': t('auth.password'),
      autocomplete: mode === 'login' ? 'current-password' : 'new-password', required: true,
    });
    const faces = h('div', { class: 'faces' }, FACES.map((f) => h('button', {
      type: 'button', class: 'face-btn' + (f === face ? ' active' : ''), 'data-face': f, onclick: (e: Event) => {
        face = f;
        faces.querySelectorAll('.face-btn').forEach((b) => b.classList.remove('active'));
        (e.currentTarget as HTMLElement).classList.add('active');
      },
    }, f)));
    const submit = h('button', { class: 'btn green big', type: 'submit' }, mode === 'login' ? t('auth.signIn') : t('auth.register'));
    const form = h('form', {
      class: 'auth-form',
      onsubmit: async (e: Event) => {
        e.preventDefault();
        err.textContent = '';
        submit.disabled = true;
        try {
          if (mode === 'login') await api.login(login.value.trim(), pass.value);
          else await api.register(login.value.trim(), pass.value, name.value.trim(), face);
          screen.remove();
          onDone();
        } catch (ex) {
          err.textContent = (ex as Error).message;
        } finally {
          submit.disabled = false;
        }
      },
    },
    login, pass,
    mode === 'register' ? h('div', { class: 'reg-only' }, name, h('div', { class: 'sub' }, t('auth.avatar')), faces) : null,
    err, submit,
    h('button', { class: 'link', type: 'button', 'data-switch': '', onclick: () => { mode = mode === 'login' ? 'register' : 'login'; render(); } },
      mode === 'login' ? t('auth.toRegister') : t('auth.toLogin')));

    screen.replaceChildren(h('div', { class: 'auth-card' },
      langPicker(),
      h('div', { class: 'logo' }, ...t('app.title').split(' ').map((w) => h('span', null, w)), h('span', { class: 'heart' }, '❤')),
      h('p', { class: 'sub center' }, t('app.tagline')),
      form,
      h('p', { class: 'tiny' }, t('app.disclaimer')),
      contactLine()));
    login.focus();
  };

  render();
  onLangChange(() => { if (screen.isConnected) render(); });
  root().appendChild(screen);
  return screen;
}
