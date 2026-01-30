#!/usr/bin/env node

/**
 * Script to generate PWA icons from SVG source
 * Requires: sharp (npm install --save-dev sharp)
 */

const fs = require('fs');
const path = require('path');

// Icon sizes for PWA
const iconSizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function generateIcons() {
  try {
    // Check if sharp is available
    let sharp;
    try {
      sharp = require('sharp');
    } catch (e) {
      console.error('Error: sharp package is required. Install it with: npm install --save-dev sharp');
      process.exit(1);
    }

    const svgPath = path.join(__dirname, '../public/icons/icon.svg');
    const outputDir = path.join(__dirname, '../public/icons');

    // Ensure output directory exists
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Check if SVG exists
    if (!fs.existsSync(svgPath)) {
      console.error(`Error: SVG file not found at ${svgPath}`);
      process.exit(1);
    }

    console.log('Generating PWA icons...');

    // Read SVG
    const svgBuffer = fs.readFileSync(svgPath);

    // Generate icons for each size
    for (const size of iconSizes) {
      const outputPath = path.join(outputDir, `icon-${size}x${size}.png`);
      
      await sharp(svgBuffer)
        .resize(size, size)
        .png()
        .toFile(outputPath);
      
      console.log(`✓ Generated icon-${size}x${size}.png`);
    }

    console.log('\n✅ All icons generated successfully!');
  } catch (error) {
    console.error('Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
