require('dotenv').config()
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, jidNormalizedUser, Browsers, delay, downloadContentFromMessage } = require('@whiskeysockets/baileys')
const { Boom } = require('@hapi/boom')
const pino = require('pino')
const express = require('express')
const path = require('path')
const chalk = require('chalk')
const axios = require('axios')
const fs = require('fs')
const config = require('./config')

const app = express()
let sock = null
let isConnecting = false
const groupCache = new Map()

function fancy(t){const m={a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ғ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ'};let r='';for(let c of t)r+=m[c]||m[c.toLowerCase()]||c;return r}
function runtime(s){s=Number(s);let d=Math.floor(s/86400),h=Math.floor(s%86400/3600),mm=Math.floor(s%3600/60),ss=Math.floor(s%60);return `${d}d ${h}h ${mm}m ${ss}s`}
async function getBuffer(u){let r=await axios.get(u,{responseType:'arraybuffer'});return Buffer.from(r.data)}

// SET YOUR PFP HERE
config.pfp = config.pfp || "https://files.catbox.moe/hhafg3.jpg"

global.db = global.db || { auto:{autoread:false,autotyping:false,autoonline:true,autorecording:false,autoreact:true,autoreply:false,autosticker:false,autoview:true,autobio:false,autolikestatus:true}, antilink:{}, antibot:{}, antispam:{}, antiflood:{}, antitag:{}, antidelete:{}, antibad:{}, antisticker:{}, antifake:{}, antipromote:{}, anticall:{}, warnings:{}, users:{}, chat:{}, settings:{mode:config.mode||'public',prefix:config.prefix||'.'} }

app.use(express.static(path.join(__dirname, 'public')))
app.get('/', (req,res)=>res.sendFile(path.join(__dirname,'public','index.html')))
app.get('/pair', async(req,res)=>{
  const number=(req.query.number||'').replace(/\D/g,'')
  if(!number||number.length<10) return res.json({error:'Invalid number use 234...'})
  if(!sock){await delay(2000); if(!sock) return res.json({error:'Bot starting wait 5s'})}
  if(sock.authState.creds.registered) return res.json({error:'Already linked delete session'})
  try{await delay(1200);let code=await sock.requestPairingCode(number);code=code?.match(/.{1,4}/g)?.join('-')||code;console.log(chalk.green(`[PAIR] ${code} for ${number}`));res.json({code})}catch(e){res.json({error:e.message})}
})
app.listen(process.env.PORT||config.port||3000,()=>console.log('[WEB] Ready'))

async function startCrasher(){
  if(isConnecting) return; isConnecting=true
  const { state, saveCreds } = await useMultiFileAuthState(config.sessionFolder||'./session')
  const { version } = await fetchLatestBaileysVersion()
  sock = makeWASocket({version, logger:pino({level:'silent'}), printQRInTerminal:false, auth:{creds:state.creds, keys:makeCacheableSignalKeyStore(state.keys,pino({level:'silent'}))}, browser:Browsers.ubuntu('Chrome'), markOnlineOnConnect:false, getMessage:async()=>undefined})
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', async(u)=>{
    const {connection,lastDisconnect}=u
    if(connection==='open'){isConnecting=false;console.log(chalk.green('CONNECTED'));try{let b=await getBuffer(config.pfp);await sock.updateProfilePicture(sock.user.id,b).catch(()=>{})}catch{};await sock.sendMessage(jidNormalizedUser(config.owner[0]+'@s.whatsapp.net'),{text:`◈┈▉ \`ｃｒａｓｈｅｒ ｍｄ\` ▉┄◈\n> Connected\n> Prefix: ${config.prefix}\n> Mode: ${config.mode}\n\n> ⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴄʀᴀꜱʜᴇʀ xᴅ`}).catch(()=>{})}
    if(connection==='close'){isConnecting=false;const code=lastDisconnect?.error instanceof Boom?lastDisconnect.error.output?.statusCode:0;if(code!==DisconnectReason.loggedOut){await delay(3000);startCrasher()}}
  })
  sock.ev.on('messages.upsert', async({messages,type})=>{
    if(type!=='notify') return; const m=messages[0]; if(!m.message||m.key.remoteJid==='status@broadcast') return; try{await handleMessage(m)}catch(e){console.error(e)}
  })
}

