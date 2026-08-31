import React, { useState } from 'react';
import { Button, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { isUnreachableError } from '../src/api/errors';
import { useAuth } from '../src/auth/AuthContext';

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await login(username, password);
      router.replace('/');
    } catch (err) {
      // A bare catch here used to report every failure as bad credentials,
      // including the server being unreachable — which is what an asleep
      // free-tier instance looks like, and it sends the user hunting for a
      // password problem that does not exist.
      setError(
        isUnreachableError(err)
          ? 'לא ניתן להתחבר לשרת כרגע. יש לבדוק את החיבור ולנסות שוב.'
          : 'שם משתמש או סיסמה שגויים',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>sapako</Text>
      <TextInput
        style={styles.input}
        placeholder="שם משתמש"
        autoCapitalize="none"
        value={username}
        onChangeText={setUsername}
      />
      <TextInput
        style={styles.input}
        placeholder="סיסמה"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Button title={isSubmitting ? 'מתחבר…' : 'התחברות'} onPress={handleSubmit} disabled={isSubmitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 24 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, textAlign: 'right' },
  error: { color: '#c0392b', textAlign: 'right' },
});
