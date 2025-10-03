## Animated NFT Generator (Node.js + TypeScript)

Fast, configurable animated NFT generator with weighted traits, direct per-frame compositing, and GIF/MP4 assembly via FFmpeg. Includes rarity analysis and dual metadata output (both Ethereum ERC-721 and Solana Metaplex formats).

### Requirements
- Node.js 18+ and npm
- FFmpeg installed and available on PATH
  - Windows (winget): `winget install Gyan.FFmpeg`
  - macOS (brew): `brew install ffmpeg`
  - Linux (apt): `sudo apt-get install ffmpeg`

Optional (auto-detected): GPU acceleration via FFmpeg `-hwaccel auto` if available

### Install
```bash
npm install
npm run build
```

### Project Structure (high-level)
- `config/generator_config.json` – main configuration (see below)
- `layers/` – your weighted trait folders and frame PNGs
- `output/` – generated metadata, frames, animations, and stats
- `src/` – TypeScript source

### Layers Folder Rules (summary)
- First depth = trait types; lowest folders contain PNG frames only
- Weighting is in folder names: `Name#<weight>` (e.g., `Pirate Coat#20`)
- At any folder level: parse weights from immediate child folder names and pick one
- A folder must not mix subfolders and files (error)
- Leaf-level only contains images; above levels contain folders only
- Single-frame leaf is allowed; it will loop to required frame count

### Key Features
- **Dual Metadata Output**: Generates both Ethereum (ERC-721) and Solana (Metaplex) metadata formats automatically
- Weighted trait selection with incompatible traits, forced pairings, dependent traits, exclusive groups, and conditional rarity
- Deterministic uniqueness (seeded) and duplicate prevention
- Direct per-frame compositing (no giant spritesheets)
- Configurable concurrency (`max_concurrent`)
- GIF/MP4 output via FFmpeg (palettegen/paletteuse pipeline for GIF)
- Rarity calculation from generated metadata

### Configuration (config/generator_config.json)
Important fields:
- `generation.total_nfts`: number of NFTs to generate (overridable with `--count`)
- `generation.frames_per_animation`: number of frames per animation
- `generation.dimensions.{width,height}`: canvas size for frames
- `generation.upscaling`: `nearest_neighbour` | `smooth`
- `generation.frame_rate`: frames per second for output
- `generation.output_format`: `gif` | `mp4` (animation format)
- `generation.max_concurrent`: parallelism for generation phases
- `performance.cpu_cores`: `auto` | number (sets Sharp and FFmpeg threads)
- `performance.gpu_acceleration`: `auto` | `gpu` | `cpu`
- `animation.loop_count`: GIF loop count (0 = infinite)
- `animation.optimization`: `low` | `medium` | `high` (PNG compression, MP4 crf/preset)
- `animation.dithering`: boolean (GIF palette dithering)
- `trait_processing_order`: ordered array of trait types
- `incompatible_traits`, `forced_pairings`, `dependent_traits`, `exclusive_groups`, `conditional_rarity`
- `metadata.{name_prefix,description,external_url,image_base_uri,animation_base_uri,background_color}`
- `metadata.solana.{symbol,seller_fee_basis_points,collection,properties}`

### CLI
All commands run from the project root.

Generate full collection (clears output, then metadata → frames → animations):
```bash
npm start generate -- --count 1000
npm start generate
```

Preview trait combinations only:
```bash
npm start preview-traits -- --count 10
```

Validate layer structure only:
```bash
npm start validate-layers
```

Assemble animations only (uses frames in `output/frames`):
```bash
npm start animate
```

Metadata only:
```bash
npm start metadata
```

Rarity analysis (percentages per trait/value):
```bash
npm start calculate-rarity -- --input output/metadata/ethereum
npm start calculate-rarity -- --input output/metadata/solana
```

Clean output directory:
```bash
npm start clean-output
npm start clean-output -- --keep-metadata
```

### Output
- `output/metadata/ethereum/` – per-NFT JSON (Ethereum ERC-721 schema)
- `output/metadata/solana/` – per-NFT JSON (Solana Metaplex schema)
- `output/frames/<id>/frame_XXX.png` – composited frames
- `output/animations/<id>.(gif|mp4)` – final animation
- `output/stats/rarity.json` – rarity percentages report
- `output/ethereum_collection_metadata.json` – collection metadata (Ethereum)
- `output/solana_collection_metadata.json` – collection metadata (Solana)

### Example Metadata

ETH (ERC-721)
```json
{
  "name": "Balls #1",
  "description": "Balls 3: The Difficult Third Ball",
  "external_url": "https://example.com",
  "image": "https://example.com/images/1.gif",
  "animation_url": "https://example.com/images/1.gif",
  "attributes": [
    { "trait_type": "Background", "value": "Alpine Road" },
    { "trait_type": "Body", "value": "Terminator" },
    { "trait_type": "Clothes", "value": "Cocky Shorts" }
  ]
}
```

Solana (Metaplex)
```json
{
  "name": "Balls #1",
  "description": "Balls 3: The Difficult Third Ball",
  "image": "https://example.com/images/1.gif",
  "symbol": "NFT",
  "seller_fee_basis_points": 500,
  "attributes": [
    { "trait_type": "Background", "value": "Alpine Road" },
    { "trait_type": "Body", "value": "Terminator" }
  ],
  "collection": { "name": "NFT Collection", "family": "NFT" },
  "properties": {
    "category": "image",
    "files": [{ "uri": "https://example.com/images/1.gif", "type": "image/gif" }],
    "creators": [{ "address": "11111111111111111111111111111111111111111111", "share": 100 }]
  },
  "animation_url": "https://example.com/images/1.gif"
}
```

### Performance Notes
- `generation.max_concurrent` controls parallelism across NFTs
- Pre-warm cache and identical-frame shortcut reduce I/O and recompute
- `performance.cpu_cores` can be set to a number to bound CPU threads
- `animation.optimization` adjusts PNG compression and MP4 quality/preset

### Troubleshooting
- Output not clean: each run clears `output/` unless you pass `--resume` on the command
- FFmpeg not found: ensure ffmpeg is installed and on PATH, then restart shell
- Blank GIFs: confirm frames exist in `output/frames/<id>`, check logs
- Slow generation: lower `max_concurrent`, set `optimization` to `low`, or reduce dimensions

### License
MIT