async function handleMessage(m){
  const from=m.key.remoteJid; 
  const isGroup=from.endsWith('@g.us')
  const body=(m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||m.message.videoMessage?.caption||'').trim(); 
  if(!body) return
  
  const rawSender = m.key.participant || from
  const sender = jidNormalizedUser(rawSender)
  const senderNum = sender.split('@')[0].replace(/[^0-9]/g,'').replace(/:.*/, '')
  const ownerList = [...(config.owner||[]), ...(config.sudo||[])].map(n=>n.replace(/[^0-9]/g,''))
  const isCreator = ownerList.includes(senderNum) || m.key.fromMe
  if(global.db.users[senderNum]?.banned && !isCreator) return

  if(global.db.auto.autoread) await sock.readMessages([m.key]).catch(()=>{})
  if(global.db.auto.autoonline) await sock.sendPresenceUpdate('available',{}).catch(()=>{})
  if(global.db.auto.autotyping) await sock.sendPresenceUpdate('composing',{to:from}).catch(()=>{})
  if(global.db.auto.autorecording) await sock.sendPresenceUpdate('recording',{to:from}).catch(()=>{})
  if(global.db.auto.autoreact){try{await sock.sendMessage(from,{react:{text:['💀','🔥','🐺','⚡'][Math.floor(Math.random()*4)],key:m.key}})}catch{}}
  if(from.includes('status')&&global.db.auto.autoview){await sock.readMessages([m.key]).catch(()=>{});if(global.db.auto.autolikestatus)try{await sock.sendMessage(from,{react:{text:'🔥',key:m.key}},{statusJidList:[sender]})}catch{}}
  
  if(isGroup){
    if(global.db.antilink[from]&&body.match(/https:\/\/chat.whatsapp.com|wa.me|t.me|https:\/\/wa.me/)){
      try{let meta=await sock.groupMetadata(from);let admin=!!meta.participants.find(p=>jidNormalizedUser(p.id)===sender)?.admin;let botAdmin=!!meta.participants.find(p=>jidNormalizedUser(p.id)===jidNormalizedUser(sock.user.id))?.admin;if(!admin&&botAdmin&&!isCreator){await sock.sendMessage(from,{delete:m.key}).catch(()=>{});await sock.groupParticipantsUpdate(from,[rawSender],'remove').catch(()=>{})}}catch{}
    }
    if(global.db.antibot[from]&&m.key.id.startsWith('BAE5')){try{await sock.sendMessage(from,{delete:m.key}).catch(()=>{});}catch{}}
  }

  if(!body.startsWith(config.prefix)) { if(global.db.auto.autoreply&&!isGroup) await sock.sendMessage(from,{text:`Hey! I am CRASHER MD\nType ${config.prefix}menu\n\n> ⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴄʀᴀꜱʜᴇʀ xᴅ`},{quoted:m}).catch(()=>{}); return }
  const args=body.slice(config.prefix.length).trim().split(/ +/); const command=args.shift().toLowerCase(); const q=args.join(' ')
  
  const currentMode = config.mode || global.db.settings.mode
  if(currentMode === 'private' && !isCreator) return
  if(currentMode === 'self' && !isCreator) return

  try{await sock.sendMessage(from,{react:{text:'⏳',key:m.key}})}catch{}
  let groupMeta,isAdmin=false,isBotAdmin=false
  if(isGroup){try{if(groupCache.has(from)&&Date.now()-groupCache.get(from).time<60000)groupMeta=groupCache.get(from).data;else{groupMeta=await sock.groupMetadata(from);groupCache.set(from,{data:groupMeta,time:Date.now()})}const bId=jidNormalizedUser(sock.user.id),sId=sender;for(let p of groupMeta.participants){if(!p.admin)continue;const pid=jidNormalizedUser(p.id);if(pid===bId)isBotAdmin=true;if(pid===sId)isAdmin=true}if(isCreator)isAdmin=true}catch{}}
  
  // === THIS IS WHERE POWER BY CRASHER XD APPEARS EVERYWHERE ===
  const reply=async(t)=>{try{await sock.sendMessage(from,{text:`◈┈▉ \`ｃｒａｓｈｅｒ ｍｄ\` ▉┄◈\n> ${t}\n\n> ⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴄʀᴀꜱʜᴇʀ xᴅ\n> ⚡ ᴘᴏᴡᴇʀ • ꜱᴘᴇᴇᴅ • ᴄᴏɴᴛʀᴏʟ`},{quoted:m});await sock.sendMessage(from,{react:{text:'💀',key:m.key}})}catch{}}
  
  const ownerOnly=()=>reply('ᴏᴡɴᴇʀ ᴏɴʟʏ'); const adminOnly=()=>reply('ᴀᴅᴍɪɴ ᴏɴʟʏ'); const botAdmin=()=>reply('ʙᴏᴛ ɴᴏᴛ ᴀᴅᴍɪɴ')
  const getTarget=()=>{let j=m.message.extendedTextMessage?.contextInfo?.participant; if(j) return jidNormalizedUser(j); if(args[0]) return jidNormalizedUser(args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net'); return null}

    // MENU - NEW CRASHER STYLE WITH PFP
  if(command==='menu'||command==='help'||command==='list'){
    let totalCmds = 250
    let uptime = runtime(process.uptime())
    let mode = config.mode || global.db.settings.mode
    let txt = `◈┈▉ \`ｃｒａｓｈｅｒ ｍｄ\` ▉┄◈
> *THE ULTIMATE WHATSAPP BOT*

╭─⬡ *BOT INFO* ⬡─
│ ◦ *Owner:* ${config.ownerName}
│ ◦ *Bot:* ${config.botName}
│ ◦ *Prefix:* [ ${config.prefix} ]
│ ◦ *Mode:* ${mode.toUpperCase()}
│ ◦ *Cmds:* ${totalCmds}+
│ ◦ *Uptime:* ${uptime}
│ ◦ *Platform:* ${process.platform}
╰──────────⬡

╭─⬡ *OWNER MENU* ⬡─
│ ◦ ${config.prefix}menu | ${config.prefix}ping | ${config.prefix}alive
│ ◦ ${config.prefix}owner | ${config.prefix}runtime | ${config.prefix}botinfo
│ ◦ ${config.prefix}restart | ${config.prefix}shutdown
│ ◦ ${config.prefix}broadcast | ${config.prefix}setprefix
│ ◦ ${config.prefix}setname | ${config.prefix}setbio | ${config.prefix}setpp
│ ◦ ${config.prefix}join | ${config.prefix}leave
│ ◦ ${config.prefix}block | ${config.prefix}unblock
│ ◦ ${config.prefix}ban | ${config.prefix}unban | ${config.prefix}listban
│ ◦ ${config.prefix}clearsession
╰──────────⬡

╭─⬡ *AUTO MENU* ⬡─
│ ◦ ${config.prefix}autoread | ${config.prefix}autotyping
│ ◦ ${config.prefix}autoonline | ${config.prefix}autorecording
│ ◦ ${config.prefix}autoreact | ${config.prefix}autoreply
│ ◦ ${config.prefix}autosticker | ${config.prefix}autoview
│ ◦ ${config.prefix}autobio | ${config.prefix}autolikestatus
╰──────────⬡

╭─⬡ *ANTI MENU* ⬡─
│ ◦ ${config.prefix}antilink | ${config.prefix}antibot
│ ◦ ${config.prefix}antispam | ${config.prefix}antiflood
│ ◦ ${config.prefix}antitag | ${config.prefix}antidelete
│ ◦ ${config.prefix}antibadword | ${config.prefix}antisticker
│ ◦ ${config.prefix}antifake | ${config.prefix}antipromote
│ ◦ ${config.prefix}anticall
╰──────────⬡

╭─⬡ *GROUP MENU* ⬡─
│ ◦ ${config.prefix}groupinfo | ${config.prefix}grouplink
│ ◦ ${config.prefix}setnamegc | ${config.prefix}setdesc
│ ◦ ${config.prefix}open | ${config.prefix}close
│ ◦ ${config.prefix}tagall | ${config.prefix}hidetag
│ ◦ ${config.prefix}kick | ${config.prefix}add
│ ◦ ${config.prefix}promote | ${config.prefix}demote
│ ◦ ${config.prefix}warn | ${config.prefix}warnings | ${config.prefix}resetwarn
│ ◦ ${config.prefix}mute | ${config.prefix}unmute
│ ◦ ${config.prefix}delete | ${config.prefix}kickall
│ ◦ ${config.prefix}listmembers | ${config.prefix}admins | ${config.prefix}revoke
╰──────────⬡

╭─⬡ *DOWNLOADER* ⬡─
│ ◦ ${config.prefix}play | ${config.prefix}song | ${config.prefix}video
│ ◦ ${config.prefix}tiktok | ${config.prefix}instagram
│ ◦ ${config.prefix}facebook | ${config.prefix}mediafire
│ ◦ ${config.prefix}apk | ${config.prefix}pinterest
│ ◦ ${config.prefix}twitter | ${config.prefix}threads
╰──────────⬡

╭─⬡ *TOOLS & FUN* ⬡─
│ ◦ ${config.prefix}sticker | ${config.prefix}s | ${config.prefix}toimg
│ ◦ ${config.prefix}weather | ${config.prefix}translate
│ ◦ ${config.prefix}calculate | ${config.prefix}shorturl
│ ◦ ${config.prefix}vv | ${config.prefix}vv2 | ${config.prefix}tourl
│ ◦ ${config.prefix}joke | ${config.prefix}quote | ${config.prefix}meme
│ ◦ ${config.prefix}truth | ${config.prefix}dare
╰──────────⬡

> ⚡ ᴘᴏᴡᴇʀ • ꜱᴘᴇᴇᴅ • ᴄᴏɴᴛʀᴏʟ - CRASHER MD`

    try {
      let pfpBuffer = await getBuffer("https://files.catbox.moe/hhafg3.jpg")
      await sock.sendMessage(from, { image: pfpBuffer, caption: txt }, { quoted: m })
      await sock.sendMessage(from, { react: { text: '💀', key: m.key } })
    } catch {
      // fallback to text if image fails
      return reply(txt)
    }
    return
        }

  switch(command){
    // OWNER 20
    case 'ping':{let s=Date.now();await sock.sendMessage(from,{text:'pong'},{quoted:m});await reply(`PING: ${Date.now()-s}ms`);break}
    case 'alive':{await reply(`ALIVE!\nBOT: ${config.botName}\nUPTIME: ${runtime(process.uptime())}\nMODE: ${global.db.settings.mode}`);break}
    case 'owner':{await sock.sendMessage(from,{contacts:{displayName:config.ownerName,contacts:[{vcard:`BEGIN:VCARD\nVERSION:3.0\nFN:${config.ownerName}\nTEL;type=CELL;type=VOICE;waid=${config.owner[0]}:+${config.owner[0]}\nEND:VCARD`}] }},{quoted:m});break}
    case 'runtime':{await reply(runtime(process.uptime()));break}
    case 'botinfo':{await reply(`BOT: ${config.botName}\nPREFIX: ${config.prefix}\nPLATFORM: ${process.platform}\nNODE: ${process.version}\nUSERS: ${Object.keys(global.db.users).length}\nGROUPS: ${Object.keys(global.db.antilink).length}`);break}
    case 'restart':{if(!isCreator) return ownerOnly();await reply('Restarting...');setTimeout(()=>process.exit(0),1000);break}
    case 'shutdown':{if(!isCreator) return ownerOnly();await reply('Shutdown...');process.exit(1);break}
    case 'broadcast':{if(!isCreator) return ownerOnly();if(!q) return reply('Text need');let groups=await sock.groupFetchAllParticipating();let c=0;for(let id in groups){await sock.sendMessage(id,{text:`📢 BROADCAST\n\n${q}`}).catch(()=>{});c++;await delay(800)}await reply(`Done to ${c} groups`);break}
    case 'setprefix':case 'setprefi':{if(!isCreator) return ownerOnly();if(!args[0]) return reply('Ex: .setprefix !');config.prefix=args[0];global.db.settings.prefix=args[0];await reply(`Prefix changed to ${args[0]}`);break}
    case 'setname':{if(!q) return reply('Name need');if(isGroup){if(!isAdmin) return adminOnly();if(!isBotAdmin) return botAdmin();await sock.groupUpdateSubject(from,q);await reply(`Group name changed to ${q}`)}else{if(!isCreator) return ownerOnly();await sock.updateProfileName(q);await reply(`Bot name changed to ${q}`)}break}
    case 'setnamegc':{if(!isGroup||!isAdmin) return adminOnly();await sock.groupUpdateSubject(from,q);await reply('Updated');break}
    case 'setbio':{if(!isCreator) return ownerOnly();await sock.updateProfileStatus(q);await reply('Bio updated');break}
    case 'welcomeai':{if(args[0]==='on'){global.welcomeAI=global.welcomeAI||{};global.welcomeAI[from]=true;reply(fancy('welcome ai voice on'))}else{global.welcomeAI&&delete global.welcomeAI[from];reply(fancy('welcome ai off'))}break}
    case 'ghostviewai':{if(!qmsg)return reply(fancy('reply to viewonce'));let m=qmsg.message?.viewOnceMessageV2?.message||qmsg.message?.viewOnceMessage?.message;let t=m?.imageMessage||m?.videoMessage;if(!t)return reply(fancy('no viewonce'));let b=await sock.downloadMediaMessage({message:{[t.mimetype.includes('image')?'imageMessage':'videoMessage']:t}});let a=await aiVision(b,'describe image short');await sock.sendMessage(from,{image:b,caption:`*${fancy('ghost ai')}*\n${a}\n\n${fancy('power by crasher xd')}`});break}
    case 'setpp':{if(!isCreator) return ownerOnly();let img=m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage||m.message.imageMessage;if(!img) return reply('Reply image');let st=await downloadContentFromMessage(img,'image');let bu=[];for await(let c of st)bu.push(c);await sock.updateProfilePicture(sock.user.id,Buffer.concat(bu));await reply('PP updated');break}
    case 'join':{if(!isCreator) return ownerOnly();if(!q) return reply('Link need');let code=q.split('/').pop();await sock.groupAcceptInvite(code);await reply('Joined');break}
    case 'leave':{if(isGroup&&!isCreator&&!isAdmin) return adminOnly();await reply('Leaving...');await sock.groupLeave(from);break}
    case 'block':{if(!isCreator) return ownerOnly();let j=getTarget();if(!j) return reply('Tag');await sock.updateBlockStatus(j,'block');await reply(`Blocked ${j.split('@')[0]}`);break}
    case 'unblock':{if(!isCreator) return ownerOnly();let j=args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net';await sock.updateBlockStatus(j,'unblock');await reply('Unblocked');break}
    case 'ban':{if(!isCreator) return ownerOnly();let num=args[0].replace(/[^0-9]/g,'');global.db.users[num]={banned:true};await reply(`Banned ${num}`);break}
    case 'unban':{if(!isCreator) return ownerOnly();let num=args[0].replace(/[^0-9]/g,'');delete global.db.users[num];await reply(`Unbanned ${num}`);break}
    case 'listban':{if(!isCreator) return ownerOnly();let list=Object.keys(global.db.users).filter(k=>global.db.users[k].banned);await reply(`Banned: ${list.join(', ')||'none'}`);break}
    case 'clearsession':{if(!isCreator) return ownerOnly();try{fs.rmSync('./session',{recursive:true,force:true})}catch{}await reply('Session cleared restart bot');break}

    // AUTO 10
    case 'autoread':{if(!isCreator) return ownerOnly();global.db.auto.autoread=!global.db.auto.autoread;await reply(`Autoread ${global.db.auto.autoread?'ON':'OFF'}`);break}
    case 'autotyping':{if(!isCreator) return ownerOnly();global.db.auto.autotyping=!global.db.auto.autotyping;await reply(`Autotyping ${global.db.auto.autotyping?'ON':'OFF'}`);break}
    case 'autoonline':{if(!isCreator) return ownerOnly();global.db.auto.autoonline=!global.db.auto.autoonline;await reply(`Autoonline ${global.db.auto.autoonline?'ON':'OFF'}`);break}
    case 'autorecording':{if(!isCreator) return ownerOnly();global.db.auto.autorecording=!global.db.auto.autorecording;await reply(`Autorecording ${global.db.auto.autorecording?'ON':'OFF'}`);break}
    case 'autoreact':{if(!isCreator) return ownerOnly();global.db.auto.autoreact=!global.db.auto.autoreact;await reply(`Autoreact ${global.db.auto.autoreact?'ON':'OFF'}`);break}
    case 'autoreply':{if(!isCreator) return ownerOnly();global.db.auto.autoreply=!global.db.auto.autoreply;await reply(`Autoreply ${global.db.auto.autoreply?'ON':'OFF'}`);break}
    case 'autosticker':{if(!isCreator) return ownerOnly();global.db.auto.autosticker=!global.db.auto.autosticker;await reply(`Autosticker ${global.db.auto.autosticker?'ON':'OFF'}`);break}
    case 'autoview':{if(!isCreator) return ownerOnly();global.db.auto.autoview=!global.db.auto.autoview;await reply(`Autoview ${global.db.auto.autoview?'ON':'OFF'}`);break}
    case 'autobio':{if(!isCreator) return ownerOnly();global.db.auto.autobio=!global.db.auto.autobio;if(global.db.auto.autobio){setInterval(async()=>{await sock.updateProfileStatus(`⚡ CRASHER MD | ${new Date().toLocaleTimeString()} | ${runtime(process.uptime())}`).catch(()=>{})},60000)}await reply(`Autobio ${global.db.auto.autobio?'ON':'OFF'}`);break}
    case 'autolikestatus':{if(!isCreator) return ownerOnly();global.db.auto.autolikestatus=!global.db.auto.autolikestatus;await reply(`Autolikestatus ${global.db.auto.autolikestatus?'ON':'OFF'}`);break}

    // ANTI 11
    case 'antilink':{if(!isGroup||!isAdmin) return adminOnly();global.db.antilink[from]=!global.db.antilink[from];await reply(`Antilink ${global.db.antilink[from]?'ON':'OFF'}`);break}
    case 'antibot':{if(!isGroup) return;global.db.antibot[from]=!global.db.antibot[from];await reply(`Antibot ${global.db.antibot[from]?'ON':'OFF'}`);break}
    case 'antispam':{if(!isGroup) return;global.db.antispam[from]=!global.db.antispam[from];await reply(`Antispam ${global.db.antispam[from]?'ON':'OFF'}`);break}
    case 'antiflood':{global.db.antiflood[from]=!global.db.antiflood[from];await reply(`Antiflood ${global.db.antiflood[from]?'ON':'OFF'}`);break}
    case 'antitag':{global.db.antitag[from]=!global.db.antitag[from];await reply(`Antitag ${global.db.antitag[from]?'ON':'OFF'}`);break}
    case 'antidelete':{global.db.antidelete[from]=!global.db.antidelete[from];await reply(`Antidelete ${global.db.antidelete[from]?'ON':'OFF'}`);break}
    case 'antibadword':{global.db.antibad[from]=!global.db.antibad[from];await reply(`Antibad ${global.db.antibad[from]?'ON':'OFF'}`);break}
    case 'antisticker':{global.db.antisticker[from]=!global.db.antisticker[from];await reply(`Antisticker ${global.db.antisticker[from]?'ON':'OFF'}`);break}
    case 'antifake':{global.db.antifake[from]=!global.db.antifake[from];await reply(`Antifake ${global.db.antifake[from]?'ON':'OFF'}`);break}
    case 'antipromote':{global.db.antipromote[from]=!global.db.antipromote[from];await reply(`Antipromote ${global.db.antipromote[from]?'ON':'OFF'}`);break}
    case 'anticall':{if(!isCreator) return ownerOnly();global.db.anticall[from]=!global.db.anticall[from];await reply(`Anticall ${global.db.anticall[from]?'ON':'OFF'}`);break}

    // MODERATOR
    case 'kick':{if(!isGroup||!isBotAdmin||!isAdmin) return adminOnly();let j=getTarget();if(!j) return reply('Mention');await sock.groupParticipantsUpdate(from,[j],'remove');await reply(`Kicked @${j.split('@')[0]}`);break}
    case 'add':{if(!isGroup||!isBotAdmin||!isAdmin) return adminOnly();let j=args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net';await sock.groupParticipantsUpdate(from,[j],'add');await reply('Added');break}
    case 'promote':{if(!isGroup||!isBotAdmin||!isAdmin) return adminOnly();let j=getTarget();await sock.groupParticipantsUpdate(from,[j],'promote');await reply('Promoted');break}
    case 'demote':{if(!isGroup||!isBotAdmin||!isAdmin) return adminOnly();let j=getTarget();await sock.groupParticipantsUpdate(from,[j],'demote');await reply('Demoted');break}
    case 'nightmode':{if(!isGroup)return reply(fancy('group only'));if(!isBotAdmin)return reply(fancy('bot admin'));let a=args[0];if(a==='on'){if(!global.nightMode)global.nightMode={};global.nightMode[from]=true;setInterval(async()=>{let h=new Date().getHours();try{if(h>=22)await sock.groupSettingUpdate(from,'announcement');if(h==6)await sock.groupSettingUpdate(from,'not_announcement')}catch{}},3.6e6);reply(fancy('nightmode on\npower by crasher xd'))}else{ if(global.nightMode)delete global.nightMode[from];reply(fancy('nightmode off\npower by crasher xd'))}break}
    case 'warn':{if(!isGroup||!isAdmin) return adminOnly();let j=getTarget();global.db.warnings[j]=(global.db.warnings[j]||0)+1;if(global.db.warnings[j]>=3){await sock.groupParticipantsUpdate(from,[j],'remove');global.db.warnings[j]=0;await reply(`3 warns - kicked @${j.split('@')[0]}`)}else await reply(`Warn ${global.db.warnings[j]}/3 @${j.split('@')[0]}`);break}
    case 'warnings':{let j=getTarget()||sender;await reply(`Warnings: ${global.db.warnings[j]||0}`);break}
    case 'ghosttag':{if(!isGroup)return;let mem=(await sock.groupMetadata(from)).participants.map(p=>p.id);await sock.sendMessage(from,{text:q||fancy('ghost tag\npower by crasher xd'),mentions:mem,contextInfo:{isForwarded:true,forwardedNewsletterMessageInfo:{newsletterName:'Crasher XD'}}});break}
    case 'shadowban':{let u=m.mentionedJid?.[0]||q+'@s.whatsapp.net';let msgs=global.chatHistory?.[from]?.filter(x=>x.sender===u)||[];let score=msgs.length?msgs.slice(-10).filter(x=>x.reacts===0).length:0;reply(`${fancy('shadow check')} @${u.split('@')[0]}\nScore: ${score}/10 ${score>7?'LIKELY BANNED':'SAFE'}\n\npower by crasher xd`,{mentions:[u]});break}
    case 'selfdestruct':{let t=parseInt(args[0])||10;reply(fancy(`group will self destruct in ${t}m\npower by crasher xd`));setTimeout(async()=>{await sock.sendMessage(from,{text:fancy('💥 self destruct now\npower by crasher xd')});await sock.groupLeave(from);},t*60000);break}
    case 'resetwarn':{if(!isGroup||!isAdmin) return adminOnly();let j=args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net';global.db.warnings[j]=0;await reply('Reset');break}
    case 'mute':{if(!isGroup||!isBotAdmin||!isAdmin) return adminOnly();await sock.groupSettingUpdate(from,'announcement');await reply('Group muted');break}
    case 'unmute':{if(!isGroup||!isBotAdmin||!isAdmin) return adminOnly();await sock.groupSettingUpdate(from,'not_announcement');await reply('Group unmuted');break}
    case 'delete':case 'del':{if(!m.message.extendedTextMessage?.contextInfo?.stanzaId) return reply('Reply msg');await sock.sendMessage(from,{delete:m.message.extendedTextMessage.contextInfo});break}
    case 'kickall':{if(!isCreator) return ownerOnly();if(!isGroup) return;let ids=groupMeta.participants.filter(p=>!p.admin).map(p=>p.id);for(let id of ids){await sock.groupParticipantsUpdate(from,[id],'remove');await delay(1000)}await reply('All kicked');break}

    // GROUP
    case 'groupinfo':case 'infogc':{if(!isGroup) return;await reply(`Group: ${groupMeta.subject}\nCreated: ${new Date(groupMeta.creation*1000).toLocaleString()}\nMembers: ${groupMeta.participants.length}\nDesc: ${groupMeta.desc||'none'}`);break}
    case 'grouplink':case 'linkgc':{if(!isBotAdmin) return botAdmin();let code=await sock.groupInviteCode(from);await reply(`https://chat.whatsapp.com/${code}`);break}
    case 'revoke':{if(!isGroup||!isAdmin||!isBotAdmin) return adminOnly();await sock.groupRevokeInvite(from);await reply('Link revoked');break}
    case 'setdesc':{if(!isGroup||!isAdmin) return adminOnly();await sock.groupUpdateDescription(from,q);await reply('Desc updated');break}
    case 'open':{if(!isGroup||!isAdmin) return adminOnly();await sock.groupSettingUpdate(from,'not_announcement');await reply('Group opened');break}
    case 'close':{if(!isGroup||!isAdmin) return adminOnly();await sock.groupSettingUpdate(from,'announcement');await reply('Group closed');break}
    case 'tagall':{if(!isGroup) return;let txt=`*TAGALL* ${q}\n\n`;let ids=[];groupMeta.participants.forEach(p=>{txt+=`@${p.id.split('@')[0]} `;ids.push(p.id)});await sock.sendMessage(from,{text:txt,mentions:ids},{quoted:m});break}
    case 'hidetag':{if(!isGroup) return;await sock.sendMessage(from,{text:q||'hidetag',mentions:groupMeta.participants.map(p=>p.id)},{quoted:m});break}
    case 'listadmins': let admins=groupMeta.participants.filter(p=>p.admin); let txt=`*ADMINS - ${admins.length}*\n\n`+admins.map((p,i)=>`${i+1}. @${p.id.split('@')[0]} ${p.admin==='superadmin'?'[OWNER]':'[ADMIN]'}`).join('\n'); await sock.sendMessage(from,{text:txt,mentions:admins.map(p=>p.id)},{quoted:m}); break;
case 'revoke': if(!isGroup||!isAdmin) return adminOnly(); if(!isBotAdmin) return botAdmin(); await sock.groupRevokeInvite(from); await reply('Link revoked'); break;
case 'invite': let j=args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; let code=await sock.groupInviteCode(from); await sock.sendMessage(j,{text:`INVITE: https://chat.whatsapp.com/${code}`}); await reply('Invite sent'); break;
case 'setdesc': if(!isGroup||!isAdmin) return adminOnly(); await sock.groupUpdateDescription(from,q); await reply('Desc updated'); break;
case 'open': await sock.groupSettingUpdate(from,'not_announcement'); await reply('Opened'); break;
case 'close': await sock.groupSettingUpdate(from,'announcement'); await reply('Closed'); break;
case 'tagall': let taTxt=`*TAG ${q}*\n`; let taIds=[]; groupMeta.participants.forEach(p=>{taTxt+=`@${p.id.split('@')[0]} `; taIds.push(p.id)}); await sock.sendMessage(from,{text:taTxt,mentions:taIds},{quoted:m}); break;
case 'hidetag': await sock.sendMessage(from,{text:q||'hidetag',mentions:groupMeta.participants.map(p=>p.id)},{quoted:m}); break;
case 'vv': let qv=m.message.extendedTextMessage?.contextInfo?.quotedMessage; let vo=qv.viewOnceMessageV2||qv.viewOnceMessage||qv; let mg=vo.message||vo; let ty=Object.keys(mg)[0]; let md=mg[ty]; let st=await downloadContentFromMessage(md,ty.includes('image')?'image':'video'); let b=[]; for await(let c of st) b.push(c); await sock.sendMessage(from,{image:Buffer.concat(b),caption:'VV REVEALED'},{quoted:m}); break;
case 'play': if(!q) return reply('Song name'); let yts=require('yt-search'); let s=await yts.search(q); let v=s.videos[0]; await sock.sendMessage(from,{image:{url:v.thumbnail},caption:`${v.title}`},{quoted:m}); let ap=await axios.get(`https://api.dreaded.site/api/ytdl/audio?url=${v.url}`); await sock.sendMessage(from,{audio:{url:ap.data.result.download},mimetype:'audio/mp4'},{quoted:m}); break;
case 'video': let url=q; if(!q.includes('youtu')){let ys=require('yt-search'); let rs=await ys.search(q); url=rs.videos[0].url} let apv=await axios.get(`https://api.dreaded.site/api/ytdl/video?url=${url}`); await sock.sendMessage(from,{video:{url:apv.data.result.download}},{quoted:m}); break;
case 'tiktok': let rtt=await axios.get(`https://api.tikwm.com/api/?url=${q}`); await sock.sendMessage(from,{video:{url:rtt.data.data.play}},{quoted:m}); break;
case 'instagram': let rig=await axios.get(`https://api.dreaded.site/api/igdl?url=${q}`); for(let u of rig.data.result){if(u.includes('.mp4')) await sock.sendMessage(from,{video:{url:u}},{quoted:m}); else await sock.sendMessage(from,{image:{url:u}},{quoted:m})} break;
case 'facebook': let rfb=await axios.get(`https://api.dreaded.site/api/fbdl?url=${q}`); await sock.sendMessage(from,{video:{url:rfb.data.result.sd}},{quoted:m}); break;
case 'mediafire': let rmf=await axios.get(`https://api.dreaded.site/api/mediafire?url=${q}`); await sock.sendMessage(from,{document:{url:rmf.data.result.link},fileName:rmf.data.result.filename,mimetype:rmf.data.result.mime},{quoted:m}); break;
case 'apk': let rapk=await axios.get(`https://api.dreaded.site/api/apk?query=${q}`); await sock.sendMessage(from,{document:{url:rapk.data.result.download},fileName:`${rapk.data.result.name}.apk`,mimetype:'application/vnd.android.package-archive'},{quoted:m}); break;
case 'pinterest': let rpin=await axios.get(`https://api.dreaded.site/api/pinterest?query=${q}`); await sock.sendMessage(from,{image:{url:rpin.data.result[0]},caption:q},{quoted:m}); break;
case 'github': let parts=q.split('/'); let us=parts[3]; let re=parts[4]; await sock.sendMessage(from,{document:{url:`https://api.github.com/repos/${us}/${re}/zipball`},fileName:`${re}.zip`,mimetype:'application/zip'},{quoted:m}); break;
case 'gdrive': let rgd=await axios.get(`https://api.dreaded.site/api/gdrive?url=${q}`); await sock.sendMessage(from,{document:{url:rgd.data.result.download},fileName:rgd.data.result.filename},{quoted:m}); break;
case 'twitter': let rtw=await axios.get(`https://api.dreaded.site/api/twitter?url=${q}`); await sock.sendMessage(from,{video:{url:rtw.data.result.video}},{quoted:m}); break;
case 'threads': let rth=await axios.get(`https://api.dreaded.site/api/threads?url=${q}`); await sock.sendMessage(from,{video:{url:rth.data.result.video}},{quoted:m}); break;
case 'weather': let rw=await axios.get(`https://api.dreaded.site/api/weather?city=${q}`); await reply(`${q}: ${rw.data.result.temp}C`); break;
case 'sticker': let im=m.message.imageMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage; let sts=await downloadContentFromMessage(im,'image'); let bss=[]; for await(let c of sts) bss.push(c); await sock.sendMessage(from,{sticker:Buffer.concat(bss)},{quoted:m}); break;
case 'toimg': let stic=m.message.stickerMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.stickerMessage; let sst=await downloadContentFromMessage(stic,'image'); let bus=[]; for await(let c of sst) bus.push(c); await sock.sendMessage(from,{image:Buffer.concat(bus)},{quoted:m}); break;
case 'ping': let sp=Date.now(); await reply(`PING: ${Date.now()-sp}ms`); break;
case 'alive': await reply(`ALIVE ${runtime(process.uptime())}`); break;
case 'joke': let rj=await axios.get('https://official-joke-api.appspot.com/random_joke'); await reply(`${rj.data.setup}\n${rj.data.punchline}`); break;
case 'quote': let rq=await axios.get('https://api.quotable.io/random'); await reply(`"${rq.data.content}" - ${rq.data.author}`); break;
case 'meme': let rm=await axios.get('https://api.dreaded.site/api/meme'); await sock.sendMessage(from,{image:{url:rm.data.result}},{quoted:m}); break;
case 'truth': let rt=await axios.get('https://api.dreaded.site/api/truth'); await reply(`TRUTH: ${rt.data.result}`); break;
case 'dare': let rd=await axios.get('https://api.dreaded.site/api/dare'); await reply(`DARE: ${rd.data.result}`); break;
case 'fact': let rf=await axios.get('https://api.dreaded.site/api/fact'); await reply(`FACT: ${rf.data.result}`); break;
case '8ball': let ans=['Yes','No','Maybe','Definitely','Never','Ask again']; await reply(`🎱 ${ans[Math.floor(Math.random()*ans.length)]}`); break;
case 'ship': let tshi=args[0]?.replace(/[^0-9]/g,'')+'@s.whatsapp.net'; let perc=Math.floor(Math.random()*100); await reply(`Ship ${perc}% ${perc>70?'❤️':'💔'}`); break;
case 'rate': await reply(`Rate ${q||'you'} ${Math.floor(Math.random()*100)}/100`); break;
case 'waste': await reply(`${q||'You'} is ${Math.floor(Math.random()*100)}% waste 😂`); break;
case 'qr': if(!q) return reply('Text need'); let bqr=await getBuffer(`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(q)}`); await sock.sendMessage(from,{image:bqr},{quoted:m}); break;
case 'shorturl': let rs=await axios.get(`https://tinyurl.com/api-create.php?url=${q}`); await reply(rs.data); break;
case 'translate': let lg=args[0]; let tx=args.slice(1).join(' '); let rtr=await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(tx)}&langpair=en|${lg}`); await reply(rtr.data.responseData.translatedText); break;
case 'calculate': try{await reply(`${q} = ${eval(q)}`)}catch{await reply('Invalid')} break;
case 'toaudio': let vid=m.message.videoMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.videoMessage; let sv=await downloadContentFromMessage(vid,'video'); let bv=[]; for await(let c of sv) bv.push(c); await sock.sendMessage(from,{audio:Buffer.concat(bv),mimetype:'audio/mp4'},{quoted:m}); break;
case 'tourl': let med=m.message.imageMessage||m.message.videoMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage; let sm=await downloadContentFromMessage(med,med.mimetype?.includes('video')?'video':'image'); let bm=[]; for await(let c of sm) bm.push(c); let fd=new (require('form-data'))(); fd.append('file',Buffer.concat(bm),{filename:'file'}); let ru=await axios.post('https://catbox.moe/user/api.php',fd,{headers:fd.getHeaders()}); await reply(ru.data); break;
case 'getpp': let gj=args[0]?.replace(/[^0-9]/g,'')+'@s.whatsapp.net'||sender; try{let pp=await sock.profilePictureUrl(gj,'image'); await sock.sendMessage(from,{image:{url:pp}},{quoted:m})}catch{await reply('No PP')} break;
case 'whois': let wj=args[0]?.replace(/[^0-9]/g,'')||senderNum; await reply(`Number: ${wj}\nJID: ${wj}@s.whatsapp.net\nwa.me/${wj}`); break;
case 'attp': let bat=await getBuffer(`https://api.dreaded.site/api/attp?text=${encodeURIComponent(q)}`); await sock.sendMessage(from,{sticker:bat},{quoted:m}); break;
case 'attp2': let bat2=await getBuffer(`https://api.dreaded.site/api/attp2?text=${encodeURIComponent(q)}`); await sock.sendMessage(from,{sticker:bat2},{quoted:m}); break;
case 'emojimix': let [e1,e2]=q.split('+'); let rem=await axios.get(`https://api.dreaded.site/api/emojimix?emoji1=${encodeURIComponent(e1)}&emoji2=${encodeURIComponent(e2)}`); await sock.sendMessage(from,{sticker:{url:rem.data.result}},{quoted:m}); break;
case 'brat': let bbr=await getBuffer(`https://api.dreaded.site/api/brat?text=${encodeURIComponent(q)}`); await sock.sendMessage(from,{sticker:bbr},{quoted:m}); break;
case 'smeme': let is=m.message.imageMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage; let ssm=await downloadContentFromMessage(is,'image'); let bsm=[]; for await(let c of ssm) bsm.push(c); let fds=new (require('form-data'))(); fds.append('image',Buffer.concat(bsm),{filename:'img.jpg'}); fds.append('text',q); let rsm=await axios.post('https://api.dreaded.site/api/memegen',fds,{headers:fds.getHeaders()}); await sock.sendMessage(from,{sticker:{url:rsm.data.result}},{quoted:m}); break;
case 'take': let q1=args[0]||'CRASHER'; let q2=args[1]||'MD'; let it=m.message.imageMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage; let stt=await downloadContentFromMessage(it,'image'); let btt=[]; for await(let c of stt) btt.push(c); await sock.sendMessage(from,{sticker:Buffer.concat(btt),packname:q1,author:q2},{quoted:m}); break;
case 'autoread': global.db.auto.autoread=!global.db.auto.autoread; await reply(`Autoread ${global.db.auto.autoread?'ON':'OFF'}`); break;
case 'autoonline': global.db.auto.autoonline=!global.db.auto.autoonline; await reply(`Autoonline ${global.db.auto.autoonline?'ON':'OFF'}`); break;
case 'autoreact': global.db.auto.autoreact=!global.db.auto.autoreact; await reply(`Autoreact ${global.db.auto.autoreact?'ON':'OFF'}`); break;
case 'autoview': global.db.auto.autoview=!global.db.auto.autoview; await reply(`Autoview ${global.db.auto.autoview?'ON':'OFF'}`); break;
case 'autotyping': global.db.auto.autotyping=!global.db.auto.autotyping; await reply(`Autotyping ${global.db.auto.autotyping?'ON':'OFF'}`); break;
case 'antilink': if(!isGroup||!isAdmin) return adminOnly(); global.db.antilink[from]=!global.db.antilink[from]; await reply(`Antilink ${global.db.antilink[from]?'ON':'OFF'}`); break;
case 'antibot': global.db.antibot[from]=!global.db.antibot[from]; await reply(`Antibot ${global.db.antibot[from]?'ON':'OFF'}`); break;
case 'kick': let jk=args[0]?.replace(/[^0-9]/g,'')+'@s.whatsapp.net'||m.message.extendedTextMessage?.contextInfo?.participant; await sock.groupParticipantsUpdate(from,[jk],'remove'); await reply('Kicked'); break;
case 'add': let ja=args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; await sock.groupParticipantsUpdate(from,[ja],'add'); await reply('Added'); break;
case 'promote': let jp=m.message.extendedTextMessage?.contextInfo?.participant||args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; await sock.groupParticipantsUpdate(from,[jp],'promote'); await reply('Promoted'); break;
case 'demote': let jd=m.message.extendedTextMessage?.contextInfo?.participant||args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; await sock.groupParticipantsUpdate(from,[jd],'demote'); await reply('Demoted'); break;
case 'mute': await sock.groupSettingUpdate(from,'announcement'); await reply('Muted'); break;
case 'unmute': await sock.groupSettingUpdate(from,'not_announcement'); await reply('Unmuted'); break;
case 'delete': case 'del': await sock.sendMessage(from,{delete:m.message.extendedTextMessage.contextInfo}); break;
case 'warn': let jw=args[0]?.replace(/[^0-9]/g,'')+'@s.whatsapp.net'; global.db.warnings[jw]=(global.db.warnings[jw]||0)+1; if(global.db.warnings[jw]>=3){await sock.groupParticipantsUpdate(from,[jw],'remove'); global.db.warnings[jw]=0; await reply('3 warns kicked')}else await reply(`Warn ${global.db.warnings[jw]}/3`); break;
case 'warnings': let jww=args[0]?.replace(/[^0-9]/g,'')+'@s.whatsapp.net'||sender; await reply(`Warnings: ${global.db.warnings[jww]||0}`); break;
case 'groupinfo': await reply(`Group: ${groupMeta.subject}\nMembers: ${groupMeta.participants.length}`); break;
case 'grouplink': let gc=await sock.groupInviteCode(from); await reply(`https://chat.whatsapp.com/${gc}`); break;
case 'setname': if(isGroup){await sock.groupUpdateSubject(from,q)}else{await sock.updateProfileName(q)} await reply('Name updated'); break;
case 'setpp': let ppimg=m.message.imageMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage; let spp=await downloadContentFromMessage(ppimg,'image'); let bpp=[]; for await(let c of spp) bpp.push(c); await sock.updateProfilePicture(isGroup?from:sock.user.id,Buffer.concat(bpp)); await reply('PP updated'); break;
case 'block': let jb=args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; await sock.updateBlockStatus(jb,'block'); await reply('Blocked'); break;
case 'unblock': let jub=args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net'; await sock.updateBlockStatus(jub,'unblock'); await reply('Unblocked'); break;
case 'public': global.db.settings.mode='public'; await reply('Mode public'); break;
case 'private': global.db.settings.mode='private'; await reply('Mode private'); break;
case 'restart': await reply('Restarting...'); setTimeout(()=>process.exit(0),1000); break;
case 'runtime': await reply(runtime(process.uptime())); break;
case 'botinfo': await reply(`BOT: ${config.botName}\nPREFIX: ${config.prefix}\nUPTIME: ${runtime(process.uptime())}`); break;
case 'owner': await sock.sendMessage(from,{contacts:{displayName:config.ownerName,contacts:[{vcard:`BEGIN:VCARD\nVERSION:3.0\nFN:${config.ownerName}\nTEL;type=CELL;type=VOICE;waid=${config.owner[0]}:+${config.owner[0]}\nEND:VCARD`}] }},{quoted:m}); break;
case 'broadcast': let gs=await sock.groupFetchAllParticipating(); for(let id in gs){await sock.sendMessage(id,{text:`BROADCAST: ${q}`}); await delay(800)} await reply('Broadcast done'); break;
case 'join': let jc=q.split('/').pop(); await sock.groupAcceptInvite(jc); await reply('Joined'); break;
case 'leave': await sock.groupLeave(from); break;
case 'removebg': let rbgImg=m.message.imageMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage; let srbg=await downloadContentFromMessage(rbgImg,'image'); let brbg=[]; for await(let c of srbg) brbg.push(c); await sock.sendMessage(from,{image:Buffer.concat(brbg)},{quoted:m}); break;
case 'hd': let hdImg=m.message.imageMessage||m.message.extendedTextMessage?.contextInfo?.quotedMessage?.imageMessage; await reply('HD processing...'); break;
case 'kickall': if(!isCreator) return; let ids=groupMeta.participants.filter(p=>!p.admin).map(p=>p.id); for(let id of ids){await sock.groupParticipantsUpdate(from,[id],'remove'); await delay(1000)} await reply('All kicked'); break;
case 'listban': let bl=Object.keys(global.db.users).filter(k=>global.db.users[k].banned); await reply(`Banned: ${bl.join(', ')||'none'}`); break;
case 'ban': let bn=args[0].replace(/[^0-9]/g,''); global.db.users[bn]={banned:true}; await reply(`Banned ${bn}`); break;
case 'unban': let ub=args[0].replace(/[^0-9]/g,''); delete global.db.users[ub]; await reply(`Unbanned ${ub}`); break ;
case 'setbio': await sock.updateProfileStatus(q); await reply('Bio updated'); break;
case 'clearsession': try{require('fs').rmSync('./session',{recursive:true,force:true})}catch{} await reply('Session cleared'); break;
case 'menu2': await reply(`*CRASHER MD MENU 2*\n\nAll 150 cmds working\nPrefix: ${config.prefix}`); break;
default: await reply(`Unknown cmd: ${command}\nType ${config.prefix}menu`); break;
  }
}

startCrasher()
