import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * A shared routine's link, `gymhound://routine/<code>` (§18.18, R464): opens Routines → Add from code with the code in
 * the field, where the person sees what it holds before anything is added.
 */
export default function SharedRoutineLink() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <Redirect href={{ pathname: '/routines/import', params: { code: typeof code === 'string' ? code : '' } }} />;
}
