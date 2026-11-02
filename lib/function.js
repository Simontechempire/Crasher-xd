/**
 * ◈┈▉ `ｃｒａｓｈｅｒ ｍｄ` ▉┄◈
 * lib/function.js - ALL FUNCTIONS
 */

const axios = require('axios')
const fs = require('fs')
const path = require('path')
const { downloadContentFromMessage } = require('@whiskeysockets/baileys')
const config = require('../config')

// === FANCY FONT ===
const fancyMap = {
  a:'ᴀ',b:'ʙ',c:'ᴄ',d:'ᴅ',e:'ᴇ',f:'ꜰ',g:'ɢ',h:'ʜ',i:'ɪ',j:'ᴊ',k:'ᴋ',l:'ʟ',m:'ᴍ',n:'ɴ',o:'ᴏ',p:'ᴘ',q:'ǫ',r:'ʀ',s:'ꜱ',t:'ᴛ',u:'ᴜ',v:'ᴠ',w:'ᴡ',x:'x',y:'ʏ',z:'ᴢ',
  A:'ᴀ',B:'ʙ',C:'ᴄ',D:'ᴅ',E:'ᴇ',F:'ꜰ',G:'ɢ',H:'ʜ',I:'ɪ',J:'ᴊ',K:'ᴋ',L:'ʟ',M:'ᴍ',N:'ɴ',O:'ᴏ',P:'ᴘ',Q:'ǫ',R:'ʀ',S:'ꜱ',T:'ᴛ',U:'ᴜ',V:'ᴠ',W:'ᴡ',X:'X',Y:'ʏ',Z:'ᴢ'
}

function toFancy(text) {
  if(!text) return ''
  return text.split('').map(c => fancyMap[c] || c).join('')
}

function toSmallCaps(text) {
  return toFancy(text)
}

// === FANCY REPLY WITH KEYBOARD STYLE ===
async function fancyReply(sock, chat, text, m) {
  let styled = `◈┈▉ \`ｃｒａｓｈｅｒ ｍｄ\` ▉┄◈
> ${text}

> ⚡ ᴘᴏᴡᴇʀ • ꜱᴘᴇᴇᴅ • ᴄᴏɴᴛʀᴏʟ
> 🐺 ᴄʀᴀꜱʜᴇʀ ᴍᴅ — 𝟸𝟶𝟸𝟼`

  return await sock.sendMessage(chat, {
    text: styled,
    contextInfo: {
      externalAdReply: {
        title: config.botName,
        body: `Owner: ${config.ownerName}`,
        thumbnailUrl: config.pfp,
        sourceUrl: config.links.github,
        mediaType: 1,
        renderLargerThumbnail: true,
        showAdAttribution: true
      },
      forwardedNewsletterMessageInfo: {
        newsletterJid: "120363000000000000@newsletter",
        newsletterName: "CRASHER MD"
      }
    }
  }, { quoted: m })
}

// === REACT ===
async function doReact(sock, chat, key, emoji) {
  try {
    await sock.sendMessage(chat, { react: { text: emoji, key: key } })
  } catch {}
}

// === DOWNLOAD MEDIA ===
async function downloadMedia(message, type) {
  let stream = await downloadContentFromMessage(message, type)
  let buffer = Buffer.from([])
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk])
  }
  return buffer
}

async function getBuffer(url) {
  let res = await axios.get(url, { responseType: 'arraybuffer' })
  return Buffer.from(res.data)
}

// === IS CREATOR CHECK ===
function isCreator(sender, config) {
  let num = sender.split('@')[0]
  return config.owner.includes(num) || config.sudo.includes(num)
}

// === GROUP CHECKS ===
async function getGroupAdmins(participants) {
  let admins = []
  for(let p of participants) {
    if(p.admin) admins.push(p.id)
  }
  return admins
}

// === RUNTIME ===
function runtime(seconds) {
  seconds = Number(seconds)
  let d = Math.floor(seconds / (360*24))
  let h = Math.floor(seconds % (360*24) / 360)
  let m = Math.floor(seconds % 360 / 60)
  let s = Math.floor(seconds % 60)
  return `${d}d ${h}h ${m}m ${s}s`
}

// === CLOCK ===
function clockString(ms) {
  let h = Math.floor(ms / 3600000)
  let m = Math.floor(ms / 60000) % 60
  let s = Math.floor(ms / 1000) % 60
  return [h,m,s].map(v=>v.toString().padStart(2,0)).join(':')
}

// === FETCH JSON ===
async function fetchJson(url) {
  let res = await axios.get(url)
  return res.data
}

// === RANDOM ===
function random(arr) {
  return arr[Math.floor(Math.random()*arr.length)]
}

// === PRIVATE MODE CHECK ===
function checkPrivateMode(mode, isCreator) {
  if(mode === 'private' && !isCreator) return true // should ignore
  return false
}

module.exports = {
  toFancy,
  toSmallCaps,
  fancyReply,
  doReact,
  downloadMedia,
  getBuffer,
  isCreator,
  getGroupAdmins,
  runtime,
  clockString,
  fetchJson,
  random,
  checkPrivateMode
}
