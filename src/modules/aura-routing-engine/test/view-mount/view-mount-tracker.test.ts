import { CommitTracker } from '../../core/view-mount/view-mount-tracker';
import { isViewCommittedForHistory } from '../../core/view-mount/view-mount-state';

describe('CommitTracker', () => {
  it('starts with view none', () => {
    const tracker = new CommitTracker('/target');
    expect(tracker.snapshot).toEqual({ view: 'none', href: '/target' });
    expect(isViewCommittedForHistory(tracker.snapshot)).toBe(false);
  });

  it('tracks staged → committed happy path', () => {
    const tracker = new CommitTracker('/page');
    tracker.markViewStaged();
    expect(tracker.snapshot.view).toBe('staged');
    expect(isViewCommittedForHistory(tracker.snapshot)).toBe(false);

    tracker.markViewCommitted();
    expect(tracker.snapshot.view).toBe('committed');
    expect(isViewCommittedForHistory(tracker.snapshot)).toBe(true);
    expect(tracker.isViewCommitted()).toBe(true);
  });

  it('marks committed on render error recovery', () => {
    const tracker = new CommitTracker('/broken');
    tracker.markViewCommittedAfterErrorRecovery();
    expect(tracker.snapshot.view).toBe('committed');
    expect(isViewCommittedForHistory(tracker.snapshot)).toBe(true);
  });
});
