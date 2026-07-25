import { PetGroup, PetGroupSeed, PetSpeciesGroupSeed, PetSpeciesSeed } from './types.js';

export const petGroupSeeds: PetGroupSeed[] = [
  { code: 'cat', nameJa: '猫', nameEn: 'Cat', sortOrder: 10 },
  { code: 'dog', nameJa: '犬', nameEn: 'Dog', sortOrder: 20 },
  { code: 'rabbit', nameJa: 'うさぎ', nameEn: 'Rabbit', sortOrder: 30 },
  { code: 'small_animal', nameJa: '小動物', nameEn: 'Small Animal', sortOrder: 40 },
  { code: 'bird', nameJa: '鳥', nameEn: 'Bird', sortOrder: 50 },
  { code: 'aquarium', nameJa: '観賞魚', nameEn: 'Aquarium', sortOrder: 60 },
  { code: 'reptile_amphibian', nameJa: '爬虫類・両生類', nameEn: 'Reptile and Amphibian', sortOrder: 70 },
  { code: 'insect', nameJa: '昆虫', nameEn: 'Insect', sortOrder: 80 },
];

export const petSpeciesSeeds: PetSpeciesSeed[] = [
  species('cat', 'cat', '猫', 'Cat', 10),
  species('dog', 'dog', '犬', 'Dog', 10),
  species('rabbit', 'rabbit', 'うさぎ', 'Rabbit', 10),
  species('small_animal', 'hamster', 'ハムスター', 'Hamster', 10),
  species('small_animal', 'syrian_hamster', 'ゴールデンハムスター', 'Syrian Hamster', 11, 'hamster'),
  species('small_animal', 'dwarf_hamster', 'ドワーフハムスター', 'Dwarf Hamster', 12, 'hamster'),
  species('small_animal', 'roborovski_hamster', 'ロボロフスキーハムスター', 'Roborovski Hamster', 13, 'hamster'),
  species('small_animal', 'chinese_hamster', 'チャイニーズハムスター', 'Chinese Hamster', 14, 'hamster'),
  species('small_animal', 'other_hamster', 'その他のハムスター', 'Other Hamster', 15, 'hamster'),
  species('small_animal', 'gerbil', 'スナネズミ', 'Gerbil', 20),
  species('small_animal', 'guinea_pig', 'モルモット', 'Guinea Pig', 30),
  species('small_animal', 'chinchilla', 'チンチラ', 'Chinchilla', 40),
  species('small_animal', 'degu', 'デグー', 'Degu', 50),
  species('small_animal', 'ferret', 'フェレット', 'Ferret', 60),
  species('small_animal', 'hedgehog', 'ハリネズミ', 'Hedgehog', 70),
  species('small_animal', 'sugar_glider', 'フクロモモンガ', 'Sugar Glider', 80),
  species('small_animal', 'squirrel', 'リス', 'Squirrel', 90),
  species('small_animal', 'prairie_dog', 'プレーリードッグ', 'Prairie Dog', 100),
  species('small_animal', 'other_small_animal', 'その他の小動物', 'Other Small Animal', 110),
  species('bird', 'budgerigar', 'セキセイインコ', 'Budgerigar', 10),
  species('bird', 'cockatiel', 'オカメインコ', 'Cockatiel', 20),
  species('bird', 'lovebird', 'ラブバード', 'Lovebird', 30),
  species('bird', 'parrot', 'オウム', 'Parrot', 40),
  species('bird', 'parakeet', 'インコ', 'Parakeet', 50),
  species('bird', 'java_sparrow', '文鳥', 'Java Sparrow', 60),
  species('bird', 'finch', 'フィンチ', 'Finch', 70),
  species('bird', 'canary', 'カナリア', 'Canary', 80),
  species('bird', 'chicken', '鶏', 'Chicken', 90),
  species('bird', 'quail', 'うずら', 'Quail', 100),
  species('bird', 'other_bird', 'その他の鳥', 'Other Bird', 110),
  species('aquarium', 'goldfish', '金魚', 'Goldfish', 10),
  species('aquarium', 'medaka', 'メダカ', 'Medaka', 20),
  species('aquarium', 'betta', 'ベタ', 'Betta', 30),
  species('aquarium', 'tropical_fish', '熱帯魚', 'Tropical Fish', 40),
  species('aquarium', 'marine_fish', '海水魚', 'Marine Fish', 50),
  species('aquarium', 'freshwater_fish', '淡水魚', 'Freshwater Fish', 60),
  species('aquarium', 'shrimp', '観賞エビ', 'Aquarium Shrimp', 70),
  species('aquarium', 'crayfish', 'ザリガニ', 'Crayfish', 80),
  species('aquarium', 'aquatic_turtle', '水棲ガメ', 'Aquatic Turtle', 90),
  species('aquarium', 'aquatic_plant', '水草', 'Aquatic Plant', 100),
  species('aquarium', 'other_aquarium', 'その他の観賞魚', 'Other Aquarium', 110),
  species('reptile_amphibian', 'aquatic_turtle', '水棲ガメ', 'Aquatic Turtle', 10),
  species('reptile_amphibian', 'tortoise', 'リクガメ', 'Tortoise', 20),
  species('reptile_amphibian', 'lizard', 'トカゲ', 'Lizard', 30),
  species('reptile_amphibian', 'gecko', 'ヤモリ', 'Gecko', 40),
  species('reptile_amphibian', 'snake', 'ヘビ', 'Snake', 50),
  species('reptile_amphibian', 'frog', 'カエル', 'Frog', 60),
  species('reptile_amphibian', 'newt', 'イモリ', 'Newt', 70),
  species('reptile_amphibian', 'salamander', 'サンショウウオ', 'Salamander', 80),
  species('reptile_amphibian', 'axolotl', 'ウーパールーパー', 'Axolotl', 90),
  species('reptile_amphibian', 'other_reptile', 'その他の爬虫類', 'Other Reptile', 100),
  species('reptile_amphibian', 'other_amphibian', 'その他の両生類', 'Other Amphibian', 110),
  species('insect', 'rhinoceros_beetle', 'カブトムシ', 'Rhinoceros Beetle', 10),
  species('insect', 'stag_beetle', 'クワガタ', 'Stag Beetle', 20),
  species('insect', 'cricket', 'コオロギ', 'Cricket', 30),
  species('insect', 'bell_cricket', 'スズムシ', 'Bell Cricket', 40),
  species('insect', 'mantis', 'カマキリ', 'Mantis', 50),
  species('insect', 'butterfly', 'チョウ', 'Butterfly', 60),
  species('insect', 'moth', 'ガ', 'Moth', 70),
  species('insect', 'ant', 'アリ', 'Ant', 80),
  species('insect', 'beetle', '甲虫', 'Beetle', 90),
  species('insect', 'other_insect', 'その他の昆虫', 'Other Insect', 100),
];

export const petSpeciesGroupSeeds: PetSpeciesGroupSeed[] = [
  group('small_bird', 'bird', '小鳥', 'Small Bird', 10),
  group('medium_parrot', 'bird', '中型インコ', 'Medium Parrot', 20),
  group('large_parrot', 'bird', '大型インコ', 'Large Parrot', 30),
];

export const speciesToPetGroups = new Map<string, PetGroup[]>(
  petSpeciesSeeds.reduce<Array<[string, PetGroup[]]>>((entries, item) => {
    const existing = entries.find(([code]) => code === item.code);
    if (existing) existing[1].push(item.petGroup);
    else entries.push([item.code, [item.petGroup]]);
    return entries;
  }, []),
);

function species(
  petGroup: PetGroup,
  code: string,
  nameJa: string,
  nameEn: string,
  sortOrder: number,
  parentSpeciesCode?: string,
): PetSpeciesSeed {
  return { code, petGroup, parentSpeciesCode, nameJa, nameEn, sortOrder, enabled: true };
}

function group(
  code: string,
  petGroup: PetGroup,
  nameJa: string,
  nameEn: string,
  sortOrder: number,
): PetSpeciesGroupSeed {
  return { code, petGroup, nameJa, nameEn, sortOrder, enabled: true };
}

