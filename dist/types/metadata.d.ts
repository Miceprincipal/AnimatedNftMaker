export interface NFTMetadata {
    name: string;
    description: string;
    image: string;
    animation_url?: string;
    attributes: Attribute[];
    rarity?: RarityInfo;
    generation?: GenerationInfo;
}
export interface Attribute {
    trait_type: string;
    value: string;
    rarity?: number;
}
export interface RarityInfo {
    overall: number;
    rank: number;
    percentile: number;
}
export interface GenerationInfo {
    timestamp: string;
    version: string;
    seed: string;
}
export interface CollectionMetadata {
    name: string;
    description: string;
    image: string;
    external_link: string;
    seller_fee_basis_points: number;
    fee_recipient: string;
    total_supply: number;
    created_at: string;
    traits: TraitStats[];
}
export interface TraitStats {
    trait_type: string;
    values: {
        value: string;
        count: number;
        rarity: number;
    }[];
}
export interface GenerationStats {
    total_generated: number;
    duplicates_found: number;
    generation_time: number;
    average_time_per_nft: number;
    performance_mode: string;
    errors: number;
    warnings: number;
}
//# sourceMappingURL=metadata.d.ts.map