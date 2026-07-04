import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';

import { AppButton } from '@/components/AppButton';
import { AppCard } from '@/components/AppCard';
import { colors } from '@/constants/colors';

const JAN_BARCODE_TYPES = new Set(['ean13', 'ean8', 'upc_a', 'upc_e']);

export default function BarcodeScanScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [isScanned, setIsScanned] = useState(false);
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [scanMessage, setScanMessage] = useState('カメラをバーコードに近づけてください。');

  const hasPermission = permission?.granted;

  const handleBarcodeScanned = ({ data, type }: BarcodeScanningResult) => {
    if (isScanned) return;
    setScanMessage(`${type} を検出しました。`);
    if (!JAN_BARCODE_TYPES.has(type)) {
      setScanMessage(`${type} を検出しました。JAN/EAN/UPCのバーコードを読み取ってください。`);
      return;
    }
    const barcode = data.replace(/\D/g, '');
    if (!barcode) {
      setScanMessage('バーコードを検出しましたが、数字を読み取れませんでした。');
      return;
    }
    setIsScanned(true);
    setScanMessage(`${barcode} を読み取りました。`);
    router.replace({
      pathname: '/inventory-form',
      params: { barcode, scannedAt: String(Date.now()) },
    });
  };

  if (!permission) {
    return (
      <View style={styles.container}>
        <AppCard style={styles.card}>
          <Text style={styles.title}>バーコード読み取り</Text>
          <Text style={styles.body}>カメラの準備をしています。</Text>
        </AppCard>
      </View>
    );
  }

  if (!hasPermission) {
    return (
      <View style={styles.container}>
        <AppCard style={styles.card}>
          <Text style={styles.title}>カメラの使用を許可してください</Text>
          <Text style={styles.body}>
            JANコードを読み取って、商品マスタに登録されている候補を在庫フォームへ反映します。
          </Text>
          <AppButton title="カメラを許可する" onPress={() => void requestPermission()} />
          <AppButton title="戻る" variant="secondary" onPress={() => router.back()} />
        </AppCard>
      </View>
    );
  }

  return (
    <View style={styles.scannerContainer}>
      <CameraView
        style={styles.camera}
        facing="back"
        active
        autofocus="off"
        enableTorch={torchEnabled}
        barcodeScannerSettings={{
          barcodeTypes: [
            'ean13',
            'ean8',
            'upc_a',
            'upc_e',
            'code128',
            'code39',
            'code93',
            'itf14',
            'codabar',
            'qr',
          ],
        }}
        onCameraReady={() => {
          setCameraReady(true);
          setScanMessage('バーコードを枠内に大きく映してください。');
        }}
        onMountError={(event) => setScanMessage(`カメラの起動に失敗しました: ${event.message}`)}
        onBarcodeScanned={isScanned ? undefined : handleBarcodeScanned}
      />
      <View pointerEvents="box-none" style={styles.overlay}>
        <View style={styles.header}>
          <Text style={styles.scannerTitle}>JANコードを枠内に合わせてください</Text>
          <Text style={styles.scannerBody}>
            {cameraReady ? scanMessage : 'カメラを起動しています。'}
          </Text>
        </View>
        <View pointerEvents="none" style={styles.scanFrame}>
          <View style={[styles.corner, styles.cornerTopLeft]} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>
        <View style={styles.actions}>
          <AppButton
            title={torchEnabled ? 'ライトを消す' : 'ライトをつける'}
            variant="secondary"
            onPress={() => setTorchEnabled((current) => !current)}
            style={styles.actionButton}
          />
          <AppButton title="戻る" variant="secondary" onPress={() => router.back()} style={styles.actionButton} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 18,
  },
  card: {
    gap: 14,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '900',
  },
  body: {
    color: colors.subText,
    fontSize: 15,
    lineHeight: 23,
  },
  scannerContainer: {
    backgroundColor: '#000',
    flex: 1,
  },
  camera: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    flex: 1,
    justifyContent: 'space-between',
    padding: 22,
    paddingBottom: 34,
    paddingTop: 56,
  },
  header: {
    backgroundColor: 'rgba(255, 253, 248, 0.94)',
    borderRadius: 12,
    gap: 6,
    padding: 14,
  },
  scannerTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '900',
  },
  scannerBody: {
    color: colors.subText,
    fontSize: 14,
    lineHeight: 21,
  },
  scanFrame: {
    alignSelf: 'center',
    height: 180,
    position: 'relative',
    width: '88%',
  },
  corner: {
    borderColor: colors.primary,
    height: 42,
    position: 'absolute',
    width: 42,
  },
  cornerTopLeft: {
    borderLeftWidth: 5,
    borderTopWidth: 5,
    left: 0,
    top: 0,
  },
  cornerTopRight: {
    borderRightWidth: 5,
    borderTopWidth: 5,
    right: 0,
    top: 0,
  },
  cornerBottomLeft: {
    borderBottomWidth: 5,
    borderLeftWidth: 5,
    bottom: 0,
    left: 0,
  },
  cornerBottomRight: {
    borderBottomWidth: 5,
    borderRightWidth: 5,
    bottom: 0,
    right: 0,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
  },
});
