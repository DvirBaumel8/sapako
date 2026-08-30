import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { createUser } from '../../../../src/api/users';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { sanitizeHebrewInput } from '../../../../src/utils/hebrewInput';
import { isConflictError } from '../../../../src/api/errors';
import { useAlert } from '../../../../src/ui/AlertProvider';

export default function NewUserScreen() {
  useRequireAdmin();
  const showAlert = useAlert();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');

  const handleSubmit = async () => {
    setUsernameError('');
    try {
      await createUser({ username, password, role: 'STAFF' });
      router.back();
    } catch (err) {
      if (isConflictError(err)) {
        setUsernameError('שם המשתמש כבר תפוס. יש לבחור שם אחר.');
      } else {
        showAlert({ title: 'שגיאה', message: 'יצירת המשתמש נכשלה. יש לנסות שוב.' });
      }
    }
  };

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.input}
        placeholder="שם משתמש"
        autoCapitalize="none"
        value={username}
        onChangeText={(text) => {
          setUsername(sanitizeHebrewInput(text));
          setUsernameError('');
        }}
      />
      {usernameError.length > 0 && <Text style={styles.errorText}>{usernameError}</Text>}
      <TextInput style={styles.input} placeholder="סיסמה זמנית" secureTextEntry value={password} onChangeText={setPassword} />
      <PrimaryButton title="יצירת משתמש" onPress={handleSubmit} disabled={!username || password.length < 8} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
});
