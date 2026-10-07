import { describe, expect, it } from 'vitest';
import { ApiError } from '../src/net/api';
import { setLang } from '../src/i18n';
import { showAuth } from '../src/ui/auth';
import { $, $$, clickEl, fakeApi, flush } from './helpers';

const submit = () => $('form').dispatchEvent(new Event('submit', { cancelable: true }));

describe('sign-in screen', () => {
  it('successful sign-in removes the screen and continues', async () => {
    const api = fakeApi();
    let done = 0;
    showAuth(api, () => done++);
    expect($('.logo').textContent).toContain('Lovely');
    ($('input[name=login]') as HTMLInputElement).value = '  lena ';
    ($('input[name=password]') as HTMLInputElement).value = 'secret1';
    submit();
    await flush();
    expect(api.login).toHaveBeenCalledWith('lena', 'secret1');
    expect(done).toBe(1);
    expect($('.auth')).toBeNull();
  });

  it('shows the server error and re-enables the button', async () => {
    const api = fakeApi({ login: async () => { throw new ApiError(401, 'wrong_credentials'); } });
    showAuth(api, () => {});
    submit();
    await flush();
    expect($('.auth-err').textContent).toBe('Wrong login or password');
    expect(($('button[type=submit]') as HTMLButtonElement).disabled).toBe(false);
  });

  it('sign-up sends name and avatar', async () => {
    const api = fakeApi();
    showAuth(api, () => {});
    clickEl($('[data-switch]'));
    expect($('button[type=submit]').textContent).toBe('Sign up');
    expect($('input[name=password]').getAttribute('autocomplete')).toBe('new-password');
    clickEl($$('.face-btn')[1]);
    expect($$('.face-btn.active')).toHaveLength(1);
    ($('input[name=login]') as HTMLInputElement).value = 'kolya';
    ($('input[name=password]') as HTMLInputElement).value = 'secret1';
    ($('input[name=name]') as HTMLInputElement).value = ' Kolya ';
    submit();
    await flush();
    expect(api.register).toHaveBeenCalledWith('kolya', 'secret1', 'Kolya', '👨‍🌾');
    expect($('.auth')).toBeNull();
  });

  it('switches back to sign-in', () => {
    showAuth(fakeApi(), () => {});
    clickEl($('[data-switch]'));
    clickEl($('[data-switch]'));
    expect($('button[type=submit]').textContent).toBe('Sign in');
    expect($('input[name=name]')).toBeNull();
  });

  it('language switch re-renders the screen', () => {
    showAuth(fakeApi(), () => {});
    clickEl($('[data-lang=en]'));
    expect($('.logo').textContent).toContain('Lovely');
    expect($('button[type=submit]').textContent).toBe('Sign in');
    $('.auth').remove();
    setLang('de'); // the screen is gone: no re-render and no crash
  });
});
