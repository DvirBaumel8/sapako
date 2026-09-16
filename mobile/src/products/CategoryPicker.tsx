import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { fetchCategoriesForProvider } from '../api/categories';

interface CategoryPickerProps {
  providerId: string;
  value: string | null;
  onChange: (categoryId: string | null) => void;
}

/**
 * Mirrors UnitTypePicker's chip row. "ללא קטגוריה" is always offered
 * alongside the provider's real categories — a product can be uncategorized,
 * but there is no separate row for it in the categories table itself.
 */
export function CategoryPicker({ providerId, value, onChange }: CategoryPickerProps) {
  const { data: categories } = useQuery({
    queryKey: ['categories', providerId],
    queryFn: () => fetchCategoriesForProvider(providerId),
  });

  return (
    <View style={styles.row}>
      <Pressable
        testID="category-option-none"
        onPress={() => onChange(null)}
        accessibilityRole="radio"
        accessibilityState={{ selected: value === null }}
        style={[styles.chip, value === null && styles.chipSelected]}
      >
        <Text style={[styles.chipText, value === null && styles.chipTextSelected]}>
          ללא קטגוריה
        </Text>
      </Pressable>
      {categories?.map((category) => {
        const isSelected = category.id === value;
        return (
          <Pressable
            key={category.id}
            testID={`category-option-${category.id}`}
            onPress={() => onChange(category.id)}
            accessibilityRole="radio"
            accessibilityState={{ selected: isSelected }}
            style={[styles.chip, isSelected && styles.chipSelected]}
          >
            <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
              {category.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ccc',
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  chipText: { fontSize: 15, color: '#1a1a1a' },
  chipTextSelected: { color: '#fff', fontWeight: '600' },
});
