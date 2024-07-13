const fs = require('fs');
const mineflayer = require('mineflayer');
const ping = require('./ping.js');
const config = require('./config.json');

function check(ip, port, version) {
  return new Promise((resolve, reject) => {
    let endTimeout = setTimeout(() => resolve(null), 6000);

    const bot = mineflayer.createBot({
      host: ip,
      port,
      version,
      auth: 'microsoft',
      username: config.username,
      password: config.password
    })

    bot.on('login', async () => {
      bot.chat('Hello, this is a server scanner bot created by Cornbread2100. If you don\'t want your server to be joinable by random people, the only way to protect your server is by enabling a whitelist. Just banning this bot will NOT protect your server.');
      bot.chat('If this is intended to be a public server, simply ban this bot and my messages will stop. If you have any questions or concerns, you can contact me on Discord at @cornbread2100 or email me at support@cornbread2100.com');
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
      console.log(`Kicked from ${ip}:${port}`, reason);
      if (reason.includes('You are not whitelisted on this server') || reason.includes('multiplayer.disconnect.not_whitelisted')) resolve(true);
      else resolve(null);
    });
    bot.on('error', (err) => {
      console.log(`Error on ${ip}:${port}`);
      if (err.message.includes('RateLimiter disallowed request') || err.message.includes('Failed to obtain profile data')) resolve('retry');
      else resolve(null);
    });
  });
}

(async () => {
  const versions = await (await fetch('https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/common/protocolVersions.json')).json();
  let start = new Date().getTime();
  const ips = fs.readFileSync(config.ipsPath);
  for (let i = 0; i < ips.length; i += 6) {
    const ip = `${ips[i]}.${ips[i + 1]}.${ips[i + 2]}.${ips[i + 3]}`;
    const port = ips[i + 4] * 256 + ips[i + 5];
    const slp = await ping(ip, port, 0);
    if (typeof slp == 'string' || slp?.version?.protocol == null) continue;
    const version = versions.find(a => a.version == slp.version.protocol);
    if (version == null) continue;
    let result;
    try {
      result = await check(ip, port, version.minecraftVersion);
    } catch (err) {
      console.log(`Bot error on ${ip}:${port}`);
      console.log(err);
      result = null;
    }
    while (result == 'retry') {
      try {
        result = await check(ip, port, version.minecraftVersion);
      } catch (err) {
        console.log(`Error on ${ip}:${port}`);
        console.log(err);
        result = 'retry';
      }
      await new Promise(res => setTimeout(res, 500));
    }
    console.log(`${ip}:${port} ${version.minecraftVersion} ${result == null ? 'unknown' : result}`);
    // await new Promise(res => setTimeout(res, 1000));
  }
})()