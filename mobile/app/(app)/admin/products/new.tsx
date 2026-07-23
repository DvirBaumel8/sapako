import React, { useState } from 'react';
import { Button, StyleSheet, TextInput, View, Pressable, Text } from 'react-native';
import { router } from 'expo-router';
import { createProduct } from '../../../../src/api/products';
import { BarcodeScannerModal } from '../../../../src/barcode/BarcodeScannerModal';

export default function NewProductScreen() {
  const [providerId, setProviderId] = useState('');
  const [name, setName] = useState('');
  const [unitType, setUnitType] = useState('');
  const [barcode, setBarcode] = useState('');
  const [isScannerVisible, setIsScannerVisible] = useState(false);

  const handleSubmit = async () => {
    await createProduct(providerId, { name, unitType, barcode: barcode || undefined });
    router.back();
  };

  return (
    <View style={styles.container}>
      <TextInput style={styles.input} placeholder="מזהה ספק" value={providerId} onChangeText={setProviderId} />
      <TextInput style={styles.input} placeholder="שם המוצר" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder='סוג יחידה (לדוגמה: ק"ג, ארגז)' value={unitType} onChangeText={setUnitType} />
      <TextInput style={styles.input} placeholder="ברקוד (אופציונלי)" value={barcode} onChangeText={setBarcode} />
      <Pressable onPress={() => setIsScannerVisible(true)} style={styles.scanButton}>
        <Text>סריקת ברקוד</Text>
      </Pressable>
      <BarcodeScannerModal visible={isScannerVisible} onScanned={setBarcode} onClose={() => setIsScannerVisible(false)} />
      <Button title="יצירת מוצר" onPress={handleSubmit} disabled={!providerId || !name || !unitType} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  scanButton: { padding: 12, borderWidth: 1, borderRadius: 8, alignItems: 'center' },
});
