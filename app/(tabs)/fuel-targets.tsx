import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { getFuelTargets } from '../../src/db/repositories/foodLogRepo';
import { useIsPro } from '../../src/platform/entitlements';
import { useDbQuery } from '../../src/state/dataVersion';
import { flushAll } from '../../src/state/draftFlush';
import { setLeaveGuard } from '../../src/state/leaveGuard';
import { BackLink } from '../../src/ui/BackLink';
import { TargetsForm } from '../../src/ui/fuel/TargetsForm';
import { ProPitch } from '../../src/ui/pro/ProPitch';
import { Screen } from '../../src/ui/Screen';
import { afterSheetCloses, ConfirmSheet } from '../../src/ui/Sheet';
import { Body, Display } from '../../src/ui/Text';

/**
 * Fuel → Targets, a hidden tab route so the header and dock stay (R145, R154): the training-day and rest-day targets.
 * Leaving with changes not saved asks "Discard changes?" first, whether by Back, the Android back button, the dock or
 * the header, as the routine editor does. Without Pro it shows the pitch in place of the form (R151); stored targets
 * are kept.
 */
export default function FuelTargets() {
  const isPro = useIsPro();
  const stored = useDbQuery(getFuelTargets);
  /** Remounting the form (a new key) starts it again from what is stored. */
  const [formKey, setFormKey] = useState(0);
  const dirty = useRef(false);
  /** Whether the screen has had its first focus (the mount). */
  const focused = useRef(false);
  /** The move Back, the dock or the header was making when "Discard changes?" opened. */
  const [pendingLeave, setPendingLeave] = useState<(() => void) | null>(null);
  const pro = useRef(isPro);
  pro.current = isPro;
  // Pro off unmounts the form, so what it held is gone: nothing is left to ask about.
  if (!isPro) dirty.current = false;

  /** Takes `leave` over when there are changes to lose, opening "Discard changes?"; false lets it go now. */
  const askBeforeLeaving = useRef<(leave: () => void) => boolean>(() => false);
  askBeforeLeaving.current = (leave: () => void) => {
    flushAll();
    if (!pro.current || !dirty.current) return false;
    setPendingLeave(() => leave);
    return true;
  };

  // With nothing to go back to (opened by address, or reloaded), it lands on Fuel.
  const back = () => (router.canGoBack() ? router.back() : router.replace('/fuel'));
  const leave = () => {
    if (!askBeforeLeaving.current(back)) back();
  };

  useFocusEffect(
    useCallback(() => {
      // Back on the screen with nothing unsaved: the form starts from what is stored now (Settings may have changed it).
      // The first focus is the mount, which already read it.
      if (!focused.current) focused.current = true;
      else if (!dirty.current) setFormKey((key) => key + 1);
      const unguard = setLeaveGuard((go) => askBeforeLeaving.current(go));
      const hardware = BackHandler.addEventListener('hardwareBackPress', () => askBeforeLeaving.current(back));
      return () => {
        unguard();
        hardware.remove();
      };
    }, []),
  );

  return (
    <Screen>
      {/* Opened from Fuel or from Settings (a hidden tab keeps no reliable "from"), so it names neither. */}
      <BackLink label="Back" accessibilityLabel="Back" onPress={leave} />
      <Display>Targets</Display>
      {isPro ? (
        <>
          <Body muted style={{ marginTop: 8 }}>
            Training days are days you finish a workout. Every other day uses the rest day targets.
          </Body>
          <View style={{ marginTop: 24 }}>
            <TargetsForm
              key={formKey}
              initial={stored}
              submitLabel="Save"
              onDirtyChange={(next) => {
                dirty.current = next;
              }}
              onSaved={back}
            />
          </View>
        </>
      ) : (
        <View style={{ marginTop: 24 }}>
          <ProPitch context="tab" />
        </View>
      )}
      <ConfirmSheet
        visible={pendingLeave !== null}
        title="Discard changes?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        primary="cancel"
        onConfirm={() => {
          const go = pendingLeave;
          setPendingLeave(null);
          dirty.current = false;
          setFormKey((key) => key + 1);
          if (go) afterSheetCloses(go);
        }}
        onCancel={() => setPendingLeave(null)}
      />
    </Screen>
  );
}
