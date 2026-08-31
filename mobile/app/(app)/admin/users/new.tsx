import React, { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { createUser } from '../../../../src/api/users';
import { PrimaryButton } from '../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../src/auth/useRequireAdmin';
import { sanitizeUsername } from '../../../../src/utils/hebrewInput';
import { isConflictError } from '../../../../src/api/errors';
import { useAlert } from '../../../../src/ui/AlertProvider';

// Matches the backend's rule; shown to the user rather than only enforced.
const MIN_PASSWORD_LENGTH = 8;

export default function NewUserScreen() {
  useRequireAdmin();
  const showAlert = useAlert();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  // Guards against a second submit while the first is still in flight: on a
  // slow connection the button looks inert, so it gets tapped again and the
  // record is created twice.
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setUsernameError('');
    try {
      await createUser({ username, password, role: 'STAFF' });
      // Refresh the list this row belongs to before returning to it —
      // otherwise the screen renders its cached copy and the new record
      // appears only after navigating away and back.
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      router.back();
    } catch (err) {
      setIsSubmitting(false);
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
          setUsername(sanitizeUsername(text));
          setUsernameError('');
        }}
      />
      {usernameError.length > 0 && <Text style={styles.errorText}>{usernameError}</Text>}
      <TextInput style={styles.input} placeholder="סיסמה זמנית" secureTextEntry value={password} onChangeText={setPassword} />
      {/* A disabled button with no stated reason leaves the user guessing. */}
      {password.length > 0 && password.length < MIN_PASSWORD_LENGTH && (
        <Text style={styles.hintText}>
          הסיסמה חייבת להכיל לפחות {MIN_PASSWORD_LENGTH} תווים.
        </Text>
      )}
      {username.length === 0 && password.length >= MIN_PASSWORD_LENGTH && (
        <Text style={styles.hintText}>יש להזין שם משתמש.</Text>
      )}
      <PrimaryButton title="יצירת משתמש" onPress={handleSubmit} disabled={!username || password.length < MIN_PASSWORD_LENGTH || isSubmitting} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  hintText: { color: '#666', fontSize: 13, textAlign: 'right' },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
});
