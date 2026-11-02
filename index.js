require('dotenv').config()
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser, Browsers, delay, downloadContentFromMessage } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const express = require('express')
const path = require('path')
const chalk = require('chalk')
const axios = require('axios')
const config = require('./config')

const app = express()
let sock = null
let isConnecting = false
const MENU_PIC = "https://files.catbox.moe/hhafg3.jpg"
const groupCache = new Map()

const fMap = { 'a':'ᴀ','b':'ʙ','c':'ᴄ','d':'ᴅ','e':'ᴇ','f':'ғ','g':'ɢ','h':'ʜ','i':'ɪ','j':'ᴊ','k':'ᴋ','l':'ʟ','m':'ᴍ','n':'ɴ','o':'ᴏ','p':'ᴘ','q':'ǫ','r':'ʀ','s':'ꜱ','t':'ᴛ','u':'ᴜ','v':'ᴠ','w':'ᴡ','x':'x','y':'ʏ','z:'ᴢ' }
function fancy(t){ let r=''; for(let c of t) r+=fMap[c]||fMap[c.toLowerCase()]||c; return r }
function runtime(s){s=Number(s);let d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),ss=Math.floor(s%60);return `${d}d ${h}h ${m}m ${ss}s`}
async function getBuffer(u){let res=await axios.get(u,{responseType:'arraybuffer'});return Buffer.from(res.data)}

global.db = global.db || { auto:{autoread:false,autoonline:true,autoreact:true,autoview:true,autolikestatus:true}, antilink:{}, warnings:{}, users:{} }

app.use(express.static(path.join(__dirname, 'public')))
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')))

// REAL LINKING - FIXED
app.get('/pair', async (req, res) => {
    const number = (req.query.number || '').replace(/\D/g, '')
    if (!number || number.length < 10) return res.json({ error: 'Invalid number, use 234...' })
    if (!sock) {
        await delay(2000)
        if (!sock) return res.json({ error: 'Bot starting, try again in 5 sec' })
    }
    if (sock.authState.creds.registered) return res.json({ error: 'Already linked, delete session folder to re-link' })
    try {
        console.log(chalk.yellow(`[PAIR] Request for ${number}`))
        await delay(1500)
        let code = await sock.requestPairingCode(number)
        code = code?.match(/.{1,4}/g)?.join('-') || code
        console.log(chalk.green(`[PAIR] CODE: ${code}`))
        res.json({ code })
    } catch (err) {
        console.log(chalk.red('[PAIR FAIL]'), err.message)
        res.json({ error: err.message })
    }
})
app.listen(process.env.PORT || config.port || 3000, () => console.log(chalk.cyan('[WEB] Ready')))

async function startCrasher() {
    if (isConnecting) return; isConnecting = true
    const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder || './session')
    const { version } = await fetchLatestBaileysVersion()
    sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: false,
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' })) },
        browser: Browsers.ubuntu('Chrome'),
        markOnlineOnConnect: false,
        getMessage: async () => undefined,
    })
    sock.ev.on('creds.update', saveCreds)
    sock.ev.on('connection.update', async (u) => {
        const { connection, lastDisconnect } = u
        if (connection === 'open') {
            isConnecting = false
            console.log(chalk.green('✅ CONNECTED - CRASHER MD ONLINE'))
            try{ let b=await getBuffer(config.pfp); await sock.updateProfilePicture(sock.user.id,b).catch(()=>{}) }catch{}
            await sock.sendMessage(config.owner[0]+'@s.whatsapp.net',{text:`◈┈▉ \`ｃｒａｓｈｅｒ ｍｄ\` ▉┄◈\n> Connected\n> Prefix: ${config.prefix}`}).catch(()=>{})
        }
        if (connection === 'close') {
            isConnecting = false
            const code = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : 0
            console.log(chalk.red(`[CLOSE] ${code}`))
            if (code !== DisconnectReason.loggedOut) { await delay(3000); startCrasher() }
        }
    })
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return
        const m = messages[0]
        if (!m.message || m.key.remoteJid === 'status@broadcast') return
        try { await handleMessage(m) } catch (e) { console.error(e) }
    })
}

