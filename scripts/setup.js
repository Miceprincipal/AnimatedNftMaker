const fs = require('fs-extra');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Setting up Animated NFT Generator...\n');

// Create necessary directories
const dirs = [
  'output',
  'output/metadata',
  'output/spritesheets', 
  'output/frames',
  'output/animations',
  'output/logs',
  'output/stats',
  'output/checkpoints',
  'layers'
];

console.log('📁 Creating directories...');
dirs.forEach(dir => {
  fs.ensureDirSync(dir);
  console.log(`  ✓ ${dir}`);
});

// Create sample layers
console.log('\n🎨 Creating sample layers...');
try {
  execSync('node scripts/create-sample-layers.js', { stdio: 'inherit' });
  console.log('  ✓ Sample layers created');
} catch (error) {
  console.log('  ⚠ Sample layers creation failed (this is optional)');
}

console.log('\n✅ Setup completed successfully!');
console.log('\n📖 Next steps:');
console.log('  1. Add your layer images to the layers/ directory');
console.log('  2. Update config/generator_config.json with your settings');
console.log('  3. Run: npm run validate-layers');
console.log('  4. Run: npm run generate');
console.log('\n🔧 Available commands:');
console.log('  npm run generate          - Generate full NFT collection');
console.log('  npm run validate-layers   - Validate layer structure');
console.log('  npm run preview-traits    - Preview trait combinations');
console.log('  npm run clean-output      - Clean output directory');

