import React, { useState } from 'react';
import { Button, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { createBranch } from '../../../../src/api/branches';

export default function NewBranchScreen() {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  const handleSubmit = async () => {
    await createBranch({ name, address: address || undefined });
    router.back();
  };

  return (
    <View style={styles.container}>
      <TextInput style={styles.input} placeholder="שם הסניף" value={name} onChangeText={setName} />
      <TextInput style={styles.input} placeholder="כתובת (אופציונלי)" value={address} onChangeText={setAddress} />
      <Button title="יצירת סניף" onPress={handleSubmit} disabled={!name} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
});
