import React, { useState } from 'react';
import { Button, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { createUser } from '../../../../src/api/users';
import type { Role } from '../../../../src/api/types';

export default function NewUserScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('STAFF');

  const handleSubmit = async () => {
    await createUser({ username, password, role });
    router.back();
  };

  return (
    <View style={styles.container}>
      <TextInput style={styles.input} placeholder="שם משתמש" autoCapitalize="none" value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="סיסמה זמנית" secureTextEntry value={password} onChangeText={setPassword} />
      <View style={styles.roleRow}>
        {(['STAFF', 'ADMIN'] as Role[]).map((option) => (
          <Pressable
            key={option}
            onPress={() => setRole(option)}
            style={[styles.roleChip, role === option && styles.roleChipSelected]}
          >
            <Text>{option === 'ADMIN' ? 'מנהל' : 'עובד'}</Text>
          </Pressable>
        ))}
      </View>
      <Button title="יצירת משתמש" onPress={handleSubmit} disabled={!username || password.length < 8} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  roleRow: { flexDirection: 'row', gap: 8 },
  roleChip: { padding: 8, borderWidth: 1, borderRadius: 8 },
  roleChipSelected: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
});
