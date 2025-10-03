export interface Trait {
  type: string;
  name: string;
  weight: number;
  path: string;
  frames: string[];
  rarity?: number;
}

export interface TraitCombination {
  id: number;
  traits: Trait[];
  rarity: RarityScore;
  metadata: any;
  generatedAt: Date;
}

export interface RarityScore {
  overall: number;
  traits: number[];
  rank: number;
  percentile: number;
}

export interface TraitHierarchy {
  [traitType: string]: {
    [traitName: string]: {
      weight: number;
      path: string;
      frames: string[];
      subTraits?: TraitHierarchy;
    };
  };
}

export interface LayerStructure {
  isValid: boolean;
  errors: string[];
  hierarchy: TraitHierarchy;
  totalTraits: number;
  totalFrames: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalTraits: number;
    totalFrames: number;
    traitTypes: string[];
  };
}
