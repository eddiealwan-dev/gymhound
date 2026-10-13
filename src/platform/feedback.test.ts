import { Linking } from 'react-native';
import { FEEDBACK_EMAIL, feedbackBody, feedbackMailto, openFeedbackEmail } from './feedback';

jest.mock('./buildStamp', () => ({ buildStamp: () => ({ commit: 'abc1234', date: '2026-10-13' }) }));

describe('Send feedback (R570)', () => {
  it('addresses GymHound with the subject, and a body that asks for an idea or a bug and names the build', () => {
    const url = feedbackMailto('abc1234 · 2026-10-13', 'iOS 18.2');
    expect(url.startsWith(`mailto:${FEEDBACK_EMAIL}?subject=GymHound%20feedback&body=`)).toBe(true);
    const body = decodeURIComponent(url.split('&body=')[1]);
    expect(body).toBe(feedbackBody('abc1234 · 2026-10-13', 'iOS 18.2'));
    expect(body).toContain('What would make GymHound better, or what went wrong?');
    expect(body).toContain('For a bug: what you did, what you expected, and what happened instead.');
    expect(body.endsWith('Build abc1234 · 2026-10-13 · iOS 18.2')).toBe(true);
    // Line breaks and the middle dot survive the trip through the address.
    expect(url).not.toMatch(/[\n ·]/);
    expect(feedbackBody(null, 'Web').endsWith('Build not known · Web')).toBe(true);
  });

  it("opens the mail app, or says it couldn't", async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValueOnce(true);
    await expect(openFeedbackEmail()).resolves.toBe('opened');
    expect(open.mock.calls[0][0]).toMatch(/^mailto:grunthound@gmail\.com\?subject=GymHound%20feedback&body=.*Build%20abc1234/);
    open.mockRejectedValueOnce(new Error('No mail app'));
    await expect(openFeedbackEmail()).resolves.toBe('unavailable');
    open.mockRestore();
  });
});
