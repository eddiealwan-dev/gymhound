import * as StoreReview from 'expo-store-review';

/**
 * Asks the store for its rating prompt (R586). The store decides whether it shows: iOS at most three times a year, and
 * never on the web. A failure is logged and never reaches the screen.
 */
export async function requestStoreReview(): Promise<void> {
  try {
    if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
  } catch (error) {
    console.warn('GymHound could not ask for a rating.', error);
  }
}
