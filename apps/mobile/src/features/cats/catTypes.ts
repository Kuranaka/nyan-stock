export type CatGender = 'male' | 'female' | 'unknown';

export type Cat = {
  id: string;
  name: string;
  birthday?: string;
  age?: number;
  weight?: number;
  gender: CatGender;
  memo?: string;
  createdAt: string;
  updatedAt: string;
};
