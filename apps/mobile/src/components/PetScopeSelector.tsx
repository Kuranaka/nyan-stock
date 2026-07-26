import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/constants/colors';
import { getDefaultPetTypeIcon } from '@/features/cats/petTypeIcons';
import { Cat } from '@/features/cats/catTypes';

type PetScopeSelectorProps = {
  cats: Cat[];
  selectedCatId?: string;
  onSelect: (catId: string | undefined) => void;
};

export function PetScopeSelector({ cats, selectedCatId, onSelect }: PetScopeSelectorProps) {
  if (cats.length === 0) return null;

  return (
    <View style={styles.section}>
      <Text style={styles.label}>表示するペット</Text>
      <ScrollView
        horizontal
        contentContainerStyle={styles.chips}
        showsHorizontalScrollIndicator={false}
      >
        {cats.length > 1 ? (
          <PetScopeChip
            label="みんな"
            selected={selectedCatId === undefined}
            onPress={() => onSelect(undefined)}
          />
        ) : null}
        {cats.map((cat) => (
          <PetScopeChip
            key={cat.id}
            cat={cat}
            label={cat.name}
            selected={cats.length === 1 || cat.id === selectedCatId}
            onPress={() => onSelect(cat.id)}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function PetScopeChip({
  cat,
  label,
  selected,
  onPress,
}: {
  cat?: Cat;
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityLabel={`${label}の用品を表示`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.chipPressed,
      ]}
    >
      {cat ? (
        <Image
          accessibilityIgnoresInvertColors
          resizeMode="cover"
          source={cat.iconUrl ? { uri: cat.iconUrl } : getDefaultPetTypeIcon(cat.petType)}
          style={styles.icon}
        />
      ) : null}
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
        {selected ? `✓ ${label}` : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
  },
  label: {
    color: colors.subText,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    paddingRight: 20,
  },
  chip: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipPressed: {
    opacity: 0.78,
  },
  icon: {
    backgroundColor: colors.card,
    borderRadius: 16,
    height: 32,
    width: 32,
  },
  chipText: {
    color: colors.text,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: colors.card,
  },
});
