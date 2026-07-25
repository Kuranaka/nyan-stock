import type { ImageSourcePropType } from 'react-native';

import aquariumFishIcon from '@/assets/pet-type-icons/aquarium_fish.png';
import birdIcon from '@/assets/pet-type-icons/bird.png';
import catIcon from '@/assets/pet-type-icons/cat.png';
import dogIcon from '@/assets/pet-type-icons/dog.png';
import insectIcon from '@/assets/pet-type-icons/insect.png';
import rabbitIcon from '@/assets/pet-type-icons/rabbit.png';
import reptileAmphibianIcon from '@/assets/pet-type-icons/reptile_amphibian.png';
import smallMammalIcon from '@/assets/pet-type-icons/small_mammal.png';

import type { PetType } from './catTypes';

const defaultPetTypeIcons = {
  cat: catIcon,
  dog: dogIcon,
  rabbit: rabbitIcon,
  small_mammal: smallMammalIcon,
  bird: birdIcon,
  aquarium_fish: aquariumFishIcon,
  reptile_amphibian: reptileAmphibianIcon,
  insect: insectIcon,
} satisfies Record<PetType, ImageSourcePropType>;

export function getDefaultPetTypeIcon(petType?: PetType): ImageSourcePropType {
  return defaultPetTypeIcons[petType ?? 'cat'];
}
