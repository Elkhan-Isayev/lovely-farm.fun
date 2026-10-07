// Background music: recorded country tracks (generated with Suno) from public/audio/, played one after
// another in a shuffled loop. The files stream through an <audio> element, so nothing is decoded up front.

/** The tracks in public/audio/ (add a file there and its name here). */
export const MUSIC_TRACKS: string[] = ['two-step-fun.mp3', 'farm-walk.mp3', 'pastoral-peace.mp3', 'hoedown-on-the-farm.mp3'];

export interface Track {
  src: string;
  volume: number;
  play(): Promise<void>;
  pause(): void;
  addEventListener(ev: 'ended' | 'error', fn: () => void): void;
}

const makeTrack = (src: string): Track => {
  const a = new Audio(src);
  a.preload = 'auto';
  return a;
};

export class Music {
  private current: Track | null = null;
  private order: string[] = [];
  private index = 0;
  private wanted = false;

  constructor(
    private tracks: string[] = MUSIC_TRACKS,
    private volume = 0.35,
    private make: (src: string) => Track = makeTrack,
    private random: () => number = Math.random,
  ) {}

  get available() { return this.tracks.length > 0; }
  get playing() { return this.wanted && this.current !== null; }
  get track() { return this.current?.src ?? ''; }

  start() {
    if (!this.available) return;
    if (this.wanted && this.current) return;
    this.wanted = true;
    if (this.current) void this.current.play().catch(() => {});
    else this.next();
  }

  stop() {
    this.wanted = false;
    this.current?.pause();
  }

  /** Play the next track of a shuffled round; a track that fails to load is skipped. */
  next() {
    if (!this.wanted) return;
    if (this.index >= this.order.length) {
      const last = this.order.at(-1);
      this.order = shuffle(this.tracks, this.random);
      // a new round never starts with the track that just ended
      if (this.order.length > 1 && this.order[0] === last) [this.order[0], this.order[1]] = [this.order[1], this.order[0]];
      this.index = 0;
    }
    const src = `/audio/${this.order[this.index++]}`;
    const t = this.make(src);
    t.volume = this.volume;
    t.addEventListener('ended', () => { if (this.current === t) this.next(); });
    t.addEventListener('error', () => { if (this.current === t && this.tracks.length > 1) this.next(); });
    this.current?.pause();
    this.current = t;
    void t.play().catch(() => {}); // autoplay refused: the next gesture calls start() again
  }
}

function shuffle<T>(list: T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
