/**
 * Scraper for Prabhupada lectures using vanisource.org MediaWiki API.
 * Run: node scripts/scrape.js
 * Output: data/lectures.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const agent = new https.Agent({ rejectUnauthorized: false });
const BASE_API = 'https://vanisource.org/w/api.php';

function fetch(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      agent,
      headers: { 'User-Agent': 'PrabhupadaVaniApp/1.0 (educational research)' },
    }, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on('error', reject);
  });
}

async function getAllCategoryMembers(category) {
  const members = [];
  let continueParam = '';

  do {
    const url = `${BASE_API}?action=query&list=categorymembers` +
      `&cmtitle=${encodeURIComponent('Category:' + category)}` +
      `&cmlimit=500&format=json${continueParam}`;

    const data = await fetch(url);
    if (!data || !data.query) break;

    members.push(...(data.query.categorymembers || []));
    console.log(`  Fetched ${members.length} so far...`);

    continueParam = data.continue
      ? `&cmcontinue=${encodeURIComponent(data.continue.cmcontinue)}`
      : '';

    await new Promise(r => setTimeout(r, 200));
  } while (continueParam);

  return members;
}

function parseMember(member) {
  // Title format: "660219 - Lecture BG 02.07-11 - New York"
  //               "730707 - Lecture SB 01.01.01 - London"
  //               "690101 - Lecture BG Introduction - Boston"
  const title = member.title;

  const match = title.match(
    /^(\d{6})\s*-\s*Lecture\s+(BG|SB)\s+([\d.,-]+|Introduction|Preface|[^\-]+?)\s*-\s*(.+)$/i
  );
  if (!match) return null;

  const dateCode = match[1];
  const typeCode = match[2].toUpperCase();
  const chapter = match[3].trim();
  const location = match[4].trim();

  // Parse date: YYMMDD
  const yy = parseInt(dateCode.substring(0, 2));
  const mm = parseInt(dateCode.substring(2, 4));
  const dd = parseInt(dateCode.substring(4, 6));
  const year = yy + (yy > 30 ? 1900 : 2000);
  const dateStr = `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;

  const type = typeCode === 'BG' ? 'Bhagavad-gita' : 'Srimad-Bhagavatam';

  // Build title label
  const typeLabel = typeCode === 'BG' ? 'BG' : 'SB';
  const displayTitle = `${typeLabel} ${chapter}`;

  // Map location to prabhupadavani.org location code
  const locationCode = locationToCode(location);

  // Construct prabhupadavani.org URL
  const pvId = `${dateCode}${typeCode.toLowerCase()}${locationCode}`;
  const pvUrl = `https://prabhupadavani.org/transcriptions/${pvId}/`;

  // Vanisource URL (for transcription reading)
  const vanisourceUrl = `https://vanisource.org/wiki/${encodeURIComponent(title).replace(/%20/g, '_')}`;

  return {
    id: member.pageid.toString(),
    pvId,
    title: displayTitle,
    fullTitle: title,
    type,
    chapter,
    date: dateStr,
    year,
    location,
    locationCode,
    hasAudio: true, // most have audio on prabhupadavani.org
    url: pvUrl,
    vanisourceUrl,
  };
}

function locationToCode(location) {
  const map = {
    'New York': 'nyc', 'London': 'lon', 'Los Angeles': 'la', 'Bombay': 'bom',
    'Mumbai': 'bom', 'Vrindavan': 'vrn', 'Vrindavana': 'vrn', 'Vrndavana': 'vrn',
    'Delhi': 'del', 'New Delhi': 'del', 'Calcutta': 'cal', 'Kolkata': 'cal',
    'Melbourne': 'mel', 'Sydney': 'syd', 'Paris': 'par', 'Hamburg': 'ham',
    'Frankfurt': 'fra', 'Toronto': 'tor', 'Vancouver': 'van', 'Chicago': 'chi',
    'Atlanta': 'atl', 'San Francisco': 'sf', 'Houston': 'hou',
    'New Vrindaban': 'nv', 'Moscow': 'msq', 'Tehran': 'teh', 'Tel Aviv': 'tel',
    'Mysore': 'mys', 'Hyderabad': 'hyd', 'Madras': 'mdr', 'Ahmedabad': 'ahm',
    'Amsterdam': 'ams', 'Geneva': 'gen', 'Rome': 'rom', 'Mexico City': 'mex',
    'Buenos Aires': 'bue', 'Caracas': 'car', 'Bogota': 'bog', 'Lima': 'lim',
    'Johannesburg': 'jhb', 'Nairobi': 'nbi', 'Mayapur': 'may', 'Mayapura': 'may',
    'Honolulu': 'haw', 'Hawaii': 'haw', 'Boston': 'bos', 'Detroit': 'det',
    'Philadelphia': 'phi', 'Washington': 'was', 'Seattle': 'sea', 'Denver': 'den',
    'Dallas': 'dal', 'Miami': 'mia', 'Montreal': 'mon', 'Zurich': 'zur',
    'Stockholm': 'sto', 'Copenhagen': 'cop', 'Durban': 'dur', 'Nairobi': 'nbi',
    'Mauritius': 'mau', 'Auckland': 'auk', 'Tokyo': 'tok', 'Osaka': 'osa',
    'Kuala Lumpur': 'kl', 'Singapore': 'sin', 'Manila': 'man', 'Taipei': 'tai',
    'Hong Kong': 'hkg', 'Perth': 'per', 'Gainesville': 'gnv', 'Berkeley': 'ber',
    'Chapel Hill': 'chp', 'Bhuvanesvara': 'bhu', 'Bhubaneswar': 'bhu',
    'Surat': 'sur', 'Baroda': 'bar', 'Chandigarh': 'chd', 'Allahabad': 'all',
    'Gorakhpur': 'gor', 'Jaipur': 'jai', 'Tirupati': 'tir', 'Nellore': 'nel',
    'Vrindaban': 'vrn',
  };
  return map[location] || location.toLowerCase().replace(/[^a-z]/g, '').substring(0, 4);
}

async function main() {
  const outputPath = path.join(__dirname, '..', 'data', 'lectures.json');

  console.log('Fetching Bhagavad-gita lectures from vanisource.org...');
  const bgMembers = await getAllCategoryMembers('Lectures - Bhagavad-gita As It Is');
  console.log(`Got ${bgMembers.length} BG lecture entries`);

  console.log('\nFetching Srimad-Bhagavatam lectures from vanisource.org...');
  const sbMembers = await getAllCategoryMembers('Lectures - Srimad-Bhagavatam');
  console.log(`Got ${sbMembers.length} SB lecture entries`);

  const allMembers = [...bgMembers, ...sbMembers];
  const lectures = allMembers.map(parseMember).filter(Boolean);

  // Sort by date, then chapter
  lectures.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.chapter.localeCompare(b.chapter);
  });

  const stats = {
    total: lectures.length,
    bg: lectures.filter(l => l.type === 'Bhagavad-gita').length,
    sb: lectures.filter(l => l.type === 'Srimad-Bhagavatam').length,
    skipped: allMembers.length - lectures.length,
  };
  console.log(`\nParsed: ${stats.bg} BG + ${stats.sb} SB = ${stats.total} lectures (${stats.skipped} skipped)`);

  fs.writeFileSync(outputPath, JSON.stringify(lectures, null, 2));
  console.log(`Saved to ${outputPath}`);
}

main().catch(console.error);
