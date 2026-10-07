// "About the game": the fan-project disclaimer, where to send questions, and the credits the licences
// ask for (Suno's free plan requires attribution for its music).
import { t } from '../i18n';
import { h } from './dom';

export const CONTACT_URL = 'https://github.com/Elkhan-Isayev';

/** The contact line on its own (the sign-in screen shows just this and the disclaimer). */
export function contactLine(): HTMLElement {
  return h('p', { class: 'tiny about-contact' }, t('about.contact'), ' ',
    h('a', { href: CONTACT_URL, target: '_blank', rel: 'noopener noreferrer', 'data-contact': '' }, CONTACT_URL.replace('https://', '')));
}

/** The full block for the profile window. */
export function aboutBlock(): HTMLElement {
  return h('div', { class: 'about', 'data-about': '' },
    h('h3', null, t('about.title')),
    h('p', { class: 'tiny' }, t('app.disclaimer')),
    contactLine(),
    h('p', { class: 'tiny' }, t('about.credits')));
}
