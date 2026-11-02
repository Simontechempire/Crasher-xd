const { default: makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, fetchLatestBaileysVersion, DisconnectReason, downloadContentFromMessage } = require('@whiskeysockets/baileys')
const express = require('express')
const pino = require('pino')
const fs = require('fs')
const axios = require('axios')
const path = require('path')
const config = require('./config')

const app = express()
app.use(express.static('public'))
app.use(express.json())

global.mode = config.mode
global.prefix = config.prefix
global.db = { warnings:{}, antilink:{}, users:{}, autobio:false, auto:{ autoread:false, autotyping:false, autoonline:true, autorecording:false, autoreact:true, autoreply:false, autosticker:false, autoview:true, autolikestatus:true } }

const fancy = t=>t.split('').map(c=>({a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'}[c.toLowerCase()]||c)).join('')
function runtime(s){s=Number(s);let d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),ss=Math.floor(s%60);return `${d}d ${h}h ${m}m ${ss}s`}
async function getBuffer(u){let r=await axios.get(u,{responseType:'arraybuffer'});return Buffer.from(r.data)}

let sockInstance = null

// PAIR ROUTE - OUTSIDE startBot so e no duplicate
app.get('/pair', async(req,res)=>{
  let num=(req.query.number||'').replace(/[^0-9]/g,'')
  if(!num) return res.json({error:'Add ?number=234...'})
  if(!sockInstance) return res.json({error:'Bot starting, wait 10s'})
  if(sockInstance.authState.creds.registered) return res.json({error:'Already paired'})
  try{
    let code = await sockInstance.requestPairingCode(num)
    res.json({code: code, message: 'Enter this code in WhatsApp > Linked Devices > Link with phone number'})
  }catch(e){ res.json({error:e.message}) }
})

async function sendFancy(sock, chat, text, m){
  let msg=`◈┈▉ \`ｃｒａｓｈｅｒ ｍｄ\` ▉┄◈\n> ${text}\n\n◈┈▉ \`ｃｒａｓｈｅｒ ｍｄ\` ▉┄◈\n> ⚡ ᴘᴏᴡᴇʀ • ꜱᴘᴇᴇᴅ • ᴄᴏɴᴛʀᴏʟ`
  return sock.sendMessage(chat,{text:msg},{quoted:m})
}

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder)
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({version, logger:pino({level:'silent'}), printQRInTerminal:false, auth:{creds:state.creds, keys:makeCacheableSignalKeyStore(state.keys,pino({level:'silent'}))}, browser:['Crasher MD','Chrome','1.0']})
  sockInstance = sock

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async(u)=>{
    const {connection, lastDisconnect}=u
    if(connection==='open'){
      console.log('◈ CRASHER MD CONNECTED ◈')
      try{ let b=await getBuffer(config.pfp); await sock.updateProfilePicture(sock.user.id,b).catch(()=>{}) }catch{}
      await sock.sendMessage(config.owner[0]+'@s.whatsapp.net',{text:`◈┈▉ \`ｃｒᴀｓｈｅｒ ｍｄ\` ▉┄◈\n> Connected\n> Prefix: ${global.prefix}`}).catch(()=>{})
    }
    if(connection==='close'){ let r=lastDisconnect?.error?.output?.statusCode; if(r!==DisconnectReason.loggedOut) startBot() }
  })

  sock.ev.on('messages.upsert', async({messages})=>{
    let m=messages[0]; if(!m.message) return
    let chat=m.key.remoteJid
    let isGroup=chat.endsWith('@g.us')
    let body=m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||m.message.videoMessage?.caption||''
    if(!body) return
    let sender=m.key.participant||m.key.remoteJid
    let senderNum=sender.split('@')[0]
    let isCreator=config.owner.includes(senderNum)||config.sudo.includes(senderNum)
    if(global.db.users[senderNum]?.banned && !isCreator) return
    if(global.db.auto.autoread) await sock.readMessages([m.key]).catch(()=>{})
    if(global.db.auto.autoonline) await sock.sendPresenceUpdate('available',{}).catch(()=>{})
    if(isGroup && global.db.antilink[chat] && body.match(/https:\/\/chat.whatsapp.com|wa.me|t.me/)){
      try{
        let meta=await sock.groupMetadata(chat)
        let isAdmin=meta.participants.find(p=>p.id===sender)?.admin
        let isBotAdmin=meta.participants.find(p=>p.id===sock.user.id)?.admin
        if(!isAdmin && isBotAdmin){ await sock.sendMessage(chat,{delete:m.key}).catch(()=>{}); await sock.groupParticipantsUpdate(chat,[sender],'remove').catch(()=>{}) }
      }catch{}
    }
    if(!body.startsWith(global.prefix)) return
    let args=body.slice(global.prefix.length).trim().split(/ +/)
    let cmd=args[0].toLowerCase()
    let q=body.slice(global.prefix.length+cmd.length).trim()
    if(global.mode==='private' && !isCreator) return
    try{ await sock.sendMessage(chat,{react:{text:'⏳',key:m.key}})}catch{}
    let groupMeta,isAdmin,isBotAdmin
    if(isGroup){ try{ groupMeta=await sock.groupMetadata(chat); isAdmin=!!groupMeta.participants.find(p=>p.id===sender)?.admin; isBotAdmin=!!groupMeta.participants.find(p=>p.id===sock.user.id)?.admin }catch{} }
    const reply=t=>sendFancy(sock,chat,t,m)
    const done=async()=>{ try{ await sock.sendMessage(chat,{react:{text:'💀',key:m.key}})}catch{} }

    if(cmd==='menu'||cmd==='help'){
      let menu=`╭────↯\n│ ➠ *𝙾𝚆𝙽𝙴𝚁:* ᴄʀᴀꜱʜᴇʀ\n│ ➠ *𝙿𝚁𝙴𝙵𝙸𝚇:* ${global.prefix}\n│ ➠ *𝚃𝙾𝚃𝙰𝙻 𝙲𝙼𝙳𝚂:* 150\n╰────↯\n\nᴏᴡɴᴇʀ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ᴍᴇɴᴜ\n┆ ◈ .ᴘɪɴɢ\n┆ ◈ .ᴀʟɪᴠᴇ\n┆ ◈ .ᴏᴡɴᴇʀ\n┆ ◈ .ʀᴜɴᴛɪᴍᴇ\n┆ ◈ .ʙᴏᴛɪɴꜰᴏ\n┆ ◈ .ʀᴇꜱᴛᴀʀᴛ\n┆ ◈ .ʙʀᴏᴀᴅᴄᴀꜱᴛ\n┆ ◈ .ꜱᴇᴛᴘʀᴇꜰɪx\n┆ ◈ .ꜱᴇᴛɴᴀᴍᴇ\n┆ ◈ .ꜱᴇᴛʙɪᴏ\n┆ ◈ .ꜱᴇᴛᴘᴘ\n┆ ◈ .ᴊᴏɪɴ\n┆ ◈ .ʟᴇᴀᴠᴇ\n┆ ◈ .ʙʟᴏᴄᴋ\n┆ ◈ .ᴜɴʙʟᴏᴄᴋ\n┆ ◈ .ʙᴀɴ\n┆ ◈ .ᴜɴʙᴀɴ\n╰──────────◈\n\nᴀᴜᴛᴏ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ᴀᴜᴛᴏʀᴇᴀᴅ\n┆ ◈ .ᴀᴜᴛᴏᴛʏᴘɪɴɢ\n┆ ◈ .ᴀᴜᴛᴏᴏɴʟɪɴᴇ\n┆ ◈ .ᴀᴜᴛᴏʀᴇᴀᴄᴛ\n┆ ◈ .ᴀᴜᴛᴏᴠɪᴇᴡ\n┆ ◈ .ᴀᴜᴛᴏʙɪᴏ\n╰──────────◈\n\nɢʀᴏᴜᴘ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ᴀɴᴛɪʟɪɴᴋ\n┆ ◈ .ᴋɪᴄᴋ\n┆ ◈ .ᴀᴅᴅ\n┆ ◈ .ᴘʀᴏᴍᴏᴛᴇ\n┆ ◈ .ᴅᴇᴍᴏᴛᴇ\n┆ ◈ .ᴡᴀʀɴ\n┆ ◈ .ᴍᴜᴛᴇ\n┆ ◈ .ᴜɴᴍᴜᴛᴇ\n┆ ◈ .ɢʀᴏᴜᴘɪɴꜰᴏ\n┆ ◈ .ɢʀᴏᴜᴘʟɪɴᴋ\n┆ ◈ .ᴛᴀɢᴀʟʟ\n┆ ◈ .ʜɪᴅᴇᴛᴀɢ\n╰──────────◈\n\nᴠᴠ\n╭──────────◈\n┆ ◈ .ᴠᴠ\n╰──────────◈\n\nᴅᴏᴡɴʟᴏᴀᴅᴇʀ\n╭──────────◈\n┆ ◈ .ᴘʟᴀʏ\n┆ ◈ .ᴠɪᴅᴇᴏ\n┆ ◈ .ᴛɪᴋᴛᴏᴋ\n┆ ◈ .ɪɴꜱᴛᴀ\n┆ ◈ .ꜰʙ\n┆ ◈ .ᴍᴇᴅɪᴀꜰɪʀᴇ\n┆ ◈ .ᴀᴘᴋ\n┆ ◈ .ᴘɪɴᴛᴇʀᴇꜱᴛ\n┆ ◈ .ɢɪᴛʜᴜʙ\n╰──────────◈`
      await reply(menu); return done()
    }

    switch(cmd){
      case 'ping': { await reply(`ᴘɪɴɢ: ${Date.now()}ms`); break; }
      case 'alive': { await reply(`ᴀʟɪᴠᴇ! ${runtime(process.uptime())}`); break; }
      case 'owner': { await sock.sendMessage(chat,{contacts:{displayName:config.ownerName,contacts:[{vcard:`BEGIN:VCARD\nVERSION:3.0\nFN:${config.ownerName}\nTEL;type=CELL;type=VOICE;waid=${config.owner[0]}:+${config.owner[0]}\nEND:VCARD`}] }},{quoted:m}); break; }
      case 'runtime': { await reply(runtime(process.uptime())); break; }
      case 'botinfo': { await reply(`${config.botName}\nMode: ${global.mode}\nPrefix: ${global.prefix}`); break; }
      case 'restart': { if(!isCreator) return; await reply('Restarting...'); process.exit(0); break; }
      case 'setprefix': { if(!isCreator) return; global.prefix=args[1]||'.'; await reply(`Prefix: ${global.prefix}`); break; }
      case 'setname': { if(!q) return reply('Name need'); if(isGroup){ await sock.groupUpdateSubject(chat,q); } else { await sock.updateProfileName(q); } await reply('Updated'); break; }
      case 'join': { if(!isCreator) return; await sock.groupAcceptInvite(q.split('/').pop()); await reply('Joined'); break; }
      case 'leave': { await sock.groupLeave(chat); break; }
      case 'autoread': { global.db.auto.autoread=!global.db.auto.autoread; await reply(`${global.db.auto.autoread?'ON':'OFF'}`); break; }
      case 'antilink': { if(!isGroup) return; global.db.antilink[chat]=!global.db.antilink[chat]; await reply(`Antilink ${global.db.antilink[chat]?'ON':'OFF'}`); break; }
      case 'kick': { if(!isBotAdmin||!isAdmin) return; let j=m.message.extendedTextMessage?.contextInfo?.participant||args[1].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; await sock.groupParticipantsUpdate(chat,[j],'remove'); await reply('Kicked'); break; }
      case 'vv': { let qt=m.message.extendedTextMessage?.contextInfo?.quotedMessage; if(!qt) return reply('Reply viewonce'); let vo=qt.viewOnceMessageV2||qt.viewOnceMessage||qt; let mg=vo.message||vo; let ty=Object.keys(mg)[0]; let md=mg[ty]; let tp=ty.includes('image')?'image':ty.includes('video')?'video':'audio'; let st=await downloadContentFromMessage(md,tp); let b=[]; for await(let c of st) b.push(c); let f=Buffer.concat(b); if(tp==='image') await sock.sendMessage(chat,{image:f,caption:'VV REVEALED'},{quoted:m}); else await sock.sendMessage(chat,{video:f},{quoted:m}); break; }
      case 'play': { if(!q) return reply('Song name'); let yts=require('yt-search'); let s=await yts.search(q); let v=s.videos[0]; await sock.sendMessage(chat,{image:{url:v.thumbnail},caption:v.title},{quoted:m}); try{ let ap=await axios.get(`https://api.dreaded.site/api/ytdl/audio?url=${v.url}`); await sock.sendMessage(chat,{audio:{url:ap.data.result.download},mimetype:'audio/mp4'},{quoted:m}); }catch{} break; }
      case 'tiktok': { if(!q) return reply('Link'); let r=await axios.get(`https://api.tikwm.com/api/?url=${q}`); await sock.sendMessage(chat,{video:{url:r.data.data.play}},{quoted:m}); break; }
      case 'sticker': case 's': { let im=m.message.imageMessage||m.message.videoMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage; if(!im) return reply('Reply image'); let st=await downloadContentFromMessage(im,im.mimetype?.includes('video')?'video':'image'); let b=[]; for await(let c of st) b.push(c); await sock.sendMessage(chat,{sticker:Buffer.concat(b)},{quoted:m}); break; }
    }
    await done()
  })
}

app.get('/',(req,res)=>res.send('◈┈▉ `ｃｒａｓｈｅｒ ｍｄ` ▉┄◈ ONLINE - Go to /pair?number=234xxx to link'))
startBot()
app.listen(config.port,()=>console.log('RUNNING '+config.port))
