/**
 * Scrapes all Prabhupada recording categories beyond BG/SB.
 * Covers: Caitanya-caritamrta, Nectar of Devotion, Festival, General,
 *         Arrival/Departure, Conversations, Morning Walks
 * Run: node scripts/scrape-extra.js
 * Output: data/extra-recordings.json
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const agent = new https.Agent({ rejectUnauthorized: false });
const BASE_API = 'https://vanisource.org/w/api.php';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      agent,
      headers: { 'User-Agent': 'PrabhupadaVaniApp/1.0 (educational research)' },
    }, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
    }).on('error', reject);
  });
}

async function getCategoryMembers(category, cmtype = 'page') {
  const members = [];
  let cont = '';
  do {
    const url = `${BASE_API}?action=query&list=categorymembers` +
      `&cmtitle=${encodeURIComponent('Category:' + category)}` +
      `&cmlimit=500&cmtype=${cmtype}&format=json${cont}`;
    const data = await fetchJson(url);
    if (!data?.query) break;
    members.push(...(data.query.categorymembers || []));
    cont = data.continue ? `&cmcontinue=${encodeURIComponent(data.continue.cmcontinue)}` : '';
    await new Promise(r => setTimeout(r, 150));
  } while (cont);
  return members;
}

// Recursively collect all pages from a category tree (up to 3 levels deep)
async function getAllPagesRecursive(category, depth = 0) {
  const direct = await getCategoryMembers(category, 'page');
  const subcats = await getCategoryMembers(category, 'subcat');

  const all = [...direct];
  for (const sub of subcats) {
    const subcatName = sub.title.replace(/^Category:/, '');
    if (depth === 0) process.stdout.write(`  ↳ ${subcatName}\n`);
    if (depth < 3) {
      const subPages = await getAllPagesRecursive(subcatName, depth + 1);
      all.push(...subPages);
    }
    await new Promise(r => setTimeout(r, 100));
  }
  return all;
}

// Enumerate all categories matching a prefix and collect their pages
async function getAllPagesByPrefix(prefix) {
  const cats = [];
  let cont = '';
  do {
    const url = `${BASE_API}?action=query&list=allcategories` +
      `&acprefix=${encodeURIComponent(prefix)}&aclimit=500&format=json${cont}`;
    const data = await fetchJson(url);
    cats.push(...(data?.query?.allcategories || []).map(c => c['*']));
    cont = data?.continue ? `&accontinue=${encodeURIComponent(data.continue.accontinue)}` : '';
    await new Promise(r => setTimeout(r, 100));
  } while (cont);

  const allPages = [];
  for (const cat of cats) {
    process.stdout.write(`  ↳ ${cat}\n`);
    const pages = await getCategoryMembers(cat, 'page');
    allPages.push(...pages);
    await new Promise(r => setTimeout(r, 120));
  }
  return allPages;
}

function parseDate(dateCode) {
  const yy = parseInt(dateCode.substring(0, 2));
  const mm = parseInt(dateCode.substring(2, 4));
  const dd = parseInt(dateCode.substring(4, 6));
  const year = yy + (yy > 30 ? 1900 : 2000);
  return { year, dateStr: `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` };
}

function parseMember(member, type) {
  const title = member.title;
  const dateMatch = title.match(/^(\d{6})/);
  if (!dateMatch) return null;

  const { year, dateStr } = parseDate(dateMatch[1]);
  const location = title.split(' - ').pop().trim();

  let folder, displayTitle;

  if (type === 'CC') {
    const m = title.match(/CC\s+(Adi|Madhya|Antya)\s+([\d.,]+(?:-[\d.,]+)?)/i);
    if (m) {
      const lila = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase();
      displayTitle = `CC ${lila} ${m[2]}`;
      folder = `Caitanya-caritamrta/${lila}-lila`;
    } else {
      displayTitle = 'CC Lecture';
      folder = 'Caitanya-caritamrta/Other';
    }
  } else if (type === 'NOD') {
    const m = title.match(/NOD\s+(.+?)\s*-\s*[^-]+$/);
    const chap = m ? m[1].trim() : '';
    displayTitle = `NOD ${chap}`;
    folder = 'Nectar-of-Devotion';
  } else if (type === 'Festival') {
    const m = title.match(/Festival\s+(.+?)\s*-\s*[^-]+$/);
    const event = m ? m[1].trim() : '';
    displayTitle = `Festival - ${event}`;
    folder = 'Festival-Lectures';
  } else if (type === 'General') {
    displayTitle = 'General Lecture';
    folder = 'General-Lectures';
  } else if (type === 'Arrival') {
    displayTitle = /arrival/i.test(title) ? 'Arrival Address' : 'Departure Address';
    folder = 'Arrival-Departure-Talks';
  } else if (type === 'Initiation') {
    displayTitle = 'Initiation Lecture';
    folder = 'Initiation-Lectures';
  } else if (type === 'Isopanisad') {
    const m = title.match(/ISO\s+([\d.]+)/i) || title.match(/Isopanisad\s+([\d.]+)/i) || title.match(/Mantra\s+(\d+)/i);
    const verse = m ? m[1].trim() : '';
    displayTitle = `ISO${verse ? ' ' + verse : ''}`;
    folder = 'Sri-Isopanisad';
  } else if (type === 'BrahmaSamhita') {
    const m = title.match(/BS\s+([\d.]+)/i) || title.match(/Brahma[- ]samhita\s+([\d.]+)/i) || title.match(/(\d+\.\d+)/);
    const verse = m ? m[1].trim() : '';
    displayTitle = `BS${verse ? ' ' + verse : ''}`;
    folder = 'Sri-Brahma-Samhita';
  } else if (type === 'Conversation') {
    // "730101 - Room Conversation - Bombay" → "Room Conversation"
    const segments = title.split(' - ');
    displayTitle = segments.length >= 3 ? segments.slice(1, -1).join(' - ') : 'Conversation';
    folder = `Conversations/${year}`;
  } else if (type === 'MorningWalk') {
    const segments = title.split(' - ');
    displayTitle = segments.length >= 3 ? segments.slice(1, -1).join(' - ') : 'Morning Walk';
    folder = `Morning-Walks/${year}`;
  } else {
    return null;
  }

  return {
    id: member.pageid.toString(),
    title: displayTitle,
    fullTitle: title,
    type,
    date: dateStr,
    year,
    location,
    folder,
    vanisourceUrl: `https://vanisource.org/wiki/${encodeURIComponent(title).replace(/%20/g, '_')}`,
  };
}

const CATEGORIES = [
  { cat: 'Lectures - Caitanya-caritamrta', type: 'CC',           method: 'recursive' },
  { cat: 'Lectures - Nectar of Devotion',  type: 'NOD',          method: 'direct'    },
  { cat: 'Lectures - Festival',            type: 'Festival',     method: 'direct'    },
  { cat: 'Lectures - General',             type: 'General',      method: 'direct'    },
  { cat: 'Arrival and Departure Talks',    type: 'Arrival',      method: 'direct'    },
  { cat: 'Lectures - Initiations',         type: 'Initiation',   method: 'recursive' },
  { cat: 'Lectures - Isopanisad',          type: 'Isopanisad',   method: 'recursive' },
  { cat: 'Lectures - Brahma-samhita',      type: 'BrahmaSamhita',method: 'recursive' },
  { cat: 'Conversations -',               type: 'Conversation', method: 'prefix'    },
  { cat: 'Morning Walks -',               type: 'MorningWalk',  method: 'prefix'    },
];

async function main() {
  const outputPath = path.join(__dirname, '..', 'data', 'extra-recordings.json');
  const all = [];

  for (const { cat, type, method } of CATEGORIES) {
    console.log(`\nFetching [${type}]: ${cat}`);
    let members;
    if (method === 'prefix') {
      members = await getAllPagesByPrefix(cat);
    } else if (method === 'recursive') {
      members = await getAllPagesRecursive(cat);
    } else {
      members = await getCategoryMembers(cat, 'page');
    }
    // Deduplicate by pageid
    const seen = new Set();
    members = members.filter(m => { if (seen.has(m.pageid)) return false; seen.add(m.pageid); return true; });
    console.log(`  ${members.length} pages found`);
    const parsed = members.map(m => parseMember(m, type)).filter(Boolean);
    console.log(`  ${parsed.length} parsed successfully`);
    all.push(...parsed);
  }

  all.sort((a, b) => a.date.localeCompare(b.date));

  const stats = {};
  all.forEach(r => { stats[r.type] = (stats[r.type] || 0) + 1; });

  console.log('\n═══ Summary ═══');
  Object.entries(stats).forEach(([t, n]) => console.log(`  ${t}: ${n}`));
  console.log(`  TOTAL: ${all.length}`);

  fs.writeFileSync(outputPath, JSON.stringify(all, null, 2));
  console.log(`\nSaved to ${outputPath}`);
}

main().catch(console.error);
