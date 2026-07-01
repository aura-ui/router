import { PrefetchIntentBus } from '../../core/prefetch/intent/bus';
import { LinkIntentSource } from '../../core/prefetch/intent/link-source';
import { resolvePrefetchMode } from '../../core/prefetch/prefetch-policy';

function createLinkIntentSource(bus: PrefetchIntentBus): LinkIntentSource {
  return new LinkIntentSource(bus, {
    resolveMode: (anchor, _href, touch) =>
      resolvePrefetchMode({ anchor, routerDefault: 'intent', touch }),
  });
}

describe('PrefetchIntentBus', () => {
  it('notifies subscribers and supports unsubscribe', () => {
    const bus = new PrefetchIntentBus();
    const listener = jest.fn();
    const unsubscribe = bus.subscribe(listener);

    bus.emit({ type: 'schedule', href: '/page', source: 'test' });
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    bus.emit({ type: 'cancel', href: '/page', source: 'test' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('destroy clears listeners', () => {
    const bus = new PrefetchIntentBus();
    const listener = jest.fn();
    bus.subscribe(listener);
    bus.destroy();

    bus.emit({ type: 'schedule', href: '/page', source: 'test' });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('LinkIntentSource', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('bridges link hover to intent bus', () => {
    const bus = new PrefetchIntentBus();
    const listener = jest.fn();
    bus.subscribe(listener);

    const source = createLinkIntentSource(bus);
    source.start();

    document.body.innerHTML = '<a href="/about" data-router-link>About</a>';
    document.querySelector('a')!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));

    expect(listener).toHaveBeenCalledWith({
      type: 'schedule',
      href: '/about',
      mode: 'intent',
      source: 'link',
    });

    source.destroy();
  });

  it('bridges link leave to cancel intent', () => {
    const bus = new PrefetchIntentBus();
    const listener = jest.fn();
    bus.subscribe(listener);

    const source = createLinkIntentSource(bus);
    source.start();

    document.body.innerHTML = '<a href="/about" data-router-link>About</a>';
    const link = document.querySelector('a')!;
    link.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, relatedTarget: document.body }));

    expect(listener).toHaveBeenCalledWith({
      type: 'cancel',
      href: '/about',
      source: 'link',
    });

    source.destroy();
  });

  it('destroy cancels all intents', () => {
    const bus = new PrefetchIntentBus();
    const listener = jest.fn();
    bus.subscribe(listener);

    const source = createLinkIntentSource(bus);
    source.start();
    source.destroy();

    expect(listener).toHaveBeenCalledWith({ type: 'cancel', source: 'link' });
  });

  it('bridges touchstart to tap schedule intent', () => {
    const bus = new PrefetchIntentBus();
    const listener = jest.fn();
    bus.subscribe(listener);

    const source = createLinkIntentSource(bus);
    source.start();

    document.body.innerHTML =
      '<a href="/about" data-router-link data-prefetch="tap">About</a>';
    document.querySelector('a')!.dispatchEvent(new TouchEvent('touchstart', { bubbles: true }));

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'schedule', href: '/about', mode: 'tap' }),
    );

    source.destroy();
  });
});
