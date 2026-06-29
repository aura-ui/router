import { ViewCommitTracker } from '../../core/view-mount/view-commit-tracker';
import { isViewCommittedForHistory } from '../../core/view-mount/view-commit-state';

describe('ViewCommitTracker', () => {
  it('starts with view none', () => {
    const tracker = new ViewCommitTracker('/target');
    expect(tracker.snapshot).toEqual({ view: 'none', href: '/target' });
    expect(isViewCommittedForHistory(tracker.snapshot)).toBe(false);
  });

  it('tracks staged → committed happy path', () => {
    const tracker = new ViewCommitTracker('/page');
    tracker.markViewStaged();
    expect(tracker.snapshot.view).toBe('staged');
    expect(isViewCommittedForHistory(tracker.snapshot)).toBe(false);

    tracker.markViewCommitted();
    expect(tracker.snapshot.view).toBe('committed');
    expect(isViewCommittedForHistory(tracker.snapshot)).toBe(true);
    expect(tracker.isViewCommitted()).toBe(true);
  });

  it('marks committed on render error recovery', () => {
    const tracker = new ViewCommitTracker('/broken');
    tracker.markViewCommittedAfterErrorRecovery();
    expect(tracker.snapshot.view).toBe('committed');
    expect(isViewCommittedForHistory(tracker.snapshot)).toBe(true);
  });
});
