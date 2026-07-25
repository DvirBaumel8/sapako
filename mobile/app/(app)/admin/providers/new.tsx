import React, { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchAccessibleBranches } from '../../../../src/api/branches';
import { createProvider } from '../../../../src/api/providers';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import type { Branch } from '../../../../src/api/types';

export default function NewProviderScreen() {
  const { data: branches } = useQuery({ queryKey: ['branches'], queryFn: fetchAccessibleBranches });
  const [branch, setBranch] = useState<Branch | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSubmit = async () => {
    if (!branch) return;
    await createProvider(branch.id, { name, phone });
    router.back();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>סניף</Text>
      <FlatList
        horizontal
        style={styles.branchList}
        data={branches}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setBranch(item)}
            style={[styles.branchChip, branch?.id === item.id && styles.branchChipSelected]}
          >
            <Text>{item.name}</Text>
          </Pressable>
        )}
      />
      <TextInput style={styles.input} placeholder="שם הספק" value={name} onChangeText={setName} />
      <TextInput
        style={styles.input}
        placeholder="טלפון וואטסאפ (לדוגמה: 972501234567+)"
        keyboardType="phone-pad"
        value={phone}
        onChangeText={setPhone}
      />
      <PrimaryButton title="יצירת ספק" onPress={handleSubmit} disabled={!branch || !name || !phone} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  label: { fontWeight: '600' },
  branchList: { flexGrow: 0 },
  branchChip: { paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, marginRight: 8 },
  branchChipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
});
