export type CatGender = 'male' | 'female' | 'unknown';

/**
 * Supported companion-animal groups. `Cat` remains the persisted type name for
 * backwards compatibility with existing local and household-sync data.
 */
export type PetType =
  | 'cat'
  | 'dog'
  | 'rabbit'
  | 'small_mammal'
  | 'bird'
  | 'aquarium_fish'
  | 'reptile_amphibian'
  | 'insect';

export const petTypeLabels: Record<PetType, string> = {
  cat: '猫',
  dog: '犬',
  rabbit: 'うさぎ',
  small_mammal: '小動物',
  bird: '鳥',
  aquarium_fish: '観賞魚',
  reptile_amphibian: '爬虫類・両生類',
  insect: '昆虫',
};

export const petTypes = (Object.keys(petTypeLabels) as PetType[]).map((value) => ({
  value,
  label: petTypeLabels[value],
}));

export type Cat = {
  id: string;
  name: string;
  /** Omitted by profiles saved before multi-pet support; treat those as cats. */
  petType?: PetType;
  iconUrl?: string;
  birthday?: string;
  age?: number;
  weight?: number;
  gender: CatGender;
  memo?: string;
  createdAt: string;
  updatedAt: string;
};
