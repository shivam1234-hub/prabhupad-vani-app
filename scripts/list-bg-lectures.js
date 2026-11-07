// Prints one JSON line per Bhagavad-gita lecture (recordingId + vanisourceUrl),
// sorted by date, for scripts/batch-align.sh to iterate over.
const lectures = require('../data/lectures.json');

const bg = lectures
  .filter((l) => l.type === 'Bhagavad-gita' && l.hasAudio)
  .sort((a, b) => a.date.localeCompare(b.date));

for (const l of bg) {
  const recordingId = l.pvId || l.id;
  console.log(JSON.stringify({ recordingId, vanisourceUrl: l.vanisourceUrl }));
}
