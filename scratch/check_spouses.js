const fs = require('fs');
const data = JSON.parse(fs.readFileSync('./data/family.json', 'utf8'));

const members = data.members;
for (const id in members) {
  const m = members[id];
  if (m.spouseId && members[m.spouseId]) {
    const s = members[m.spouseId];
    if (m.parentIds && m.parentIds.length > 0 && s.parentIds && s.parentIds.length > 0) {
      if (Number(m.id) < Number(s.id)) {
        console.log(`CROSS-LINK: ${m.name} (${m.id}) and ${s.name} (${s.id}) both have parents!`);
      }
    }
  }
}
console.log('Check complete.');
