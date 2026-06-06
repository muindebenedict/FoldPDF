import fs from 'fs';
import path from 'path';

try {
  const source = path.join(process.cwd(), 'public', 'favicon.png');
  const destIco = path.join(process.cwd(), 'public', 'favicon.ico');
  const destApple = path.join(process.cwd(), 'public', 'apple-touch-icon.png');

  if (fs.existsSync(source)) {
    fs.copyFileSync(source, destIco);
    fs.copyFileSync(source, destApple);
    console.log('✓ Successfully synchronized favicon.png to favicon.ico and apple-touch-icon.png!');
  } else {
    console.warn('⚠ Could not find source favicon.png at:', source);
  }
} catch (err) {
  console.error('Failed to copy favicon:', err);
}