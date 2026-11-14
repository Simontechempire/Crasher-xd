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
const floodMap = new Map()
function numOf(jid){ if(!jid) return ''; return String(jid).split('@')[0].split(':')[0].replace(/[^0-9]/g,'') }
function jidsOf(a,b){ const s=new Set(); for(let j of [a,b]){ if(!j) continue; s.add(jidNormalizedUser(j)); s.add(String(j).split(':')[0]) } return [...s] }
function checkAdmin(list, senderJids, senderNum){ for(let p of list){ if(!p.admin) continue; const cand=[p.id,p.lid,p.pn].filter(Boolean).map(x=>jidNormalizedUser(x)); const nums=[p.id,p.lid,p.pn].filter(Boolean).map(numOf); if(senderJids.some(j=>cand.includes(j))) return true; if(senderNum && nums.includes(senderNum)) return true; } return false }

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
  
  const rawSender = m.key.participant || m.key.participantAlt || from
  const senderAlt = m.key.participantAlt || m.key.participant
  const senderJids = jidsOf(rawSender, senderAlt)
  const sender = jidNormalizedUser(rawSender)
  const senderNum = numOf(rawSender) || numOf(senderAlt)
  const ctxAll = m.message.extendedTextMessage?.contextInfo || m.message.imageMessage?.contextInfo || m.message.videoMessage?.contextInfo || {}
  const mentioned = ctxAll.mentionedJid || []
  const msgType = Object.keys(m.message)[0]
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
    try{
      let meta = groupCache.has(from) ? groupCache.get(from).data : await sock.groupMetadata(from);
      if(!groupCache.has(from)) groupCache.set(from,{data:meta})
      const botJids = jidsOf(sock.user.id, sock.user.lid);
      const botNum = numOf(sock.user.id) || numOf(sock.user.lid);
      const meAdmin = checkAdmin(meta.participants, senderJids, senderNum);
      const botIsAdmin = checkAdmin(meta.participants, botJids, botNum);
      if(!meAdmin && !isCreator && !m.key.fromMe && botIsAdmin){
        const doDelete = async(reason)=>{
          try{ await sock.sendMessage(from,{delete:m.key}) }catch{}
          global.db.warnings[from]=global.db.warnings[from]||{};
          global.db.warnings[from][sender]=(global.db.warnings[from][sender]||0)+1;
          if(global.db.warnings[from][sender]>=3){ await sock.groupParticipantsUpdate(from,[rawSender],'remove').catch(()=>{}); await sock.sendMessage(from,{text:`🚫 @${senderNum} kicked - 3 warnings (${reason})`,mentions:[rawSender]}).catch(()=>{}); delete global.db.warnings[from][sender] }
          else { await sock.sendMessage(from,{text:`⚠️ @${senderNum} ${reason} - Warn ${global.db.warnings[from][sender]}/3`,mentions:[rawSender]}).catch(()=>{}) }
          return true;
        };
        if(global.db.antilink[from] && /https?:\/\/|www\.|chat\.whatsapp\.com|wa\.me|t\.me|discord\.gg|instagram\.com/i.test(body)){ if(await doDelete('Antilink')) return; }
        if(global.db.antitag[from] && mentioned.length>0){ if(await doDelete('Antitag / Antimention')) return; }
        if(global.db.antibad[from] && ['fuck','shit','bitch','bastard','dick','pussy'].some(w=>body.toLowerCase().includes(w))){ if(await doDelete('Bad word')) return; }
        if(global.db.antisticker[from] && msgType==='stickerMessage'){ if(await doDelete('Antisticker')) return; }
        if(global.db.antibot[from] && m.key.id.startsWith('BAE5')){ if(await doDelete('Antibot')) return; }
        if(global.db.antiflood[from] || global.db.antispam[from]){ const now=Date.now(); const arr=(floodMap.get(sender+from)||[]).filter(t=>now-t<5000); arr.push(now); floodMap.set(sender+from,arr); if(arr.length>=5){ floodMap.delete(sender+from); if(await doDelete('Flood / Spam')) return; } }
      }
    }catch{}
  }
    if(!body.startsWith(config.prefix)) { if(global.db.auto.autoreply&&!isGroup) await sock.sendMessage(from,{text:`Hey! I am CRASHER MD\nType ${config.prefix}menu\n\n> ⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴄʀᴀꜱʜᴇʀ xᴅ`},{quoted:m}).catch(()=>{}); return }
  const args=body.slice(config.prefix.length).trim().split(/ +/); const command=args.shift().toLowerCase(); const q=args.join(' ')
  
  const currentMode = config.mode || global.db.settings.mode
  if(currentMode === 'private' && !isCreator) return
  if(currentMode === 'self' && !isCreator) return

  try{await sock.sendMessage(from,{react:{text:'⏳',key:m.key}})}catch{}
  let groupMeta,isAdmin=false,isBotAdmin=false
  if(isGroup){try{
    if(groupCache.has(from)) groupMeta=groupCache.get(from).data;
    else{ groupMeta=await sock.groupMetadata(from); groupCache.set(from,{data:groupMeta}) }
    const botJids2=jidsOf(sock.user.id,sock.user.lid);
    const botNum2=numOf(sock.user.id)||numOf(sock.user.lid);
    isAdmin=checkAdmin(groupMeta.participants,senderJids,senderNum);
    isBotAdmin=checkAdmin(groupMeta.participants,botJids2,botNum2);
    if(isCreator) isAdmin=true;
  }catch{}}
  
  // === THIS IS WHERE POWER BY CRASHER XD APPEARS EVERYWHERE ===
  const reply=async(t)=>{try{await sock.sendMessage(from,{text:`◈┈▉ \`ｃｒａｓｈｅｒ ｍｄ\` ▉┄◈\n> ${t}\n\n> ⚡ ᴘᴏᴡᴇʀᴇᴅ ʙʏ ᴄʀᴀꜱʜᴇʀ xᴅ\n> ⚡ ᴘᴏᴡᴇʀ • ꜱᴘᴇᴇᴅ • ᴄᴏɴᴛʀᴏʟ`},{quoted:m});await sock.sendMessage(from,{react:{text:'💀',key:m.key}})}catch{}}
  
  const ownerOnly=()=>reply('ᴏᴡɴᴇʀ ᴏɴʟʏ'); const adminOnly=()=>reply('ᴀᴅᴍɪɴ ᴏɴʟʏ'); const botAdmin=()=>reply('ʙᴏᴛ ɴᴏᴛ ᴀᴅᴍɪɴ'); const groupOnly=()=>reply('ɢʀᴏᴜᴘ ᴏɴʟʏ')
  const getTarget=()=>{let j=ctxAll.participant; if(j) return jidNormalizedUser(j); if(mentioned[0]) return jidNormalizedUser(mentioned[0]); if(args[0]) return jidNormalizedUser(args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net'); return null}
  const getTargetRaw=()=>{ if(ctxAll.participant) return ctxAll.participant; if(mentioned[0]) return mentioned[0]; return getTarget() }
  const ownerOnly=()=>reply('ᴏᴡɴᴇʀ ᴏɴʟʏ'); const adminOnly=()=>reply('ᴀᴅᴍɪɴ ᴏɴʟʏ'); const botAdmin=()=>reply('ʙᴏᴛ ɴᴏᴛ ᴀᴅᴍɪɴ'); const groupOnly=()=>reply('ɢʀᴏᴜᴘ ᴏɴʟʏ')
  const getTarget=()=>{let j=ctxAll.participant; if(j) return jidNormalizedUser(j); if(mentioned[0]) return jidNormalizedUser(mentioned[0]); if(args[0]) return jidNormalizedUser(args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net'); return null}
  const getTargetRaw=()=>{ if(ctxAll.participant) return ctxAll.participant; if(mentioned[0]) return mentioned[0]; return getTarget() }

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
    case'callspam':{if(!isGroup||!isAdmin)return;let u=m.mentionedJid?.[0];if(!u)return reply(fancy('tag user'));for(let i=0;i<20;i++){await sock.sendMessage(from,{text:`@xxx CALL SPAM ${i+1}/20`,mentions:[u]});await new Promise(r=>setTimeout(r,500))}reply(fancy('call spam done\npower by crasher xd'));break}
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
    case 'antilink':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();global.db.antilink[from]=!global.db.antilink[from];await reply(`Antilink ${global.db.antilink[from]?'ON':'OFF'}`);break}
    case 'antibot':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();global.db.antibot[from]=!global.db.antibot[from];await reply(`Antibot ${global.db.antibot[from]?'ON':'OFF'}`);break}
    case 'antispam':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();global.db.antispam[from]=!global.db.antispam[from];await reply(`Antispam ${global.db.antispam[from]?'ON':'OFF'}`);break}
    case 'antiflood':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();global.db.antiflood[from]=!global.db.antiflood[from];await reply(`Antiflood ${global.db.antiflood[from]?'ON':'OFF'}`);break}
    case 'antitag':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();global.db.antitag[from]=!global.db.antitag[from];await reply(`Antitag ${global.db.antitag[from]?'ON':'OFF'}`);break}
    case 'antidelete':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();global.db.antidelete[from]=!global.db.antidelete[from];await reply(`Antidelete ${global.db.antidelete[from]?'ON':'OFF'}`);break}
    case 'antibadword':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();global.db.antibad[from]=!global.db.antibad[from];await reply(`Antibad ${global.db.antibad[from]?'ON':'OFF'}`);break}
    case 'antisticker':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();global.db.antisticker[from]=!global.db.antisticker[from];await reply(`Antisticker ${global.db.antisticker[from]?'ON':'OFF'}`);break}
        case'faketyper':{let t=parseInt(args[0])||60,c=args[1]?.includes('@')?args[1]:from;await sock.sendPresenceUpdate('composing',c);reply(fancy(`fake typing ${t}s\npower by crasher xd`));setTimeout(()=>sock.sendPresenceUpdate('paused',c),t*1000);break}
    case'fakerecorder':{let t=parseInt(args[0])||60,c=args[1]?.includes('@')?args[1]:from;await sock.sendPresenceUpdate('recording',c);reply(fancy(`fake recording ${t}s\npower by crasher xd`));setTimeout(()=>sock.sendPresenceUpdate('paused',c),t*1000);break}

    // GROUP
    case 'kick':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();if(!isBotAdmin) return botAdmin();let t=getTargetRaw();if(!t) return reply('Tag user or reply');await sock.groupParticipantsUpdate(from,[t],'remove');await reply(`Kicked @${numOf(t)}`);break}
    case 'add':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();if(!isBotAdmin) return botAdmin();if(!args[0]) return reply('Number need');let j=args[0].replace(/[^0-9]/g,'')+'@s.whatsapp.net';await sock.groupParticipantsUpdate(from,[j],'add');await reply(`Added ${args[0]}`);break}
    case 'promote':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();if(!isBotAdmin) return botAdmin();let t=getTargetRaw();if(!t) return reply('Tag user');await sock.groupParticipantsUpdate(from,[t],'promote');await reply(`Promoted @${numOf(t)}`);break}
    case 'demote':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();if(!isBotAdmin) return botAdmin();let t=getTargetRaw();if(!t) return reply('Tag user');await sock.groupParticipantsUpdate(from,[t],'demote');await reply(`Demoted @${numOf(t)}`);break}
    case 'groupinfo':{if(!isGroup) return groupOnly();let g=groupMeta||await sock.groupMetadata(from);await reply(`Name: ${g.subject}\nMembers: ${g.participants.length}\nDesc: ${g.desc||'none'}`);break}
    case 'grouplink':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();let code=await sock.groupInviteCode(from);await reply(`https://chat.whatsapp.com/${code}`);break}
    case 'revoke':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();await sock.groupRevokeInvite(from);await reply('Link revoked');break}
    case 'open':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();await sock.groupSettingUpdate(from,'not_announcement');await reply('Group opened');break}
    case 'close':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();await sock.groupSettingUpdate(from,'announcement');await reply('Group closed');break}
    case 'tagall':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();let g=groupMeta||await sock.groupMetadata(from);let txt=`📢 TAG ALL\n\n${g.participants.map(p=>`@${numOf(p.id)}`).join(' ')}`;await sock.sendMessage(from,{text:txt,mentions:g.participants.map(p=>p.id)});break}
    case 'hidetag':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();let g=groupMeta||await sock.groupMetadata(from);await sock.sendMessage(from,{text:q||'Hi',mentions:g.participants.map(p=>p.id)});break}
    case 'warn':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();let t=getTargetRaw();if(!t) return reply('Tag user');global.db.warnings[from]=global.db.warnings[from]||{};global.db.warnings[from][t]=(global.db.warnings[from][t]||0)+1;if(global.db.warnings[from][t]>=3){await sock.groupParticipantsUpdate(from,[t],'remove');delete global.db.warnings[from][t];await reply('Kicked 3 warns')}else await reply(`Warn ${global.db.warnings[from][t]}/3`);break}
    case 'warnings':{if(!isGroup) return groupOnly();let t=getTarget()||sender;let n=(global.db.warnings[from]||{})[t]||0;await reply(`Warnings: ${n}/3`);break}
    case 'resetwarn':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();let t=getTargetRaw();if(!t) return reply('Tag user');if(global.db.warnings[from]) delete global.db.warnings[from][t];await reply('Warns reset');break}
    case 'mute':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();await sock.groupSettingUpdate(from,'announcement');await reply('Muted');break}
    case 'unmute':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();await sock.groupSettingUpdate(from,'not_announcement');await reply('Unmuted');break}
    case 'delete':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();let qm=ctxAll.quotedMessage?{key:{remoteJid:from,fromMe:false,id:ctxAll.stanzaId,participant:ctxAll.participant},message:ctxAll.quotedMessage}:null;if(!qm) return reply('Reply to msg');await sock.sendMessage(from,{delete:qm.key});break}
    case 'kickall':{if(!isGroup) return groupOnly();if(!isCreator) return ownerOnly();let g=groupMeta||await sock.groupMetadata(from);for(let p of g.participants){if(p.id===sock.user.id) continue;if(checkAdmin(g.participants,[jidNormalizedUser(p.id)],numOf(p.id))) continue;await sock.groupParticipantsUpdate(from,[p.id],'remove').catch(()=>{});await delay(500)}await reply('Kickall done');break}
    case 'listmembers':{if(!isGroup) return groupOnly();let g=groupMeta||await sock.groupMetadata(from);await reply(g.participants.map((p,i)=>`${i+1}. @${numOf(p.id)}${p.admin?' (admin)':''}`).join('\n'));break}
    case 'admins':{if(!isGroup) return groupOnly();let g=groupMeta||await sock.groupMetadata(from);let a=g.participants.filter(p=>p.admin);await reply(`Admins:\n${a.map(p=>`@${numOf(p.id)}`).join('\n')}`);break}
    case 'setdesc':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();await sock.groupUpdateDescription(from,q);await reply('Desc updated');break}
    case 'setdescgc':{if(!isGroup) return groupOnly();if(!isAdmin) return adminOnly();await sock.groupUpdateDescription(from,q);await reply('Desc updated');break}

    default:{break}
  }
}

startCrasher()
