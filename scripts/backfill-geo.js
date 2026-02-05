#!/usr/bin/env node
// Backfill geolocation for records with Unknown location

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://minim4@localhost:5432/email_tracker?sslmode=disable'
});

const GEO_API_URL = 'http://ip-api.com/json';

const isSecurityScanner = (ip) => {
  return ip && (
    ip.startsWith('44.') || ip.startsWith('54.') || ip.startsWith('52.') ||
    ip.startsWith('34.') || ip.startsWith('35.') || ip.startsWith('13.') ||
    ip.startsWith('18.') || ip.startsWith('3.') ||
    ip.startsWith('146.75.') || ip.startsWith('151.101.')
  );
};

const isGoogleProxy = (ip) => {
  return ip && (ip.startsWith('74.125.') || ip.startsWith('66.249.') || ip.startsWith('209.85.'));
};

const fetchGeo = async (ip) => {
  try {
    const url = `${GEO_API_URL}/${ip}?fields=status,country,countryCode,regionName,city,lat,lon,timezone,isp,org,mobile,proxy,hosting`;
    const response = await fetch(url);
    const geo = await response.json();
    if (geo.status === 'success') {
      return {
        city: geo.city || 'Unknown',
        region: geo.regionName || 'Unknown',
        country: geo.country || 'Unknown',
        countryCode: geo.countryCode || '',
        isp: geo.isp || 'Unknown',
        org: geo.org || '',
        timezone: geo.timezone || '',
        lat: geo.lat || null,
        lon: geo.lon || null,
        mobile: geo.mobile || false,
        proxy: geo.proxy || false,
        hosting: geo.hosting || false
      };
    }
  } catch (err) {
    console.error(`Error fetching geo for ${ip}:`, err.message);
  }
  return null;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function backfill() {
  console.log('Starting geolocation backfill...\n');

  // Get distinct IPs with Unknown location from both tables
  const downloads = await pool.query(`
    SELECT DISTINCT ip FROM attachment_downloads
    WHERE city = 'Unknown' AND ip != '::1'
  `);

  const opens = await pool.query(`
    SELECT DISTINCT ip FROM email_opens
    WHERE city = 'Unknown' AND ip != '::1' AND ip != 'Unknown'
  `);

  const allIPs = new Set([
    ...downloads.rows.map(r => r.ip),
    ...opens.rows.map(r => r.ip)
  ]);

  console.log(`Found ${allIPs.size} unique IPs to backfill\n`);

  for (const ip of allIPs) {
    console.log(`Processing ${ip}...`);

    let location;

    if (isSecurityScanner(ip)) {
      location = {
        city: 'Security Scanner',
        region: 'Unknown',
        country: 'Cloud Server',
        countryCode: '',
        isp: 'Email Security',
        org: '',
        timezone: '',
        lat: null,
        lon: null,
        mobile: false,
        proxy: true,
        hosting: true
      };
      console.log(`  -> Security Scanner (AWS/Cloud)`);
    } else if (isGoogleProxy(ip)) {
      location = {
        city: 'Gmail Proxy',
        region: 'Unknown',
        country: 'Google Servers',
        countryCode: '',
        isp: 'Google LLC',
        org: '',
        timezone: '',
        lat: null,
        lon: null,
        mobile: false,
        proxy: true,
        hosting: true
      };
      console.log(`  -> Gmail Proxy`);
    } else {
      location = await fetchGeo(ip);
      if (location) {
        console.log(`  -> ${location.city}, ${location.region}, ${location.country} (${location.isp})`);
      } else {
        console.log(`  -> Failed to fetch geo`);
        continue;
      }
      // Rate limit for ip-api.com (45 requests/minute for free tier)
      await sleep(1500);
    }

    // Update attachment_downloads
    await pool.query(`
      UPDATE attachment_downloads SET
        city = $1, region = $2, country = $3, country_code = $4,
        isp = $5, org = $6, timezone = $7, lat = $8, lon = $9,
        is_mobile = $10, is_proxy = $11, is_hosting = $12
      WHERE ip = $13 AND city = 'Unknown'
    `, [
      location.city, location.region, location.country, location.countryCode,
      location.isp, location.org, location.timezone, location.lat, location.lon,
      location.mobile, location.proxy, location.hosting, ip
    ]);

    // Update email_opens
    await pool.query(`
      UPDATE email_opens SET
        city = $1, region = $2, country = $3, country_code = $4,
        isp = $5, org = $6, timezone = $7, lat = $8, lon = $9,
        is_mobile = $10, is_proxy = $11, is_hosting = $12
      WHERE ip = $13 AND city = 'Unknown'
    `, [
      location.city, location.region, location.country, location.countryCode,
      location.isp, location.org, location.timezone, location.lat, location.lon,
      location.mobile, location.proxy, location.hosting, ip
    ]);
  }

  console.log('\nBackfill complete!');
  await pool.end();
}

backfill().catch(err => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
