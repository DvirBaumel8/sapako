import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { createBranch } from '../../../../src/api/branches';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';

export default function NewBranchScreen() {
  useRequireAdmin();
  const [name, setName] = useState('');

  const handleSubmit = async () => {
    await createBranch({ name });
    router.back();
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="שם הסניף"
        value={name}
        onChangeText={(text) => setName(sanitizeHebrewInput(text))}
      />
      <PrimaryButton title="יצירת סניף" onPress={handleSubmit} disabled={!name} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
});
