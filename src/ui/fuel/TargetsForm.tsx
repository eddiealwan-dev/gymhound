import type { ReactElement } from 'react';
import type { FuelTargets } from '../../domain/types';

/**
 * Training-day and rest-day targets (R145): calories and protein required, carbs and fat optional. Saves to the
 * `fuelTargets` setting, then calls `onSaved`. A stub until Task 10 fills it; Task 10 keeps these props.
 */
export function TargetsForm(_props: { initial: FuelTargets | null; submitLabel: string; onSaved: () => void }): ReactElement | null {
  return null;
}
