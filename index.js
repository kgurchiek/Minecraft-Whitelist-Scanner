const fs = require('fs');
const mineflayer = require('mineflayer');
const ping = require('./ping.js');
const config = require('./config.json');
const mongoClient = new (require('mongodb').MongoClient)(config.mongoURI);
let scannedServers;

function join(username, password, ip, port, version) {
  return new Promise((resolve, reject) => {
    let endTimeout = setTimeout(() => resolve(null), 6000);

    const bot = mineflayer.createBot({
      host: ip,
      port,
      version,
      auth: 'microsoft',
      username: username,
      password: password
    })

    bot.on('login', async () => {
      bot.chat('This is a server scanner bot created by Cornbread2100. If you don\'t want your server to be joinable by random people, the only way to protect your server is by enabling a whitelist. Just banning this bot will NOT protect your server.');
      bot.chat('If this is intended to be a public server, simply ban this bot and my messages will stop.');
      clearTimeout(endTimeout);
      endTimeout = setTimeout(() => {
        bot.end();
        resolve(false);
      }, 3000);
    });
    bot.on('chat', (username, message) => { 
      if (bot.username != username) return;
      clearTimeout(endTimeout);
      bot.end();
      resolve(false);
    })

    // Log errors and kick reasons:
    bot.on('kicked', (reason) => {
      if (typeof reason == 'object') reason = JSON.stringify(reason);
      // console.log(`Kicked from ${ip}:${port}`, reason);
      if (reason.includes('You are not whitelisted on this server') || reason.includes('multiplayer.disconnect.not_whitelisted')) resolve(true);
      else resolve(null);
    });
    bot.on('error', (err) => {
      // console.log(`Error on ${ip}:${port} ${version}`, err);
      if (err.message.includes('RateLimiter disallowed request') || err.message.includes('Failed to obtain profile data')) resolve('retry');
      else resolve(null);
    });
  });
}

lastResult = new Date().getTime();
async function scan() {
  await mongoClient.connect();
  scannedServers = mongoClient.db(config.dbName).collection(config.collectionName);
  let start = new Date().getTime();
  const ips = fs.readFileSync(config.ipsPath);
  const startIndex = Math.floor(Math.random() * ips.length / 6) * 6;
  console.log(`Scanning ${ips.length / 6} servers`);

  const versions = await (await fetch('https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/common/protocolVersions.json')).json();

  async function check(index) {
    const account = config.accounts[(index / 6) % config.accounts.length];
    const ip = `${ips[index]}.${ips[index + 1]}.${ips[index + 2]}.${ips[index + 3]}`;
    const port = ips[index + 4] * 256 + ips[index + 5];
    const slp = await ping(ip, port, 0);
    if (typeof slp == 'string' || slp?.version?.protocol == null) return;
    const version = versions.find(a => a.version == slp.version.protocol);
    if (version == null) return;
    let result;
    try {
      result = await join(account.username, account.password, ip, port, version.minecraftVersion);
    } catch (err) {
      // console.log(`Bot error on ${ip}:${port}`, err);
      result = null;
    }
    while (result == 'retry') {
      try {
        result = await join(account.username, account.password, ip, port, version.minecraftVersion);
      } catch (err) {
        // console.log(`Error on ${ip}:${port} ${slp.version.protocol}`, err);
        result = 'retry';
      }
      await new Promise(res => setTimeout(res, 1000));
    }
    if (result != null) console.log(`${ip}:${port} ${version.minecraftVersion} ${result} ${(new Date().getTime() - lastResult) / 1000}s`);
    lastResult = new Date().getTime();
    const document  = {
      ip,
      port,
      version: slp.version,
      description: slp.description,
      enforcesSecureChat: slp.enforcesSecureChat,
      hasFavicon: slp.favicon != null,
      hasForgeData: slp.forgeData != null,
      lastSeen: Math.floor((new Date()).getTime() / 1000)
    }
    if (result != null) document.whitelist = result;
    scannedServers.updateOne({ ip, port }, { $set: document }, { upsert: true });
    // await new Promise(res => setTimeout(res, 1000));
  }

  for (let i = startIndex; i < ips.length; i += 6) await check(i);
  for (let i = 0; i < startIndex; i += 6) await check(i);

  if (config.repeat) setTimeout(scan, 0);
}

scan();