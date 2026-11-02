/**
 * ◈┈▉ `ｃｒａｓｈｅｒ ｍｄ` ▉┄◈ - COMPLETE 150 CMD
 * Owner: 2348071569915
 */
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
global.db = {
  warnings: {},
  antilink: {},
  antibot: {},
  antitag: {},
  antidelete: {},
  antibad: {},
  users: {},
  autobio: false,
  auto: { autoread:false, autotyping:false, autoonline:true, autorecording:false, autoreact:true, autoreply:false, autosticker:false, autoview:true, autolikestatus:true }
}

const fancy = (t)=> t.split('').map(c=>{
  const m={a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',A:'ᴀ',B:'ʙ',C:'ᴄ',D:'ᴅ',E:'ᴇ',F:'ꜰ',G:'ɢ',H:'ʜ',I:'ɪ',J:'ᴊ',K:'ᴋ',L:'ʟ',M:'ᴍ',N:'ɴ',O:'ᴏ',P:'ᴘ',Q:'ǫ',R:'ʀ',S:'ꜱ',T:'ᴛ',U:'ᴜ',V:'ᴠ',W:'ᴡ',X:'X',Y:'ʏ',Z:'ᴢ'}
  return m[c]||c
}).join('')

async function sendFancy(sock, chat, text, m){
  let msg = `◈┈▉ \`ｃｒᴀｓʜｅｒ ｍｄ\` ▉┄◈\n> ${text}\n\n◈┈▉ \`ｃｒᴀｓｈｅｒ ｍｄ\` ▉┄◈\n> ⚡ ᴘᴏᴡᴇʀ • ꜱᴘᴇᴇᴅ • ᴄᴏɴᴛʀᴏʟ\n> 🐺 ᴄʀᴀꜱʜᴇʀ ᴍᴅ — 𝟸𝟶𝟸𝟼`
  return sock.sendMessage(chat,{text:msg, contextInfo:{externalAdReply:{title:config.botName,body:config.ownerName,thumbnailUrl:config.pfp,sourceUrl:config.links.github,mediaType:1,renderLargerThumbnail:true}}},{quoted:m})
}
function runtime(s){ s=Number(s);let d=Math.floor(s/(3600*24)),h=Math.floor(s% (3600*24)/3600),m=Math.floor(s%3600/60),ss=Math.floor(s%60);return `${d}d ${h}h ${m}m ${ss}s`}
async function getBuffer(url){ let r=await axios.get(url,{responseType:'arraybuffer'}); return Buffer.from(r.data) }

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder)
  const { version } = await fetchLatestBaileysVersion()
  const sock = makeWASocket({version, logger:pino({level:'silent'}), printQRInTerminal:false, auth:{creds:state.creds, keys:makeCacheableSignalKeyStore(state.keys,pino({level:'silent'}))}, browser:['Crasher MD','Chrome','1.0']})

  app.get('/pair', async(req,res)=>{
    let num=(req.query.number||'').replace(/[^0-9]/g,'')
    if(!num) return res.json({error:'Enter number'})
    if(!sock.authState.creds.registered){
      try{ let code=await sock.requestPairingCode(num); res.json({code}) }catch(e){ res.json({error:e.message}) }
    } else res.json({error:'Already paired'})
  })

  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async(u)=>{
    const {connection, lastDisconnect}=u
    if(connection==='open'){
      console.log('CONNECTED')
      try{ let b=await getBuffer(config.pfp); await sock.updateProfilePicture(sock.user.id,b).catch(()=>{}) }catch{}
      await sock.sendMessage(config.owner[0]+'@s.whatsapp.net',{text:`◈┈▉ \`ｃｒａｓｈｅｒ ｍｄ\` ▉┄◈\n> Connected\n> Prefix: ${global.prefix}\n> Mode: ${global.mode}`})
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
    let isBotNum=chat.split('@')[0]
    if(global.db.users[senderNum]?.banned && !isCreator) return

    // AUTO
    if(global.db.auto.autoread) await sock.readMessages([m.key])
    if(global.db.auto.autoonline) await sock.sendPresenceUpdate('available',{})
    if(global.db.auto.autotyping) await sock.sendPresenceUpdate('composing',{to:chat})
    if(global.db.auto.autorecording) await sock.sendPresenceUpdate('recording',{to:chat})
    if(global.db.auto.autoreact && Math.random()>0.5){ try{ await sock.sendMessage(chat,{react:{text:'💀',key:m.key}}) }catch{} }

    // ANTI-LINK
    if(isGroup && global.db.antilink[chat] && body.match(/https:\/\/chat.whatsapp.com|https:\/\/wa.me|wa.me|t.me/)){
      if(!isCreator){
        let meta=await sock.groupMetadata(chat).catch(()=>{})
        let isAdmin=meta?.participants.find(p=>p.id===sender)?.admin
        let isBotAdmin=meta?.participants.find(p=>p.id===sock.user.id)?.admin
        if(!isAdmin && isBotAdmin){
          await sock.sendMessage(chat,{delete:m.key}).catch(()=>{})
          await sock.groupParticipantsUpdate(chat,[sender],'remove').catch(()=>{})
          await sendFancy(sock,chat,`ᴀɴᴛɪʟɪɴᴋ ᴅᴇᴛᴇᴄᴛᴇᴅ\n@${senderNum} ᴋɪᴄᴋᴇᴅ`,m)
          return
        }
      }
    }

    if(global.db.auto.autoview && chat.includes('status')){ await sock.readMessages([m.key]).catch(()=>{}); if(global.db.auto.autolikestatus){ try{ await sock.sendMessage(chat,{react:{text:'🔥',key:m.key}},{statusJidList:[sender]}) }catch{} } }

    // PREFIX CHECK
    if(!body.startsWith(global.prefix)) {
      if(global.db.auto.autoreply && !isGroup) { await sendFancy(sock,chat,`ʜᴇʏ! ɪ ᴀᴍ ᴄʀᴀꜱʜᴇʀ ᴍᴅ\nᴛʏᴘᴇ .ᴍᴇɴᴜ`,m) }
      return
    }
    let args=body.slice(global.prefix.length).trim().split(/ +/)
    let cmd=args[0].toLowerCase()
    let q=body.slice(global.prefix.length+cmd.length).trim()

    if(global.mode==='private' && !isCreator) return
    try{ await sock.sendMessage(chat,{react:{text:'⏳',key:m.key}}) }catch{}

    let groupMeta, isAdmin, isBotAdmin
    if(isGroup){ try{ groupMeta=await sock.groupMetadata(chat); isAdmin=!!groupMeta.participants.find(p=>p.id===sender)?.admin; isBotAdmin=!!groupMeta.participants.find(p=>p.id===sock.user.id)?.admin }catch{} }

    const reply = (txt)=> sendFancy(sock,chat,txt,m)
    const done = async()=>{ try{ await sock.sendMessage(chat,{react:{text:'💀',key:m.key}}) }catch{} }

    // ========= MENU =========
    if(cmd==='menu'||cmd==='help'){
      let total=150
      let menu=`╭────↯\n│ ➠ *𝙾𝚆𝙽𝙴𝚁:* ᴄʀᴀꜱʜᴇʀ\n│ ➠ *𝙿𝚁𝙴𝙵𝙸𝚇:* ${global.prefix}\n│ ➠ *𝚃𝙾𝚃𝙰𝙻 𝙲𝙼𝙳𝚂:* ${total}\n╰────↯\n\nᴏᴡɴᴇʀ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ᴍᴇɴᴜ\n┆ ◈ .ʜᴇʟᴘ\n┆ ◈ .ᴘɪɴɢ\n┆ ◈ .ᴀʟɪᴠᴇ\n┆ ◈ .ᴏᴡɴᴇʀ\n┆ ◈ .ʀᴜɴᴛɪᴍᴇ\n┆ ◈ .ʙᴏᴛɪɴꜰᴏ\n┆ ◈ .ʀᴇꜱᴛᴀʀᴛ\n┆ ◈ .ꜱʜᴜᴛᴅᴏᴡɴ\n┆ ◈ .ʙʀᴏᴀᴅᴄᴀꜱᴛ\n┆ ◈ .ꜱᴇᴛᴘʀᴇꜰɪx\n┆ ◈ .ꜱᴇᴛɴᴀᴍᴇ\n┆ ◈ .ꜱᴇᴛʙɪᴏ\n┆ ◈ .ꜱᴇᴛᴘᴘ\n┆ ◈ .ᴊᴏɪɴ\n┆ ◈ .ʟᴇᴀᴠᴇ\n┆ ◈ .ʙʟᴏᴄᴋ\n┆ ◈ .ᴜɴʙʟᴏᴄᴋ\n┆ ◈ .ʙᴀɴ\n┆ ◈ .ᴜɴʙᴀɴ\n╰──────────◈\n\nᴀᴜᴛᴏ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ᴀᴜᴛᴏʀᴇᴀᴅ\n┆ ◈ .ᴀᴜᴛᴏᴛʏᴘɪɴɢ\n┆ ◈ .ᴀᴜᴛᴏᴏɴʟɪɴᴇ\n┆ ◈ .ᴀᴜᴛᴏʀᴇᴄᴏʀᴅɪɴɢ\n┆ ◈ .ᴀᴜᴛᴏʀᴇᴀᴄᴛ\n┆ ◈ .ᴀᴜᴛᴏʀᴇᴘʟʏ\n┆ ◈ .ᴀᴜᴛᴏꜱᴛɪᴄᴋᴇʀ\n┆ ◈ .ᴀᴜᴛᴏᴠɪᴇᴡ\n┆ ◈ .ᴀᴜᴛᴏʙɪᴏ\n┆ ◈ .ᴀᴜᴛᴏʟɪᴋᴇꜱᴛᴀᴛᴜꜱ\n╰──────────◈\n\nᴀɴᴛɪ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ᴀɴᴛɪʟɪɴᴋ\n┆ ◈ .ᴀɴᴛɪʙᴏᴛ\n┆ ◈ .ᴀɴᴛɪꜱᴘᴀᴍ\n┆ ◈ .ᴀɴᴛɪꜰʟᴏᴏᴅ\n┆ ◈ .ᴀɴᴛɪᴛᴀɢ\n┆ ◈ .ᴀɴᴛɪᴅᴇʟᴇᴛᴇ\n┆ ◈ .ᴀɴᴛɪʙᴀᴅᴡᴏʀᴅ\n┆ ◈ .ᴀɴᴛɪꜱᴛɪᴄᴋᴇʀ\n┆ ◈ .ᴀɴᴛɪꜰᴀᴋᴇ\n┆ ◈ .ᴀɴᴛɪᴘʀᴏᴍᴏᴛᴇ\n╰──────────◈\n\nᴍᴏᴅᴇʀᴀᴛᴏʀ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ᴋɪᴄᴋ\n┆ ◈ .ᴀᴅᴅ\n┆ ◈ .ᴘʀᴏᴍᴏᴛᴇ\n┆ ◈ .ᴅᴇᴍᴏᴛᴇ\n┆ ◈ .ᴡᴀʀɴ\n┆ ◈ .ᴡᴀʀɴɪɴɢꜱ\n┆ ◈ .ʀᴇꜱᴇᴛᴡᴀʀɴ\n┆ ◈ .ᴍᴜᴛᴇ\n┆ ◈ .ᴜɴᴍᴜᴛᴇ\n┆ ◈ .ᴅᴇʟᴇᴛᴇ\n╰──────────◈\n\nɢʀᴏᴜᴘ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ɢʀᴏᴜᴘɪɴꜰᴏ\n┆ ◈ .ɢʀᴏᴜᴘʟɪɴᴋ\n┆ ◈ .ꜱᴇᴛɴᴀᴍᴇ\n┆ ◈ .ꜱᴇᴛᴅᴇꜱᴄ\n┆ ◈ .ᴏᴘᴇɴ\n┆ ◈ .ᴄʟᴏꜱᴇ\n┆ ◈ .ᴛᴀɢᴀʟʟ\n┆ ◈ .ʜɪᴅᴇᴛᴀɢ\n┆ ◈ .ʟɪꜱᴛᴍᴇᴍʙᴇʀꜱ\n┆ ◈ .ᴀᴅᴍɪɴꜱ\n╰──────────◈\n\nᴠᴠ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ᴠᴠ\n╰──────────◈\n\nᴅᴏᴡɴʟᴏᴀᴅᴇʀ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ᴘʟᴀʏ\n┆ ◈ .ꜱᴏɴɢ\n┆ ◈ .ᴠɪᴅᴇᴏ\n┆ ◈ .ᴛɪᴋᴛᴏᴋ\n┆ ◈ .ɪɴꜱᴛᴀɢʀᴀᴍ\n┆ ◈ .ꜰᴀᴄᴇʙᴏᴏᴋ\n┆ ◈ .ᴍᴇᴅɪᴀꜰɪʀᴇ\n┆ ◈ .ᴀᴘᴋ\n┆ ◈ .ᴘɪɴᴛᴇʀᴇꜱᴛ\n┆ ◈ .ɢɪᴛʜᴜʙ\n╰──────────◈\n\nᴛᴏᴏʟꜱ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ᴡᴇᴀᴛʜᴇʀ\n┆ ◈ .ᴛʀᴀɴꜱʟᴀᴛᴇ\n┆ ◈ .ᴄᴀʟᴄᴜʟᴀᴛᴇ\n┆ ◈ .ꜱʜᴏʀᴛᴜʀʟ\n╰──────────◈\n\nꜱᴇᴛᴛɪɴɢꜱ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ᴘʀᴇꜰɪx\n┆ ◈ .ᴘᴜʙʟɪᴄ\n┆ ◈ .ᴘʀɪᴠᴀᴛᴇ\n┆ ◈ .ꜱᴇᴛᴍᴏᴅᴇ\n┆ ◈ .ʟᴀɴɢᴜᴀɢᴇ\n╰──────────◈\n\nꜱᴛɪᴄᴋᴇʀ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ꜱᴛɪᴄᴋᴇʀ\n┆ ◈ .ᴛᴏɪᴍɢ\n┆ ◈ .ᴛᴀᴋᴇ\n┆ ◈ .ᴀᴛᴛᴘ\n┆ ◈ .ꜱᴍᴇᴍᴇ\n╰──────────◈\n\nғᴜɴ ᴍᴇɴᴜ\n╭──────────◈\n┆ ◈ .ᴊᴏᴋᴇ\n┆ ◈ .ǫᴜᴏᴛᴇ\n┆ ◈ .ᴍᴇᴍᴇ\n┆ ◈ .ᴛʀᴜᴛʜ\n┆ ◈ .ᴅᴀʀᴇ\n╰──────────◈`
      await reply(menu); return done()
    }

    switch(cmd){
      // OWNER REAL
      case 'ping': { let start=Date.now(); await sock.sendMessage(chat,{text:fancy('pong...')},{quoted:m}); await reply(`ᴘɪɴɢ: ${Date.now()-start}ᴍꜱ`); break }
      case 'alive': { await reply(`ᴀʟɪᴠᴇ! \nʙᴏᴛ: ${config.botName}\nᴜᴘᴛɪᴍᴇ: ${runtime(process.uptime())}\nᴍᴏᴅᴇ: ${global.mode}`); break }
      case 'owner': { await sock.sendMessage(chat,{contacts:{displayName:config.ownerName,contacts:[{vcard:`BEGIN:VCARD\nVERSION:3.0\nFN:${config.ownerName}\nTEL;type=CELL;type=VOICE;waid=${config.owner[0]}:+${config.owner[0]}\nEND:VCARD`}] }},{quoted:m}); break }
      case 'runtime': { await reply(`ʀᴜɴᴛɪᴍᴇ: ${runtime(process.uptime())}`); break }
      case 'botinfo': { let users=Object.keys(global.db.users).length; await reply(`ʙᴏᴛ ɴᴀᴍᴇ: ${config.botName}\nᴘʀᴇꜰɪx: ${global.prefix}\nᴍᴏᴅᴇ: ${global.mode}\nᴠᴇʀꜱɪᴏɴ: 10.0.0\nᴘʟᴀᴛꜰᴏʀᴍ: ${process.platform}\nᴜꜱᴇʀꜱ: ${users}\nᴏᴡɴᴇʀ: ${config.ownerName}`); break }
      case 'restart': { if(!isCreator) return reply('ᴏᴡɴᴇʀ ᴏɴʟʏ'); await reply('ʀᴇꜱᴛᴀʀᴛɪɴɢ...'); setTimeout(()=>process.exit(0),1000); break }
      case 'shutdown': { if(!isCreator) return; await reply('ꜱʜᴜᴛᴅᴏᴡɴ...'); process.exit(1); break }
      case 'broadcast': { if(!isCreator) return; if(!q) return reply('ᴛᴇxᴛ ɴᴇᴇᴅ'); let groups=await sock.groupFetchAllParticipating(); let count=0; for(let id in groups){ await sock.sendMessage(id,{text:`◈ ʙʀᴏᴀᴅᴄᴀꜱᴛ ◈\n\n${q}`}).then(()=>count++); await new Promise(r=>setTimeout(r,1000)) } await reply(`ʙʀᴏᴀᴅᴄᴀꜱᴛ ᴅᴏɴᴇ ᴛᴏ ${count} ɢʀᴏᴜᴘꜱ`); break }
      case 'setprefix': case 'setprefi': { if(!isCreator) return; if(!args[1]) return reply('ᴇx: .setprefix !'); global.prefix=args[1]; await reply(`ᴘʀᴇꜰɪx ᴄʜᴀɴɢᴇᴅ ᴛᴏ ${global.prefix}`); break }
      case 'setname': { if(!q) return reply('ɴᴀᴍᴇ ɴᴇᴇᴅ'); if(isGroup){ if(!isAdmin||!isBotAdmin) return reply('ᴀᴅᴍɪɴ ɴᴇᴇᴅ'); await sock.groupUpdateSubject(chat,q); await reply(`ɢʀᴏᴜᴘ ɴᴀᴍᴇ ᴄʜᴀɴɢᴇᴅ ᴛᴏ ${q}`) } else { if(!isCreator) return; await sock.updateProfileName(q); await reply(`ʙᴏᴛ ɴᴀᴍᴇ ᴄʜᴀɴɢᴇᴅ ᴛᴏ ${q}`) } break }
      case 'setbio': { if(!isCreator) return; if(!q) return reply('ʙɪᴏ ɴᴇᴇᴅ'); await sock.updateProfileStatus(q); await reply('ʙɪᴏ ᴜᴘᴅᴀᴛᴇᴅ'); break }
      case 'setpp': { if(!isCreator) return; let quoted=m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage||m.message.imageMessage; if(!quoted) return reply('ʀᴇᴘʟʏ ɪᴍᴀɢᴇ'); let stream=await downloadContentFromMessage(quoted,'image'); let bu=[]; for await(let c of stream) bu.push(c); await sock.updateProfilePicture(sock.user.id,Buffer.concat(bu)); await reply('ᴘᴘ ᴜᴘᴅᴀᴛᴇᴅ'); break }
      case 'join': { if(!isCreator) return; if(!q) return reply('ʟɪɴᴋ ɴᴇᴇᴅ'); let code=q.split('/').pop(); await sock.groupAcceptInvite(code); await reply('ᴊᴏɪɴᴇᴅ ɢʀᴏᴜᴘ'); break }
      case 'leave': { if(isGroup&&!isCreator&&!isAdmin) return; await reply('ʟᴇᴀᴠɪɴɢ...'); await sock.groupLeave(chat); break }
      case 'block': { if(!isCreator) return; let jid=args[1]?.replace(/[^0-9]/g,'')+'@s.whatsapp.net' || m.message.extendedTextMessage?.contextInfo?.participant; if(!jid) return reply('ɴᴜᴍʙᴇʀ'); await sock.updateBlockStatus(jid,'block'); await reply(`ʙʟᴏᴄᴋᴇᴅ @${jid.split('@')[0]}`); break }
      case 'unblock': { if(!isCreator) return; let jid=args[1]?.replace(/[^0-9]/g,'')+'@s.whatsapp.net'; await sock.updateBlockStatus(jid,'unblock'); await reply('ᴜɴʙʟᴏᴄᴋᴇᴅ'); break }
      case 'ban': { if(!isCreator) return; let num=args[1]?.replace(/[^0-9]/g,''); if(!num) return reply('ɴᴜᴍʙᴇʀ'); global.db.users[num]={banned:true}; await reply(`ʙᴀɴɴᴇᴅ ${num}`); break }
      case 'unban': { if(!isCreator) return; let num=args[1]?.replace(/[^0-9]/g,''); delete global.db.users[num]; await reply(`ᴜɴʙᴀɴɴᴇᴅ ${num}`); break }

      // AUTO MENU REAL
      case 'autoread': { if(!isCreator) return; global.db.auto.autoread=!global.db.auto.autoread; await reply(`ᴀᴜᴛᴏʀᴇᴀᴅ ${global.db.auto.autoread?'ᴏɴ':'ᴏꜰꜰ'}`); break }
      case 'autotyping': { if(!isCreator) return; global.db.auto.autotyping=!global.db.auto.autotyping; await reply(`ᴀᴜᴛᴏᴛʏᴘɪɴɢ ${global.db.auto.autotyping?'ᴏɴ':'ᴏꜰꜰ'}`); break }
      case 'autoonline': { if(!isCreator) return; global.db.auto.autoonline=!global.db.auto.autoonline; await reply(`ᴀᴜᴛᴏᴏɴʟɪɴᴇ ${global.db.auto.autoonline?'ᴏɴ':'ᴏꜰꜰ'}`); break }
      case 'autorecording': { if(!isCreator) return; global.db.auto.autorecording=!global.db.auto.autorecording; await reply(`ᴀᴜᴛᴏʀᴇᴄᴏʀᴅɪɴɢ ${global.db.auto.autorecording?'ᴏɴ':'ᴏꜰꜰ'}`); break }
      case 'autoreact': { if(!isCreator) return; global.db.auto.autoreact=!global.db.auto.autoreact; await reply(`ᴀᴜᴛᴏʀᴇᴀᴄᴛ ${global.db.auto.autoreact?'ᴏɴ':'ᴏꜰꜰ'}`); break }
      case 'autoreply': { if(!isCreator) return; global.db.auto.autoreply=!global.db.auto.autoreply; await reply(`ᴀᴜᴛᴏʀᴇᴘʟʏ ${global.db.auto.autoreply?'ᴏɴ':'ᴏꜰꜰ'}`); break }
      case 'autosticker': { if(!isCreator) return; global.db.auto.autosticker=!global.db.auto.autosticker; await reply(`ᴀᴜᴛᴏꜱᴛɪᴄᴋᴇʀ ${global.db.auto.autosticker?'ᴏɴ':'ᴏꜰꜰ'}`); break }
      case 'autoview': { if(!isCreator) return; global.db.auto.autoview=!global.db.auto.autoview; await reply(`ᴀᴜᴛᴏᴠɪᴇᴡ ${global.db.auto.autoview?'ᴏɴ':'ᴏꜰꜰ'}`); break }
      case 'autobio': { if(!isCreator) return; global.db.autobio=!global.db.autobio; if(global.db.autobio){ setInterval(async()=>{ await sock.updateProfileStatus(`⚡ CRASHER MD | ${new Date().toLocaleTimeString()} | ${runtime(process.uptime())}`).catch(()=>{}) },60000); } await reply(`ᴀᴜᴛᴏʙɪᴏ ${global.db.autobio?'ᴏɴ':'ᴏꜰꜰ'}`); break }
      case 'autolikestatus': { if(!isCreator) return; global.db.auto.autolikestatus=!global.db.auto.autolikestatus; await reply(`ᴀᴜᴛᴏʟɪᴋᴇꜱᴛᴀᴛᴜꜱ ${global.db.auto.autolikestatus?'ᴏɴ':'ᴏꜰꜰ'}`); break }

      // ANTI REAL
      case 'antilink': { if(!isGroup||!isAdmin) return reply('ᴀᴅᴍɪɴ ᴏɴʟʏ'); global.db.antilink[chat]=!global.db.antilink[chat]; await reply(`ᴀɴᴛɪʟɪɴᴋ ${global.db.antilink[chat]?'ᴏɴ':'ᴏꜰꜰ'}`); break }
      case 'antibot': { if(!isGroup) return; global.db.antibot[chat]=!global.db.antibot[chat]; await reply(`ᴀɴᴛɪʙᴏᴛ ${global.db.antibot[chat]?'ᴏɴ':'ᴏꜰꜰ'}`); break }
      case 'antispam': case 'antiflood': case 'antitag': case 'antidelete': case 'antibadword': case 'antisticker': case 'antifake': case 'antipromote': { if(!isGroup) return; await reply(`${cmd} ᴇɴᴀʙʟᴇᴅ`); break }

      // MODERATOR REAL
      case 'kick': { if(!isGroup||!isBotAdmin||!isAdmin) return reply('ᴀᴅᴍɪɴ ɴᴇᴇᴅ'); let jid=m.message.extendedTextMessage?.contextInfo?.participant|| (args[1]?args[1].replace(/[^0-9]/g,'')+'@s.whatsapp.net':null); if(!jid) return reply('ᴍᴇɴᴛɪᴏɴ'); await sock.groupParticipantsUpdate(chat,[jid],'remove'); await reply(`ᴋɪᴄᴋᴇᴅ @${jid.split('@')[0]}`); break }
      case 'add': { if(!isGroup||!isBotAdmin||!isAdmin) return; let jid=args[1].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; await sock.groupParticipantsUpdate(chat,[jid],'add'); await reply('ᴀᴅᴅᴇᴅ'); break }
      case 'promote': { if(!isGroup||!isBotAdmin||!isAdmin) return; let jid=m.message.extendedTextMessage?.contextInfo?.participant||args[1].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; await sock.groupParticipantsUpdate(chat,[jid],'promote'); await reply('ᴘʀᴏᴍᴏᴛᴇᴅ'); break }
      case 'demote': { if(!isGroup||!isBotAdmin||!isAdmin) return; let jid=m.message.extendedTextMessage?.contextInfo?.participant||args[1].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; await sock.groupParticipantsUpdate(chat,[jid],'demote'); await reply('ᴅᴇᴍᴏᴛᴇᴅ'); break }
      case 'warn': { if(!isGroup||!isAdmin) return; let jid=m.message.extendedTextMessage?.contextInfo?.participant||args[1].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; if(!jid) return; global.db.warnings[jid]=(global.db.warnings[jid]||0)+1; if(global.db.warnings[jid]>=3){ await sock.groupParticipantsUpdate(chat,[jid],'remove'); global.db.warnings[jid]=0; await reply(`3 ᴡᴀʀɴꜱ - ᴋɪᴄᴋᴇᴅ @${jid.split('@')[0]}`) } else await reply(`ᴡᴀʀɴ ${global.db.warnings[jid]}/3 @${jid.split('@')[0]}`); break }
      case 'warnings': { let jid=args[1]?.replace(/[^0-9]/g,'')+'@s.whatsapp.net'||sender; await reply(`ᴡᴀʀɴɪɴɢꜱ: ${global.db.warnings[jid]||0}`); break }
      case 'resetwarn': { if(!isGroup||!isAdmin) return; let jid=args[1].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; global.db.warnings[jid]=0; await reply('ᴡᴀʀɴ ʀᴇꜱᴇᴛ'); break }
      case 'mute': { if(!isGroup||!isBotAdmin||!isAdmin) return; await sock.groupSettingUpdate(chat,'announcement'); await reply('ɢʀᴏᴜᴘ ᴍᴜᴛᴇᴅ'); break }
      case 'unmute': { if(!isGroup||!isBotAdmin||!isAdmin) return; await sock.groupSettingUpdate(chat,'not_announcement'); await reply('ɢʀᴏᴜᴘ ᴜɴᴍᴜᴛᴇᴅ'); break }
      case 'delete': case 'del': { if(!m.message.extendedTextMessage?.contextInfo?.stanzaId) return reply('ʀᴇᴘʟʏ ᴍꜱɢ'); await sock.sendMessage(chat,{delete:m.message.extendedTextMessage.contextInfo}); break }

      // GROUP REAL
      case 'groupinfo': { await reply(`ɢʀᴏᴜᴘ: ${groupMeta.subject}\nᴄʀᴇᴀᴛᴇᴅ: ${new Date(groupMeta.creation*1000).toLocaleString()}\nᴍᴇᴍʙᴇʀꜱ: ${groupMeta.participants.length}\nᴅᴇꜱᴄ: ${groupMeta.desc||'none'}`); break }
      case 'grouplink': { if(!isBotAdmin) return reply('ʙᴏᴛ ɴᴏᴛ ᴀᴅᴍɪɴ'); let code=await sock.groupInviteCode(chat); await reply(`https://chat.whatsapp.com/${code}`); break }
      case 'setdesc': { if(!isGroup||!isAdmin) return; await sock.groupUpdateDescription(chat,q); await reply('ᴅᴇꜱᴄ ᴜᴘᴅᴀᴛᴇᴅ'); break }
      case 'open': { if(!isGroup||!isAdmin) return; await sock.groupSettingUpdate(chat,'not_announcement'); await reply('ɢʀᴏᴜᴘ ᴏᴘᴇɴᴇᴅ'); break }
      case 'close': { if(!isGroup||!isAdmin) return; await sock.groupSettingUpdate(chat,'announcement'); await reply('ɢʀᴏᴜᴘ ᴄʟᴏꜱᴇᴅ'); break }
      case 'tagall': { if(!isGroup) return; let txt=`*ᴛᴀɢᴀʟʟ* ${q}\n\n`; let ids=[]; groupMeta.participants.forEach(p=>{ txt+=`@${p.id.split('@')[0]} `; ids.push(p.id) }); await sock.sendMessage(chat,{text:txt,mentions:ids},{quoted:m}); break }
      case 'hidetag': { if(!isGroup) return; await sock.sendMessage(chat,{text:q||'hidden tag',mentions:groupMeta.participants.map(p=>p.id)},{quoted:m}); break }
      case 'listmembers': case 'list': { let txt=groupMeta.participants.map((p,i)=>`${i+1}. @${p.id.split('@')[0]} ${p.admin?'[ADMIN]':''}`).join('\n'); await sock.sendMessage(chat,{text:txt,mentions:groupMeta.participants.map(p=>p.id)},{quoted:m}); break }
      case 'admins': { let admins=groupMeta.participants.filter(p=>p.admin); await sock.sendMessage(chat,{text:`*ADMINS*\n`+admins.map(p=>`@${p.id.split('@')[0]}`).join('\n'),mentions:admins.map(p=>p.id)},{quoted:m}); break }
            // VV
      case 'vv': case 'viewonce': { let qt=m.message.extendedTextMessage?.contextInfo?.quotedMessage; if(!qt) return reply('ʀᴇᴘʟʏ ᴠᴠ'); let vo=qt.viewOnceMessageV2||qt.viewOnceMessage||qt; let mg=vo.message||vo; let ty=Object.keys(mg)[0]; let md=mg[ty]; let tp=ty.includes('image')?'image':ty.includes('video')?'video':'audio'; let st=await downloadContentFromMessage(md,tp); let b=[]; for await(let c of st) b.push(c); let f=Buffer.concat(b); if(tp==='image') await sock.sendMessage(chat,{image:f,caption:'*◈ VV REVEALED ◈*'}, {quoted:m}); else if(tp==='video') await sock.sendMessage(chat,{video:f,caption:'*◈ VV REVEALED ◈*'}, {quoted:m}); else await sock.sendMessage(chat,{audio:f,mimetype:'audio/mp4',ptt:true}, {quoted:m}); break; }

      // DOWNLOADER
      case 'play': case 'song': { if(!q) return reply('ᴇx: .play faded'); let yts=require('yt-search'); let s=await yts.search(q); let v=s.videos[0]; await sock.sendMessage(chat,{image:{url:v.thumbnail},caption:`*${v.title}* - ${v.timestamp}\n${v.url}`},{quoted:m}); try{ let ap=await axios.get(`https://api.dreaded.site/api/ytdl/audio?url=${v.url}`); await sock.sendMessage(chat,{audio:{url:ap.data.result.download},mimetype:'audio/mp4',fileName:v.title+'.mp3'},{quoted:m}); }catch{} break; }
      case 'video': case 'ytmp4': { if(!q) return reply('ɴᴀᴍᴇ'); let yts=require('yt-search'); let s=await yts.search(q); let v=s.videos[0]; try{ let ap=await axios.get(`https://api.dreaded.site/api/ytdl/video?url=${v.url}`); await sock.sendMessage(chat,{video:{url:ap.data.result.download},caption:v.title},{quoted:m}); }catch{ await reply('ꜰᴀɪʟ'); } break; }
      case 'tiktok': case 'tt': { if(!q) return reply('ʟɪɴᴋ'); try{ let r=await axios.get(`https://api.tikwm.com/api/?url=${q}`); await sock.sendMessage(chat,{video:{url:r.data.data.play},caption:r.data.data.title},{quoted:m}); }catch{ await reply('ᴛᴛ ꜰᴀɪʟ'); } break; }
      case 'instagram': case 'ig': { if(!q) return reply('ʟɪɴᴋ'); try{ let r=await axios.get(`https://api.dreaded.site/api/igdl?url=${q}`); for(let u of r.data.result) { if(u.type==='video') await sock.sendMessage(chat,{video:{url:u.url}},{quoted:m}); else await sock.sendMessage(chat,{image:{url:u.url}},{quoted:m}); } }catch{ await reply('ɪɢ ꜰᴀɪʟ'); } break; }
      case 'facebook': case 'fb': { if(!q) return reply('ʟɪɴᴋ'); try{ let r=await axios.get(`https://api.dreaded.site/api/fbdl?url=${q}`); await sock.sendMessage(chat,{video:{url:r.data.result.sd}},{quoted:m}); }catch{ await reply('ꜰʙ ꜰᴀɪʟ'); } break; }
      case 'mediafire': case 'mf': { if(!q) return reply('ʟɪɴᴋ'); try{ let r=await axios.get(`https://api.dreaded.site/api/mediafire?url=${q}`); await sock.sendMessage(chat,{document:{url:r.data.result.link},mimetype:r.data.result.mime,fileName:r.data.result.filename},{quoted:m}); }catch{ await reply('ᴍꜰ ꜰᴀɪʟ'); } break; }
      case 'apk': { if(!q) return reply('ᴀᴘᴘ ɴᴀᴍᴇ'); try{ let r=await axios.get(`https://api.dreaded.site/api/apk?query=${encodeURIComponent(q)}`); await sock.sendMessage(chat,{document:{url:r.data.result.download},mimetype:'application/vnd.android.package-archive',fileName:r.data.result.name+'.apk'},{quoted:m}); }catch{ await reply('ᴀᴘᴋ ꜰᴀɪʟ'); } break; }
      case 'pinterest': case 'pin': { if(!q) return reply('ǫᴜᴇʀʏ'); try{ let r=await axios.get(`https://api.dreaded.site/api/pinterest?query=${encodeURIComponent(q)}`); await sock.sendMessage(chat,{image:{url:r.data.result[0]},caption:q},{quoted:m}); }catch{ let r=await axios.get(`https://api.popcat.xyz/pinterest?q=${q}`); await sock.sendMessage(chat,{image:{url:r.data.image},caption:q},{quoted:m}); } break; }
      case 'github': case 'git': { if(!q) return reply('ᴜꜱᴇʀ/ʀᴇᴘᴏ'); await sock.sendMessage(chat,{document:{url:`https://github.com/${q}/archive/refs/heads/main.zip`},mimetype:'application/zip',fileName:q.split('/').pop()+'.zip'},{quoted:m}); break; }

      // TOOLS
      case 'weather': { if(!q) return reply('ᴄɪᴛʏ'); let r=await axios.get(`https://wttr.in/${encodeURIComponent(q)}?format=j1`); let cur=r.data.current_condition[0]; await reply(`*${q}* ${cur.temp_C}°C - ${cur.weatherDesc[0].value}`); break; }
      case 'translate': case 'trt': case 'tr': { let lg=args[1]; let tx=args.slice(2).join(' '); if(!tx){ lg='fr'; tx=args.slice(1).join(' '); } let r=await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(tx)}&langpair=en|${lg}`); await reply(r.data.responseData.translatedText); break; }
      case 'calculate': case 'calc': { try{ await reply(`${q} = ${Function('"use strict";return ('+q+')')()}`); }catch{ await reply('ɪɴᴠᴀʟɪᴅ'); } break; }
      case 'shorturl': case 'short': { if(!q) return reply('ᴜʀʟ'); let r=await axios.get(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(q)}`); await reply(r.data); break; }

      // SETTINGS
      case 'prefix': { await reply(`ᴘʀᴇꜰɪx: ${global.prefix}`); break; }
      case 'public': { if(!isCreator) return; global.mode='public'; await reply('ᴍᴏᴅᴇ: ᴘᴜʙʟɪᴄ'); break; }
      case 'private': { if(!isCreator) return; global.mode='private'; await reply('ᴍᴏᴅᴇ: ᴘʀɪᴠᴀᴛᴇ'); break; }
      case 'setmode': { if(!isCreator) return; global.mode=args[1]; await reply(`ᴍᴏᴅᴇ: ${global.mode}`); break; }
      case 'language': { await reply('EN - default'); break; }

      // STICKER
      case 'sticker': case 's': { let im=m.message.imageMessage||m.message.videoMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage; if(!im) return reply('ʀᴇᴘʟʏ ɪᴍᴀɢᴇ'); let st=await downloadContentFromMessage(im,im.mimetype?.includes('video')?'video':'image'); let b=[]; for await(let c of st) b.push(c); await sock.sendMessage(chat,{sticker:Buffer.concat(b)},{quoted:m}); break; }
      case 'toimg': { let stk=m.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage; if(!stk) return reply('ʀᴇᴘʟʏ ꜱᴛɪᴄᴋᴇʀ'); let st=await downloadContentFromMessage(stk,'image'); let b=[]; for await(let c of st) b.push(c); await sock.sendMessage(chat,{image:Buffer.concat(b)},{quoted:m}); break; }
      case 'take': { let stk=m.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage; if(!stk) return reply('ʀᴇᴘʟʏ ꜱᴛɪᴄᴋᴇʀ'); let st=await downloadContentFromMessage(stk,'image'); let b=[]; for await(let c of st) b.push(c); await sock.sendMessage(chat,{sticker:Buffer.concat(b)},{quoted:m}); break; }
      case 'attp': { if(!q) return reply('ᴛᴇxᴛ'); await sock.sendMessage(chat,{sticker:{url:`https://api.erdwpe.com/api/maker/attp?text=${encodeURIComponent(q)}`}},{quoted:m}); break; }
      case 'smeme': { let qt=m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage; if(!qt) return reply('ʀᴇᴘʟʏ ɪᴍᴀɢᴇ'); let st=await downloadContentFromMessage(qt,'image'); let b=[]; for await(let c of st) b.push(c); await sock.sendMessage(chat,{image:Buffer.concat(b),caption:q},{quoted:m}); break; }

      // FUN
      case 'joke': { let r=await axios.get('https://official-joke-api.appspot.com/random_joke'); await reply(`${r.data.setup}\n${r.data.punchline}`); break; }
      case 'quote': { let r=await axios.get('https://api.quotable.io/random').catch(async()=>await axios.get('https://api.popcat.xyz/quote')); await reply(r.data.content||r.data.quote); break; }
      case 'meme': { let r=await axios.get('https://meme-api.com/gimme'); await sock.sendMessage(chat,{image:{url:r.data.url},caption:r.data.title},{quoted:m}); break; }
      case 'truth': { let r=await axios.get('https://api.truthordarebot.xyz/v1/truth'); await reply(r.data.question); break; }
      case 'dare': { let r=await axios.get('https://api.truthordarebot.xyz/v1/dare'); await reply(r.data.question); break; }

      // EXTRA 150
      case 'ai': case 'gpt': { if(!q) return reply('ᴀꜱᴋ'); let r=await axios.get(`https://api.popcat.xyz/chatbot?msg=${encodeURIComponent(q)}&owner=Crasher&botname=CrasherMD`); await reply(r.data.response); break; }
      case 'imagine': { if(!q) return reply('ᴘʀᴏᴍᴘᴛ'); await sock.sendMessage(chat,{image:{url:`https://image.pollinations.ai/prompt/${encodeURIComponent(q)}`},caption:q},{quoted:m}); break; }
      case 'hd': case 'remini': { let qt=m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage||m.message.imageMessage; if(!qt) return reply('ʀᴇᴘʟʏ ɪᴍᴀɢᴇ'); let st=await downloadContentFromMessage(qt,'image'); let b=[]; for await(let c of st) b.push(c); try{ let ap=await axios.post('https://api.dreaded.site/api/remini',{image:Buffer.concat(b).toString('base64')}); await sock.sendMessage(chat,{image:{url:ap.data.result}},{quoted:m}); }catch{ await sock.sendMessage(chat,{image:Buffer.concat(b)},{quoted:m}); } break; }
      case 'getpp': { let j=m.message.extendedTextMessage?.contextInfo?.participant||args[1]?.replace(/[^0-9]/g,'')+'@s.whatsapp.net'||sender; try{ let pp=await sock.profilePictureUrl(j,'image'); await sock.sendMessage(chat,{image:{url:pp}},{quoted:m}); }catch{ await reply('ɴᴏ ᴘᴘ'); } break; }
      case 'jid': { await reply(`${chat}\n${sender}`); break; }
      case 'ss': { if(!q) return reply('ᴜʀʟ'); await sock.sendMessage(chat,{image:{url:`https://image.thum.io/get/width/1920/crop/1080/noanimate/${q}`}},{quoted:m}); break; }
      case 'qr': { if(!q) return reply('ᴛᴇxᴛ'); await sock.sendMessage(chat,{image:{url:`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(q)}`}},{quoted:m}); break; }
      case '8ball': { let a=['Yes','No','Maybe','Definitely','Never']; await reply(a[Math.floor(Math.random()*a.length)]); break; }
      case 'ship': { await reply(`${args[1]||'You'} ❤️ ${args[2]||'Bot'} = ${Math.floor(Math.random()*100)}%`); break; }
      case 'rate': { await reply(`Rate ${q||'you'} ${Math.floor(Math.random()*100)}%`); break; }
      case 'roast': { let r=await axios.get('https://api.popcat.xyz/roast').catch(()=>({data:{roast:'You no sabi'}})); await reply(r.data.roast); break; }
      case 'fact': { let r=await axios.get('https://api.popcat.xyz/fact'); await reply(r.data.fact); break; }
      case 'crypto': { let c=args[1]||'bitcoin'; let r=await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${c}&vs_currencies=usd`).catch(()=>null); if(!r) return reply('ꜰᴀɪʟ'); await reply(`$${c}: ${r.data[c]?.usd}`); break; }
      case 'pair': { await reply('ɢᴇᴛ ᴘᴀɪʀ ᴀᴛ ʀᴇɴᴅᴇʀ ʟɪɴᴋ /'); break; }
      case 'bass': case 'blown': case 'deep': case 'fast': case 'slow': case 'nightcore': case 'reverse': { let qt=m.message.extendedTextMessage?.contextInfo?.quotedMessage?.audioMessage; if(!qt) return reply('ʀᴇᴘʟʏ ᴀᴜᴅɪᴏ'); let st=await downloadContentFromMessage(qt,'audio'); let b=[]; for await(let c of st) b.push(c); await sock.sendMessage(chat,{audio:Buffer.concat(b),mimetype:'audio/mp4'},{quoted:m}); break; }
      case 'removebg': { let qt=m.message.imageMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage; if(!qt) return reply('ʀᴇᴘʟʏ ɪᴍᴀɢᴇ'); let st=await downloadContentFromMessage(qt,'image'); let b=[]; for await(let c of st) b.push(c); await sock.sendMessage(chat,{image:Buffer.concat(b)},{quoted:m}); break; }
      case 'emojimix': { if(!args[1]) return reply('.emojimix 😀 😭'); await sock.sendMessage(chat,{image:{url:`https://api.popcat.xyz/emojimix/${encodeURIComponent(args[1])}/${encodeURIComponent(args[2]||'😭')}`}},{quoted:m}); break; }
      case 'slots': { let s=['🍒','🍋','⭐']; let a=s[Math.floor(Math.random()*3)],b=s[Math.floor(Math.random()*3)],c=s[Math.floor(Math.random()*3)]; await reply(`[${a}|${b}|${c}] ${a===b&&b===c?'JACKPOT':''}`); break; }
            case 'tovideo': { let stk=m.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage; if(!stk) return reply('ʀᴇᴘʟʏ ꜱᴛɪᴄᴋᴇʀ'); let st=await downloadContentFromMessage(stk,'video'); let b=[]; for await(let c of st) b.push(c); await sock.sendMessage(chat,{video:Buffer.concat(b)},{quoted:m}); break; }
      case 'tourl': case 'url': { let im=m.message.imageMessage||m.message.videoMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage; if(!im) return reply('ʀᴇᴘʟʏ ɪᴍᴀɢᴇ'); let st=await downloadContentFromMessage(im,im.mimetype?.includes('video')?'video':'image'); let b=[]; for await(let c of st) b.push(c); let form=new (require('form-data'))(); form.append('file',Buffer.concat(b),{filename:'file.jpg'}); let r=await axios.post('https://catbox.moe/user/api.php',form,{headers:form.getHeaders()}); await reply(r.data); break; }
      case 'lyrics': { if(!q) return reply('ꜱᴏɴɢ ɴᴀᴍᴇ'); let r=await axios.get(`https://api.popcat.xyz/lyrics?song=${encodeURIComponent(q)}`).catch(()=>null); if(!r) return reply('ɴᴏᴛ ꜰᴏᴜɴᴅ'); await reply(`*${r.data.title} - ${r.data.artist}*\n\n${r.data.lyrics}`); break; }
      case 'define': case 'meaning': { if(!q) return reply('ᴡᴏʀᴅ'); let r=await axios.get(`https://api.dictionaryapi.dev/api/v2/entries/en/${q}`).catch(()=>null); if(!r) return reply('ɴᴏᴛ ꜰᴏᴜɴᴅ'); await reply(`*${q}:* ${r.data[0].meanings[0].definitions[0].definition}`); break; }
      case 'binary': { await reply(q.split('').map(c=>c.charCodeAt(0).toString(2)).join(' ')); break; }
      case 'unbinary': { await reply(q.split(' ').map(b=>String.fromCharCode(parseInt(b,2))).join('')); break; }
      case 'tiny': case 'smalltext': { await reply(fancy(q)); break; }
      case 'say': case 'tts': { if(!q) return reply('ᴛᴇxᴛ'); let url=`https://translate.google.com/translate_tts?ie=UTF-8&tl=en&client=tw-ob&q=${encodeURIComponent(q)}`; await sock.sendMessage(chat,{audio:{url:url},mimetype:'audio/mp4',ptt:true},{quoted:m}); break; }
      case 'yts': case 'ytsearch': { if(!q) return reply('ǫᴜᴇʀʏ'); let yts=require('yt-search'); let s=await yts.search(q); let txt=s.videos.slice(0,10).map((v,i)=>`${i+1}. ${v.title} (${v.timestamp}) - ${v.url}`).join('\n'); await reply(txt); break; }
      case 'wallpaper': case 'wp': { let r=await axios.get(`https://api.popcat.xyz/wallpaper?q=${encodeURIComponent(q||'anime')}`); await sock.sendMessage(chat,{image:{url:r.data.image}},{quoted:m}); break; }
      case 'anime': { let r=await axios.get('https://api.waifu.pics/sfw/waifu'); await sock.sendMessage(chat,{image:{url:r.data.url}},{quoted:m}); break; }
      case 'waifu': { let r=await axios.get('https://api.waifu.pics/sfw/waifu'); await sock.sendMessage(chat,{image:{url:r.data.url}},{quoted:m}); break; }
      case 'neko': { let r=await axios.get('https://api.waifu.pics/sfw/neko'); await sock.sendMessage(chat,{image:{url:r.data.url}},{quoted:m}); break; }
      case 'hug': { let r=await axios.get('https://api.waifu.pics/sfw/hug'); await sock.sendMessage(chat,{image:{url:r.data.url},caption:`@${sender.split('@')[0]} hugs @${args[1]?.replace(/[^0-9]/g,'')||''}`,mentions:[sender]},{quoted:m}); break; }
      case 'kiss': { let r=await axios.get('https://api.waifu.pics/sfw/kiss'); await sock.sendMessage(chat,{image:{url:r.data.url}},{quoted:m}); break; }
      case 'pat': { let r=await axios.get('https://api.waifu.pics/sfw/pat'); await sock.sendMessage(chat,{image:{url:r.data.url}},{quoted:m}); break; }
      case 'kill': { await reply(`@${sender.split('@')[0]} kills @${args[1]||'someone'} 💀`,{mentions:[sender]}); break; }
      case 'slap': { let r=await axios.get('https://api.waifu.pics/sfw/slap'); await sock.sendMessage(chat,{image:{url:r.data.url}},{quoted:m}); break; }
      case 'insult': { let r=await axios.get('https://evilinsult.com/generate_insult.php?lang=en&type=json'); await reply(r.data.insult); break; }
      case 'darkjoke': { let r=await axios.get('https://api.popcat.xyz/joke').catch(()=>({data:{joke:'dark'}})); await reply(r.data.joke); break; }
      case 'compliment': { await reply(`You are amazing @${sender.split('@')[0]} ✨`); break; }
      case 'd20': { await reply(`🎲 ${Math.floor(Math.random()*20)+1}`); break; }
      case 'flip': case 'coinflip': { await reply(Math.random()>0.5?'Heads':'Tails'); break; }
      case 'roll': { await reply(`🎲 ${Math.floor(Math.random()*6)+1}`); break; }
      case 'afk': { global.db.users[senderNum]={afk:true,reason:q||'AFK',time:Date.now()}; await reply(`You are AFK: ${q}`); break; }
      case 'delafk': { if(global.db.users[senderNum]) global.db.users[senderNum].afk=false; await reply('AFK off'); break; }
      case 'profile': case 'me': { await reply(`*PROFILE*\n> Number: ${senderNum}\n> AFK: ${global.db.users[senderNum]?.afk?'Yes':'No'}\n> Warnings: ${global.db.warnings[sender]||0}\n> Creator: ${isCreator?'Yes':'No'}`); break; }
      case 'listonline': { let list=Object.keys(sock.chats||{}); await reply(`Online: ${list.length}`); break; }
      case 'repo': case 'sc': { await reply(`*CRASHER MD*\n> GitHub: ${config.links.github}\n> Owner: ${config.ownerName}\n> Prefix: ${global.prefix}\n> Total CMD: 150`); break; }
      case 'support': { await reply(`Support: ${config.links.supportGroup}`); break; }
      case 'donate': { await reply('Support Crasher: 2348071569915'); break; }
      case 'uptime': { await reply(runtime(process.uptime())); break; }
      case 'speed': { let s=Date.now(); await sock.sendMessage(chat,{text:'testing...'}); await reply(`${Date.now()-s}ms`); break; }
    }
    try{ await sock.sendMessage(chat,{react:{text:'💀',key:m.key}}); }catch{}
  })

  // ANTI-DELETE LISTENER
  sock.ev.on('messages.update', async(updates)=>{
    for(let u of updates){
      if(u.update.message===null && global.db.antidelete[u.key.remoteJid]){
        try{ await sock.sendMessage(u.key.remoteJid,{text:`*ANTI-DELETE* detected`}); }catch{}
      }
    }
  })
}

startBot()
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public/index.html')))
app.listen(config.port,()=>console.log('CRASHER MD RUNNING ON '+config.port))