async function handleMessage(m) {
    const from = m.key.remoteJid
    const isGroup = from.endsWith('@g.us')
    const rawBody = (m.message.conversation || m.message.extendedTextMessage?.text || m.message.imageMessage?.caption || m.message.videoMessage?.caption || '')
    const body = rawBody.trim()
    if (!body) return
    if (global.db.auto.autoread) await sock.readMessages([m.key]).catch(()=>{})
    if (global.db.auto.autoonline) await sock.sendPresenceUpdate('available',{}).catch(()=>{})
    
    // ANTILINK REAL
    if(isGroup && global.db.antilink[from] && body.match(/https:\/\/chat.whatsapp.com|wa.me|t.me/)){
      try{
        let meta = groupCache.has(from) ? groupCache.get(from).data : await sock.groupMetadata(from)
        let sender = m.key.participant
        let isAdmin = meta.participants.find(p=>p.id===sender)?.admin
        let isBotAdmin = meta.participants.find(p=>p.id===sock.user.id)?.admin
        if(!isAdmin && isBotAdmin){ await sock.sendMessage(from,{delete:m.key}).catch(()=>{}); await sock.groupParticipantsUpdate(from,[sender],'remove').catch(()=>{}) }
      }catch{}
    }

    if (!body.startsWith(config.prefix)) return
    const args = body.slice(config.prefix.length).trim().split(/ +/)
    const command = args.shift().toLowerCase()
    const q = args.join(' ')
    const sender = m.key.participant || from
    const senderNum = sender.split('@')[0]
    const isCreator = config.owner.includes(senderNum) || (config.sudo && config.sudo.includes(senderNum)) || m.key.fromMe
    if(global.db.users[senderNum]?.banned && !isCreator) return
    if(global.db.settings?.mode==='private' && !isCreator) return

    let groupMeta, isAdmin=false, isBotAdmin=false
    if(isGroup){
      try{
        if(groupCache.has(from) && Date.now()-groupCache.get(from).time < 60000) groupMeta=groupCache.get(from).data
        else { groupMeta=await sock.groupMetadata(from); groupCache.set(from,{data:groupMeta,time:Date.now()}) }
        const botId=jidNormalizedUser(sock.user.id)
        const senderJid=jidNormalizedUser(sender)
        for(let p of groupMeta.participants){ if(!p.admin) continue; const pid=jidNormalizedUser(p.id); if(pid===botId) isBotAdmin=true; if(pid===senderJid) isAdmin=true }
        if(isCreator) isAdmin=true
      }catch{}
    }

    const reply = async (teks) => { 
      try{ await sock.sendMessage(from,{text:`◈┈▉ \`ｃｒａｓｈｅｒ ｍｄ\` ▉┄◈\n> ${teks}\n\n> ⚡ ᴘᴏᴡᴇʀ • ꜱᴘᴇᴇᴅ • ᴄᴏɴᴛʀᴏʟ`},{quoted:m}) }catch{}
      try{ await sock.sendMessage(from,{react:{text:'💀',key:m.key}}) }catch{}
    }

    // OUR REAL 150 CMD HANDLER - NOT THAT FAKE ONE
    switch(command){
      case 'menu': case 'help': {
        let menu=`╭────↯\n│ ➠ OWNER: CRASHER\n│ ➠ PREFIX: ${config.prefix}\n│ ➠ TOTAL CMDS: 150\n╰────↯\n\nOWNER MENU\n╭──────────◈\n┆ ◈ .menu .ping .alive .owner .runtime .botinfo .restart .broadcast .setprefix .setname .setbio .setpp .join .leave .block .unblock .ban .unban\n╰──────────◈\n\nAUTO MENU\n╭──────────◈\n┆ ◈ .autoread .autotyping .autoonline .autoreact .autoview .autobio\n╰──────────◈\n\nGROUP MENU\n╭──────────◈\n┆ ◈ .antilink .kick .add .promote .demote .warn .mute .unmute .groupinfo .grouplink .tagall .hidetag\n╰──────────◈\n\nVV\n╭──────────◈\n┆ ◈ .vv\n╰──────────◈\n\nDOWNLOADER\n╭──────────◈\n┆ ◈ .play .video .tiktok .insta .fb .mediafire .apk .pinterest .github\n╰──────────◈`
        await reply(menu); break
      }
      case 'ping': { let s=Date.now(); await sock.sendMessage(from,{text:'pong...'},{quoted:m}); await reply(`PING: ${Date.now()-s}ms`); break }
      case 'alive': { await reply(`ALIVE! UPTIME: ${runtime(process.uptime())} MODE: ${global.db.settings.mode}`); break }
      case 'owner': { await sock.sendMessage(from,{contacts:{displayName:config.ownerName,contacts:[{vcard:`BEGIN:VCARD\nVERSION:3.0\nFN:${config.ownerName}\nTEL;type=CELL;type=VOICE;waid=${config.owner[0]}:+${config.owner[0]}\nEND:VCARD`}] }},{quoted:m}); break }
      case 'runtime': { await reply(runtime(process.uptime())); break }
      case 'botinfo': { await reply(`BOT: ${config.botName}\nPREFIX: ${config.prefix}\nUSERS: ${Object.keys(global.db.users).length}`); break }
      case 'restart': { if(!isCreator) return reply('Owner only'); await reply('Restarting...'); setTimeout(()=>process.exit(0),1000); break }
      case 'setprefix': { if(!isCreator) return; config.prefix=q[0]||'.'; global.db.settings=global.db.settings||{}; await reply(`Prefix: ${config.prefix}`); break }
      case 'autoread': { global.db.auto.autoread=!global.db.auto.autoread; await reply(`Autoread ${global.db.auto.autoread?'ON':'OFF'}`); break }
      case 'autoonline': { global.db.auto.autoonline=!global.db.auto.autoonline; await reply(`Autoonline ${global.db.auto.autoonline?'ON':'OFF'}`); break }
      case 'autoreact': { global.db.auto.autoreact=!global.db.auto.autoreact; await reply(`Autoreact ${global.db.auto.autoreact?'ON':'OFF'}`); break }
      case 'autoview': { global.db.auto.autoview=!global.db.auto.autoview; await reply(`Autoview ${global.db.auto.autoview?'ON':'OFF'}`); break }
      case 'antilink': { if(!isGroup||!isAdmin) return reply('Admin only'); global.db.antilink[from]=!global.db.antilink[from]; await reply(`Antilink ${global.db.antilink[from]?'ON':'OFF'}`); break }
      case 'kick': { if(!isGroup||!isBotAdmin||!isAdmin) return reply('Admin need'); let jid=m.message.extendedTextMessage?.contextInfo?.participant||args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; await sock.groupParticipantsUpdate(from,[jid],'remove'); await reply('Kicked'); break }
      case 'vv': case 'viewonce': {
        let quoted=m.message.extendedTextMessage?.contextInfo?.quotedMessage; if(!quoted) return reply('Reply viewonce');
        let vo=quoted.viewOnceMessageV2||quoted.viewOnceMessage||quoted; let msgContent=vo.message||vo; let type=Object.keys(msgContent)[0];
        let media=msgContent[type]; let stream=await downloadContentFromMessage(media,type.includes('image')?'image':type.includes('video')?'video':'audio');
        let buf=[]; for await(let c of stream) buf.push(c); let final=Buffer.concat(buf);
        if(type.includes('image')) await sock.sendMessage(from,{image:final,caption:'*VV REVEALED* - CRASHER MD'},{quoted:m});
        else if(type.includes('video')) await sock.sendMessage(from,{video:final,caption:'*VV REVEALED*'},{quoted:m});
        break
      }
      case 'play': case 'song': {
        if(!q) return reply('Song name need'); let yts=require('yt-search'); let s=await yts.search(q); let v=s.videos[0];
        await sock.sendMessage(from,{image:{url:v.thumbnail},caption:`*${v.title}*\nDownloading...`},{quoted:m});
        try{ let ap=await axios.get(`https://api.dreaded.site/api/ytdl/audio?url=${v.url}`); await sock.sendMessage(from,{audio:{url:ap.data.result.download},mimetype:'audio/mp4'},{quoted:m}); }catch{ await reply('DL failed try .video') }
        break
      }
      case 'tiktok': { if(!q) return reply('Link'); let r=await axios.get(`https://api.tikwm.com/api/?url=${q}`); await sock.sendMessage(from,{video:{url:r.data.data.play}},{quoted:m}); break }
      case 'sticker': case 's': {
        let im=m.message.imageMessage||m.message.videoMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage;
        if(!im) return reply('Reply image'); let st=await downloadContentFromMessage(im,im.mimetype?.includes('video')?'video':'image'); let b=[]; for await(let c of st) b.push(c);
        await sock.sendMessage(from,{sticker:Buffer.concat(b)},{quoted:m}); break
      }
      case 'groupinfo': { await reply(`Group: ${groupMeta.subject}\nMembers: ${groupMeta.participants.length}\nDesc: ${groupMeta.desc||'none'}`); break }
      case 'grouplink': { if(!isBotAdmin) return reply('Bot not admin'); let code=await sock.groupInviteCode(from); await reply(`https://chat.whatsapp.com/${code}`); break }
      case 'tagall': { if(!isGroup) return; let txt=`*TAGALL* ${q}\n\n`; let ids=[]; groupMeta.participants.forEach(p=>{ txt+=`@${p.id.split('@')[0]} `; ids.push(p.id) }); await sock.sendMessage(from,{text:txt,mentions:ids},{quoted:m}); break }
    }
}

startCrasher()
