/**
 * ◈┈▉ `ｃｒａｓｈｅｒ ｍｄ` ▉┄◈
 * CONFIG.JS - CRASHER XD
 * Owner: 2348071569915
 */

module.exports = {
  // === OWNER CONFIG ===
  owner: ["2348071569915"], 
  sudo: ["2348071569915"],
  ownerName: "ᴄʀᴀꜱʜᴇʀ",
  ownerNumber: "2348071569915@s.whatsapp.net",
  
  // === BOT CONFIG ===
  botName: "ᴄʀᴀꜱʜᴇʀ ᴍᴅ",
  botNumber: "", 
  prefix: ".",
  mode: "private", // <--- CHANGED TO PRIVATE FOR SAFETY - only you can use bot
  language: "en",
  
  // === SESSION & HOSTING ===
  sessionFolder: "./session",
  port: process.env.PORT || 3000,
  pairingMethod: "code",
  
  // === BOT PROFILE ===
  pfp: "https://files.catbox.moe/hhafg3.jpg",
  botBio: "⚡ CRASHER MD - Power • Speed • Control - 250 CMD",
  
  // === AUTO FUNCTION DEFAULT ===
  auto: {
    autoread: false,
    autotyping: false,
    autoonline: true,
    autorecording: false,
    autoreact: true,
    autoreply: false,
    autosticker: false,
    autoview: true,
    autobio: false,
    autolikestatus: true,
    anticall: false
  },

  // === ANTI CONFIG ===
  anti: {
    antilink: false,
    antibot: false,
    antispam: false,
    antiflood: false,
    antitag: false,
    antidelete: false,
    antibadword: false,
    antisticker: false,
    antifake: false,
    antipromote: false
  },

  // === MESSAGE CONFIG ===
  mess: {
    owner: "◈ *OWNER ONLY* ◈\n> This cmd is for owner only!",
    admin: "◈ *ADMIN ONLY* ◈\n> You must be admin!",
    botAdmin: "◈ *BOT ADMIN* ◈\n> Bot must be admin!",
    group: "◈ *GROUP ONLY* ◈\n> This cmd for group only!",
    private: "◈ *PRIVATE MODE* ◈\n> Bot is in private mode! Only owner 2348071569915",
    wait: "⏳ *WAIT... CRASHER IS PROCESSING* ⏳",
    done: "💀 *DONE* 💀",
    error: "❌ Error! Try again later"
  },

  // === API KEYS ===
  apis: {
    openai: "",
    removeBg: "",
    tenor: ""
  },

  // === LINKS ===
  links: {
    github: "https://github.com/crasher-xd",
    whatsapp: "https://whatsapp.com/channel/crasher",
    supportGroup: "https://chat.whatsapp.com/xxxxx"
  }
}
