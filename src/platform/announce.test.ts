import { AccessibilityInfo, Platform } from 'react-native';
import { announce } from './announce';

/** The screen reader's call. React Native's jest setup already mocks it, so each test starts it afresh. */
let call: jest.SpyInstance;

beforeEach(() => {
  jest.useFakeTimers();
  call = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockReset().mockImplementation(() => {});
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Announces `text` on `os`, letting any delay the platform takes run out. */
function announceOn(os: typeof Platform.OS, text: string): void {
  jest.replaceProperty(Platform, 'OS', os);
  announce(text);
  jest.runOnlyPendingTimers();
}

describe('announce', () => {
  it('does nothing on the web, which has no such call', () => {
    announceOn('web', 'Set 1 logged.');

    expect(call).not.toHaveBeenCalled();
  });

  it.each(['ios', 'android'] as const)('tells the screen reader on %s', (os) => {
    announceOn(os, 'Set 1 logged. Rest 2 minutes.');

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith('Set 1 logged. Rest 2 minutes.');
  });

  it('never throws when the screen reader cannot be told', () => {
    call.mockImplementation(() => {
      throw new Error('no screen reader');
    });

    expect(() => announceOn('android', 'Set 1 logged.')).not.toThrow();
  });
});
