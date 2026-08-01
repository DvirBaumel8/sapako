import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { updateDepartment } from '../../../../src/api/departments';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';

export default function EditDepartmentScreen() {
  useRequireAdmin();
  const { departmentId, departmentName, departmentIsActive } = useLocalSearchParams<{
    departmentId: string;
    departmentName?: string;
    departmentIsActive?: string;
  }>();
  const [name, setName] = useState(departmentName ?? '');
  const [isActive, setIsActive] = useState(departmentIsActive !== 'false');

  const handleSubmit = async () => {
    await updateDepartment(departmentId, { name, isActive });
    router.back();
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="שם המחלקה"
        value={name}
        onChangeText={(text) => setName(sanitizeHebrewInput(text))}
      />
      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>פעיל</Text>
        <Switch value={isActive} onValueChange={setIsActive} />
      </View>
      <PrimaryButton title="שמירה" onPress={handleSubmit} disabled={!name} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 16, fontWeight: '600' },
});
