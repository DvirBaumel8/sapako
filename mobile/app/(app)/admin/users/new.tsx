import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { createUser } from '../../../../src/api/users';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';

export default function NewUserScreen() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async () => {
    await createUser({ username, password, role: 'STAFF' });
    router.back();
  };

  return (
    <View style={styles.container}>
      <TextInput style={styles.input} placeholder="שם משתמש" autoCapitalize="none" value={username} onChangeText={setUsername} />
      <TextInput style={styles.input} placeholder="סיסמה זמנית" secureTextEntry value={password} onChangeText={setPassword} />
      <PrimaryButton title="יצירת משתמש" onPress={handleSubmit} disabled={!username || password.length < 8} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
});
