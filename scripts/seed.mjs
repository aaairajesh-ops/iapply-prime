// Push the master sheet (lib/prime-data.json) into the deployed database.
// Usage:  APP_URL=https://iapply-prime-app.vercel.app CRON_SECRET=... npm run seed
// (Same as the app's POST /api/seed. Commission fields are refreshed; catalogue
//  fields of existing programmes are left to the sync.)
const url = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '') + '/api/seed';
const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${process.env.CRON_SECRET || ''}` } });
console.log(res.status, await res.text());
