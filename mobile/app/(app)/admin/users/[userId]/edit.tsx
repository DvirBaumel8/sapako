import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchUsers, updateUser } from '../../../../../src/api/users';
import { PrimaryButton } from '../../../../../src/components/PrimaryButton';
import { useRequireAdmin } from '../../../../../src/auth/useRequireAdmin';
import { sanitizeUsername } from '../../../../../src/utils/hebrewInput';
import { isConflictError } from '../../../../../src/api/errors';
import { useAlert } from '../../../../../src/ui/AlertProvider';

const MIN_PASSWORD_LENGTH = 8;

export default function EditUserScreen() {
  useRequireAdmin();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const queryClient = useQueryClient();
  const showAlert = useAlert();
  const { data: users } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
  const user = users?.find((candidate) => candidate.id === userId);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [usernameError, setUsernameError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) setUsername(user.username);
  }, [user]);

  const handleSubmit = async () => {
    if (isSubmitting || !username || (password.length > 0 && password.length < MIN_PASSWORD_LENGTH)) {
      return;
    }
    setIsSubmitting(true);
    setUsernameError('');
    try {
      await updateUser(userId, {
        username,
        ...(password ? { password } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['users'] });
      router.back();
    } catch (err) {
      setIsSubmitting(false);
      if (isConflictError(err)) {
        setUsernameError('שם המשתמש כבר תפוס. יש לבחור שם אחר.');
      } else {
        showAlert({ title: 'שגיאה', message: 'עדכון המשתמש נכשל. יש לנסות שוב.' });
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
      <TextInput
        style={styles.input}
        placeholder="סיסמה חדשה (אופציונלי)"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      {password.length > 0 && password.length < MIN_PASSWORD_LENGTH && (
        <Text style={styles.hintText}>הסיסמה חייבת להכיל לפחות {MIN_PASSWORD_LENGTH} תווים.</Text>
      )}
      <PrimaryButton
        title="שמירת שינויים"
        onPress={handleSubmit}
        disabled={!username || (password.length > 0 && password.length < MIN_PASSWORD_LENGTH)}
        loading={isSubmitting}
      />
      <Pressable onPress={() => router.push(`/admin/users/${userId}/access`)} style={styles.accessButton}>
        <Text style={styles.accessButtonText}>ניהול הרשאות גישה</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12 },
  hintText: { color: '#666', fontSize: 13, textAlign: 'right' },
  errorText: { color: '#c0392b', fontSize: 13, textAlign: 'right' },
  accessButton: { padding: 12, alignItems: 'center' },
  accessButtonText: { color: '#2563eb', fontWeight: '600' },
});
