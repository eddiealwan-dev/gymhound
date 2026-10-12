import { type BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Linking, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDb } from '../../src/db/DbProvider';
import { findFoodByBarcode, saveOnlineFood } from '../../src/db/repositories/foodsRepo';
import { normalizeBarcode } from '../../src/domain/openFoodFacts';
import { announce } from '../../src/platform/announce';
import { useIsPro } from '../../src/platform/entitlements';
import { lookupBarcode } from '../../src/platform/openFoodFacts';
import { useCreatedFood } from '../../src/state/createdFood';
import { bumpData } from '../../src/state/dataVersion';
import { Button } from '../../src/ui/Button';
import { ProPitch } from '../../src/ui/pro/ProPitch';
import { Screen } from '../../src/ui/Screen';
import { Body, Display } from '../../src/ui/Text';
import { useTheme } from '../../src/ui/ThemeProvider';

/** The codes on food packs: EAN-13, EAN-8, UPC-A and UPC-E. */
const FOOD_BARCODES = ['ean13', 'ean8', 'upc_a', 'upc_e'] as const;

/** The frame over the camera: light on any picture, so it reads over a dark or a bright pack. */
const FRAME = 'rgba(255,255,255,0.9)';

/** Back to Add food. With nothing to go back to (opened by address, or reloaded), it lands on Fuel. */
function close() {
  if (router.canGoBack()) router.back();
  else router.replace('/fuel');
}

type Phase =
  | { kind: 'scanning' }
  | { kind: 'looking'; code: string }
  /** Nothing to log yet: Open Food Facts doesn't have it, or couldn't be reached. */
  | { kind: 'missing'; code: string; why: 'not_found' | 'offline' | 'unavailable' };

const MISSING_TEXT: Record<'not_found' | 'offline' | 'unavailable', string> = {
  not_found: "Open Food Facts doesn't have this barcode yet. Add it as your own food, and scanning it next time finds it.",
  offline: "Couldn't reach Open Food Facts. Check your connection and try again, or add it as your own food.",
  unavailable: "Open Food Facts didn't answer. Try again in a minute, or add it as your own food.",
};

/**
 * Scan barcode (§18.22, R547), full screen over Add food. A code on the phone already (your own food made for it, or
 * one found before) opens at once; otherwise Open Food Facts is asked, and a food it knows is kept on the phone. Either
 * way it goes back to Add food with that food's servings open, as **New food** does. A barcode nobody knows, or no
 * connection, offers **Add as your own food** with the code kept on it, so the next scan finds it. Only the barcode is
 * sent. The camera asks for access the first time; refused, it says how to turn it on.
 */
function Scanner() {
  const db = useDb();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });
  /** Set once a code is taken: the camera reports the same code many times a second. */
  const taken = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  const open = (foodId: string) => {
    useCreatedFood.getState().set(foodId);
    bumpData();
    close();
  };

  const lookUp = (code: string) => {
    setPhase({ kind: 'looking', code });
    announce('Looking up the barcode');
    void lookupBarcode(code).then((result) => {
      if (!mounted.current) return;
      if (result.status === 'found') {
        open(saveOnlineFood(db, result.food));
        return;
      }
      setPhase({ kind: 'missing', code, why: result.status });
      announce(MISSING_TEXT[result.status]);
    });
  };

  const scanned = ({ data }: BarcodeScanningResult) => {
    if (taken.current) return;
    const code = normalizeBarcode(data);
    // Not a food's code (a QR code, a shelf label): keep looking.
    if (code === null) return;
    taken.current = true;
    const onPhone = findFoodByBarcode(db, code);
    if (onPhone !== null) open(onPhone.id);
    else lookUp(code);
  };

  const scanAgain = () => {
    taken.current = false;
    setPhase({ kind: 'scanning' });
  };

  // The food editor takes this screen's place, so its Save goes back to Add food with the new food's servings open.
  const makeOwn = (code: string) => router.replace({ pathname: '/food/[id]', params: { id: 'new', barcode: code, from: 'add' } });

  const granted = permission?.granted === true;

  let panel: ReactNode;
  if (Platform.OS === 'web') {
    panel = <Body>Scanning works in the app on your phone.</Body>;
  } else if (permission === null) {
    panel = null;
  } else if (!granted && permission.canAskAgain) {
    panel = (
      <>
        <Body>GymHound uses the camera only to read a barcode. Nothing is recorded.</Body>
        <Button label="Allow camera" onPress={() => void requestPermission()} />
      </>
    );
  } else if (!granted) {
    panel = (
      <>
        <Body>Camera access is off for GymHound. Turn it on in Settings to scan.</Body>
        <Button label="Open Settings" onPress={() => void Linking.openSettings()} />
      </>
    );
  } else if (phase.kind === 'scanning') {
    panel = <Body muted>Line the barcode up inside the frame.</Body>;
  } else if (phase.kind === 'looking') {
    panel = (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ActivityIndicator color={colors.textMuted} />
        <Body>{`Looking up ${phase.code}…`}</Body>
      </View>
    );
  } else {
    const { code, why } = phase;
    panel = (
      <>
        <Body>{MISSING_TEXT[why]}</Body>
        {why === 'not_found' ? (
          <>
            <Button label="Add as your own food" onPress={() => makeOwn(code)} />
            <Button label="Scan again" variant="secondary" onPress={scanAgain} />
          </>
        ) : (
          <>
            <Button label="Try again" onPress={() => lookUp(code)} />
            <Button label="Add as your own food" variant="secondary" onPress={() => makeOwn(code)} />
          </>
        )}
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* Cancel steps back by the quiet button's padding, so its word ends on the gutter. */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: insets.top + 8, paddingLeft: 16, marginRight: -4, paddingBottom: 8 }}>
        <Display weight={700} accessibilityRole="header" style={{ flex: 1 }}>
          Scan barcode
        </Display>
        <Button label="Cancel" variant="quiet" onPress={close} />
      </View>
      <View style={{ flex: 1, backgroundColor: colors.surfaceRaised, overflow: 'hidden' }}>
        {granted && Platform.OS !== 'web' ? (
          <>
            <CameraView
              testID="barcode-camera"
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: [...FOOD_BARCODES] }}
              // Taken off while a code is being looked up, so the camera stops reporting it.
              onBarcodeScanned={phase.kind === 'scanning' ? scanned : undefined}
              accessibilityLabel="Camera, pointed at a barcode"
            />
            <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
              <View style={{ width: '78%', aspectRatio: 2, borderWidth: 2, borderColor: FRAME, borderRadius: 12 }} />
            </View>
          </>
        ) : null}
      </View>
      <View style={{ padding: 16, paddingBottom: 16 + insets.bottom, gap: 12, backgroundColor: colors.bg }} accessibilityLiveRegion="polite">
        {panel}
      </View>
    </View>
  );
}

/** The scanner, or without Pro the pitch in its place (R151), as Add food. */
export default function ScanScreen() {
  const pro = useIsPro();
  if (pro) return <Scanner />;
  return (
    <Screen>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: -20, marginBottom: 24 }}>
        <Display weight={700} accessibilityRole="header" style={{ flex: 1 }}>
          Scan barcode
        </Display>
        <Button label="Cancel" variant="quiet" onPress={close} />
      </View>
      <ProPitch context="tab" />
    </Screen>
  );
}
