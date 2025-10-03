const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

// Sample layer structure
const layerStructure = {
  background: {
    'blue(10)': { color: '#4A90E2' },
    'green(10)': { color: '#7ED321' },
    'red(5)': { color: '#D0021B' }
  },
  body: {
    'human(20)': { color: '#F5A623' },
    'robot(10)': { color: '#9013FE' }
  },
  clothing: {
    'casual(15)': { color: '#50E3C2' },
    'formal(10)': { color: '#B8E986' },
    'winter(8)': { color: '#4A90E2' }
  },
  hats: {
    'none(25)': { color: 'transparent' },
    'baseball_cap(15)': { color: '#F5A623' },
    'bowler(10)': { color: '#9013FE' }
  },
  accessories: {
    'none(30)': { color: 'transparent' },
    'glasses(20)': { color: '#7ED321' },
    'sunglasses(15)': { color: '#D0021B' }
  }
};

async function createSampleLayers() {
  const layersDir = path.join(__dirname, '..', 'layers');
  
  console.log('Creating sample layer structure...');
  
  for (const [traitType, traits] of Object.entries(layerStructure)) {
    const traitTypeDir = path.join(layersDir, traitType);
    await fs.ensureDir(traitTypeDir);
    
    console.log(`Creating ${traitType} traits...`);
    
    for (const [traitName, config] of Object.entries(traits)) {
      const traitDir = path.join(traitTypeDir, traitName);
      await fs.ensureDir(traitDir);
      
      console.log(`  Creating ${traitName}...`);
      
      // Create 24 frames for each trait
      for (let i = 1; i <= 24; i++) {
        const framePath = path.join(traitDir, `frame_${String(i).padStart(3, '0')}.png`);
        
        if (config.color === 'transparent') {
          // Create transparent image
          await sharp({
            create: {
              width: 512,
              height: 512,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
          })
          .png()
          .toFile(framePath);
        } else {
          // Create colored circle that moves slightly each frame
          const offsetX = Math.sin((i / 24) * Math.PI * 2) * 20;
          const offsetY = Math.cos((i / 24) * Math.PI * 2) * 20;
          
          await sharp({
            create: {
              width: 512,
              height: 512,
              channels: 4,
              background: { r: 0, g: 0, b: 0, alpha: 0 }
            }
          })
          .composite([{
            input: Buffer.from(`
              <svg width="512" height="512">
                <circle cx="${256 + offsetX}" cy="${256 + offsetY}" r="100" fill="${config.color}" opacity="0.8"/>
              </svg>
            `),
            left: 0,
            top: 0
          }])
          .png()
          .toFile(framePath);
        }
      }
    }
  }
  
  console.log('Sample layer structure created successfully!');
  console.log(`Created ${Object.keys(layerStructure).length} trait types`);
  
  const totalTraits = Object.values(layerStructure).reduce((sum, traits) => sum + Object.keys(traits).length, 0);
  console.log(`Created ${totalTraits} traits with 24 frames each`);
}

// Run if called directly
if (require.main === module) {
  createSampleLayers().catch(console.error);
}

module.exports = { createSampleLayers };

