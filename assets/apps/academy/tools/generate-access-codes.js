
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const count = parseInt(process.env.CODE_COUNT || process.argv[2] || '5', 10);
const prefix = (process.env.CODE_PREFIX || process.argv[3] || 'AMY').toUpperCase();
const expiresAt = process.env.EXPIRES_AT || process.argv[4] || null;
const file = path.join(process.cwd(), 'data', 'access-codes.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const salt = data.salt || 'amy-academy-public-salt-v1';
function randCode(){
  const a = crypto.randomBytes(4).toString('hex').toUpperCase();
  const b = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${a}-${b}`;
}
const generated=[];
for(let i=0;i<count;i++){
  const code = randCode();
  const hash = crypto.createHash('sha256').update(code + salt).digest('hex');
  data.codes.push({label:`Generated ${new Date().toISOString()}`, hash, active:true, createdAt:new Date().toISOString(), expiresAt:expiresAt || null});
  generated.push(code);
}
data.updatedAt = new Date().toISOString();
fs.writeFileSync(file, JSON.stringify(data,null,2));
fs.writeFileSync('generated-access-codes.txt', generated.join('\n')+'\n');
console.log('Generated codes:');
console.log(generated.join('\n'));
console.log('Plain codes are saved to generated-access-codes.txt artifact. Only hashes are committed.');
