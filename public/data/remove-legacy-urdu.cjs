/** Run once, from the project repository root, after copying v7.12 files.
 * Only removes the exact five obsolete per-surah JSON filenames.
 */
const fs = require('node:fs');
const path = require('node:path');
for (let surah = 1; surah <= 5; surah++) {
  const file = path.resolve(process.cwd(), `public/data/islahi-urdu-surah-${surah}.json`);
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`Deleted obsolete Urdu JSON: ${path.relative(process.cwd(), file)}`);
  }
}
