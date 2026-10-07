import './styles.css';
import { boot } from './app';
import { api } from './net/api';
import { preloadArt } from './render/art';

// painted sprites download while the player signs in; procedural ones fill in until then
void preloadArt();

const dev = new URLSearchParams(location.search).has('dev');

void boot(api, {
  canvas: document.getElementById('world') as HTMLCanvasElement,
  dev,
}).then((running) => {
  // in dev mode the running game is exposed to the console (and to e2e tests)
  if (dev && running) (window as unknown as { __farm: typeof running }).__farm = running;
});
