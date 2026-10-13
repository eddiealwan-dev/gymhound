import { router } from 'expo-router';
import { Linking } from 'react-native';
import { act, create } from 'react-test-renderer';
import type { ReactTestRenderer } from 'react-test-renderer';
import ScanScreen from '../../app/food/scan';
import { createCustomFood, getFood } from '../db/repositories/foodsRepo';
import { seededDb } from '../db/testing/fixtures';
import type { Db } from '../db/types';
import { lookupBarcode } from '../platform/openFoodFacts';
import { useCreatedFood } from '../state/createdFood';
import { Button } from './Button';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let mockDb: Db;
let mockPro = true;
let mockPermission: { granted: boolean; canAskAgain: boolean } | null = { granted: true, canAskAgain: true };
const mockRequest = jest.fn();

jest.mock('expo-router', () => ({ router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn(), push: jest.fn() } }));
jest.mock('expo-camera', () => {
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return { CameraView: (props: object) => <View {...props} />, useCameraPermissions: () => [mockPermission, mockRequest] };
});
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) }));
jest.mock('../db/DbProvider', () => ({ useDb: () => mockDb }));
jest.mock('../platform/openFoodFacts', () => ({ lookupBarcode: jest.fn() }));
jest.mock('../platform/announce', () => ({ announce: jest.fn() }));
jest.mock('../platform/entitlements', () => ({ useIsPro: () => mockPro, entitlementsFor: () => ({ isPro: () => mockPro }) }));
jest.mock('./pro/ProPitch', () => {
  const { Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return { ProPitch: () => <Text>PRO PITCH</Text> };
});
jest.mock('./ThemeProvider', () => {
  const colors = { bg: '#100f0c', surface: '#1a1814', surfaceRaised: '#232019', border: '#2e2a23', text: '#f1ece2', textMuted: '#a39d90', red: '#E10600', textFaint: '#6d675c', borderStrong: '#736c60' };
  return { useTheme: () => ({ scheme: 'dark', colors }) };
});

const cola = { barcode: '049000028911', name: 'Coca-Cola', servingLabel: '355 ml', servingGrams: null, kcal: 149, proteinG: 0, carbsG: 37.6, fatG: 0 };

beforeEach(() => {
  mockDb = seededDb();
  mockPro = true;
  mockPermission = { granted: true, canAskAgain: true };
  useCreatedFood.setState({ id: null });
  jest.mocked(router.back).mockClear();
  jest.mocked(router.replace).mockClear();
  jest.mocked(lookupBarcode).mockReset();
  mockRequest.mockClear();
});

function mount(): ReactTestRenderer {
  let tree!: ReactTestRenderer;
  act(() => {
    tree = create(<ScanScreen />);
  });
  return tree;
}

const allText = (tree: ReactTestRenderer) => JSON.stringify(tree.toJSON());
const camera = (tree: ReactTestRenderer) => tree.root.findByProps({ testID: 'barcode-camera' });
const scan = (tree: ReactTestRenderer, data: string) => act(() => camera(tree).props.onBarcodeScanned({ type: 'ean13', data }));
const press = (tree: ReactTestRenderer, label: string) => act(() => tree.root.findAllByType(Button).find((b) => b.props.label === label)!.props.onPress());

describe('Scan barcode (R547)', () => {
  it('reads only food barcodes: EAN-13, EAN-8, UPC-A and UPC-E', () => {
    const tree = mount();
    expect(camera(tree).props.barcodeScannerSettings).toEqual({ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'] });
    expect(allText(tree)).toContain('Line the barcode up inside the frame.');
  });

  it('a barcode already on the phone opens that food at once, with no lookup', () => {
    const mine = createCustomFood(mockDb, { name: 'My bar', servingLabel: '1 bar', servingGrams: 60, kcal: 230, proteinG: 20, carbsG: 24, fatG: 8 }, '5000112548167');
    const tree = mount();
    scan(tree, '5000112548167');
    expect(lookupBarcode).not.toHaveBeenCalled();
    expect(useCreatedFood.getState().id).toBe(mine);
    expect(router.back).toHaveBeenCalled();
  });

  it('a barcode Open Food Facts knows is kept on the phone and opens, once however often the camera reports it', async () => {
    jest.mocked(lookupBarcode).mockResolvedValue({ status: 'found', food: cola });
    const tree = mount();
    // The camera can still deliver a report it already had; the handler then is the one from before.
    const handler = camera(tree).props.onBarcodeScanned;
    act(() => handler({ type: 'ean13', data: '049000028911' }));
    act(() => handler({ type: 'ean13', data: '049000028911' }));
    expect(camera(tree).props.onBarcodeScanned).toBeUndefined();
    expect(allText(tree)).toContain('Looking up 049000028911…');
    await act(async () => {});
    expect(lookupBarcode).toHaveBeenCalledTimes(1);
    expect(getFood(mockDb, 'off-049000028911')).toMatchObject({ name: 'Coca-Cola', source: 'online' });
    expect(useCreatedFood.getState().id).toBe('off-049000028911');
    expect(router.back).toHaveBeenCalledTimes(1);
  });

  it('ignores codes that are not on food (a QR code, a shelf label)', () => {
    const tree = mount();
    scan(tree, 'https://example.com');
    scan(tree, '1234');
    expect(lookupBarcode).not.toHaveBeenCalled();
    expect(allText(tree)).toContain('Line the barcode up inside the frame.');
  });

  it('a barcode nobody knows offers to add it as your own food, keeping the code', async () => {
    jest.mocked(lookupBarcode).mockResolvedValue({ status: 'not_found' });
    const tree = mount();
    scan(tree, '5000112548167');
    await act(async () => {});
    expect(allText(tree)).toContain("Open Food Facts doesn't have this barcode yet.");
    press(tree, 'Add as your own food');
    expect(router.replace).toHaveBeenCalledWith({ pathname: '/food/[id]', params: { id: 'new', barcode: '5000112548167', from: 'add' } });
  });

  it('with no connection says so, and Try again looks it up again', async () => {
    jest.mocked(lookupBarcode).mockResolvedValueOnce({ status: 'offline' }).mockResolvedValueOnce({ status: 'found', food: cola });
    const tree = mount();
    scan(tree, '049000028911');
    await act(async () => {});
    expect(allText(tree)).toContain("Couldn't reach Open Food Facts.");
    press(tree, 'Try again');
    await act(async () => {});
    expect(router.back).toHaveBeenCalled();
  });

  it('Scan again starts over after a miss', async () => {
    jest.mocked(lookupBarcode).mockResolvedValue({ status: 'not_found' });
    const tree = mount();
    scan(tree, '5000112548167');
    await act(async () => {});
    press(tree, 'Scan again');
    expect(allText(tree)).toContain('Line the barcode up inside the frame.');
    scan(tree, '049000028911');
    expect(lookupBarcode).toHaveBeenCalledTimes(2);
  });

  it('asks for the camera the first time, and says how to turn it on once refused', () => {
    mockPermission = { granted: false, canAskAgain: true };
    let tree = mount();
    expect(tree.root.findAllByProps({ testID: 'barcode-camera' })).toHaveLength(0);
    press(tree, 'Allow camera');
    expect(mockRequest).toHaveBeenCalled();

    mockPermission = { granted: false, canAskAgain: false };
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    tree = mount();
    expect(allText(tree)).toContain('Camera access is off for GymHound.');
    press(tree, 'Open Settings');
    expect(open).toHaveBeenCalled();
    open.mockRestore();
  });

  it('without Pro shows the pitch in its place', () => {
    mockPro = false;
    expect(allText(mount())).toContain('PRO PITCH');
  });
});
