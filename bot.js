const { Client, GatewayIntentBits, ApplicationCommandOptionType } = require("discord.js");
const mineflayer = require("mineflayer");
require("dotenv").config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const AUTHORIZED_USER_IDS = (process.env.AUTHORIZED_USER_IDS || "").split(",").filter(id => id.trim());

const bot = mineflayer.createBot({
  host: 'hugosmp.net',
  port: 25565,
  username: 'JSK1905',
  auth: 'microsoft',
  version: "1.21.4"
});

bot._client.on('add_resource_pack', (data) => {
    console.log(`Accept Server-Resource-Pack. url: ${data.url} , uuid: ${data.uuid}`);
    bot._client.write('resource_pack_receive', { uuid: data.uuid, result: 3 });
    bot._client.write('resource_pack_receive', { uuid: data.uuid, result: 0 });
});

bot.on("kicked", () => {
    console.log("bot kicked!");
});

const RATE_LIMIT_WINDOW_MS = 5000;
const RATE_LIMIT_MAX_REQUESTS = 3;

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const messageHistory = new Map();

bot.on("spawn", async () => {
    console.log("Mineflayer bot spawned successfully");
    
    await client.login(DISCORD_TOKEN);
    
    const guild = client.guilds.cache.first();
    if (guild) {
        const commands = [
            {
                name: "msg",
                description: "Send a private message to a Minecraft player",
                options: [
                    {
                        name: "player",
                        description: "Minecraft username of the recipient",
                        type: ApplicationCommandOptionType.String,
                        required: true
                    },
                    {
                        name: "nachricht",
                        description: "Message content to send",
                        type: ApplicationCommandOptionType.String,
                        required: true
                    }
                ]
            },
            {
                name: "chat",
                description: "Send a message to the Minecraft chat",
                options: [
                    {
                        name: "text",
                        description: "Message content to send",
                        type: ApplicationCommandOptionType.String,
                        required: true
                    }
                ]
            },

            {
                name: "clan-kick",
                description: "Kicks a Clan Member out of the Clan",
                options: [
                    {
                        name: "player",
                        description: "Member that is getting kickt",
                        type: ApplicationCommandOptionType.String,
                        required: true
                    }
                ]
            }
        ];
        
        try {
            await guild.commands.set(commands);
            console.log("Slash commands registered successfully");
        } catch (error) {
            console.error("Failed to register slash commands:", error);
        }
    }
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    
    if (interaction.commandName === "msg") {
        if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
            await interaction.reply({ 
                content: "You are not authorized to use this command.", 
                ephemeral: true 
            });
            return;
        }
        
        const playerName = interaction.options.getString("player");
        const messageContent = interaction.options.getString("nachricht");
        
        const validationError = validateRequest(playerName, messageContent, interaction.user.id);
        if (validationError) {
            await interaction.reply({ 
                content: validationError, 
                ephemeral: true 
            });
            return;
        }
        
        messageHistory.set(interaction.user.id, Date.now());
        
        try {
            bot.chat(`/msg ${playerName} ${messageContent}`);
            
            await interaction.reply({ 
                content: `Message sent to ${playerName}: "${messageContent}"`, 
                ephemeral: true 
            });
        } catch (error) {
            await interaction.reply({ 
                content: "Failed to send message. Bot may be disconnected.", 
                ephemeral: true 
            });
        }
    }
    
    if (interaction.commandName === "chat") {
        if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
            await interaction.reply({ 
                content: "You are not authorized to use this command.", 
                ephemeral: true 
            });
            return;
        }
        
        const text = interaction.options.getString("text");
        
        const validationError = validateChatRequest(text, interaction.user.id);
        if (validationError) {
            await interaction.reply({ 
                content: validationError, 
                ephemeral: true 
            });
            return;
        }
        
        messageHistory.set(interaction.user.id, Date.now());
        
        try {
            bot.chat(text);
            
            await interaction.reply({ 
                content: `Message sent to Minecraft chat: "${text}"`, 
                ephemeral: true 
            });
        } catch (error) {
            await interaction.reply({ 
                content: "Failed to send message. Bot may be disconnected.", 
                ephemeral: true 
            });
        }
    }

        if (interaction.commandName === "clan-kick") {
        if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
            await interaction.reply({ 
                content: "You are not authorized to use this command.", 
                ephemeral: true 
            });
            return;
        }
        
        const playerName = interaction.options.getString("player");
        
        const validationError = validateChatRequest(text, interaction.user.id);
        if (validationError) {
            await interaction.reply({ 
                content: validationError, 
                ephemeral: true 
            });
            return;
        }
        
        messageHistory.set(interaction.user.id, Date.now());
        
        try {
            bot.chat(`/clan kick ${playerName}`);
            
            await interaction.reply({ 
                content: `Player ${playerName} got kickt out of the Clan`, 
                ephemeral: true 
            });
        } catch (error) {
            await interaction.reply({ 
                content: "Failed to send message. Bot may be disconnected.", 
                ephemeral: true 
            });
        }
    }
});

function validateRequest(playerName, messageContent, userId) {
    if (!playerName || playerName.trim().length === 0) {
        return "Player name cannot be empty.";
    }
    
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(playerName)) {
        return "Invalid Minecraft username format.";
    }
    
    if (!messageContent || messageContent.trim().length === 0) {
        return "Message content cannot be empty.";
    }
    
    if (messageContent.length > 256) {
        return "Message exceeds maximum length of 256 characters.";
    }
    
    if (!messageHistory.has(userId) || Date.now() - messageHistory.get(userId) > RATE_LIMIT_WINDOW_MS) {
        return null;
    }
    
    const requestCount = Math.floor((Date.now() - messageHistory.get(userId)) / RATE_LIMIT_WINDOW_MS);
    if (requestCount >= RATE_LIMIT_MAX_REQUESTS) {
        return `Rate limit exceeded. Please wait before sending another message.`;
    }
    
    return null;
}

function validateChatRequest(text, userId) {
    if (!text || text.trim().length === 0) {
        return "Message text cannot be empty.";
    }
    
    if (text.length > 256) {
        return "Message exceeds maximum length of 256 characters.";
    }
    
    if (!messageHistory.has(userId) || Date.now() - messageHistory.get(userId) > RATE_LIMIT_WINDOW_MS) {
        return null;
    }
    
    const requestCount = Math.floor((Date.now() - messageHistory.get(userId)) / RATE_LIMIT_WINDOW_MS);
    if (requestCount >= RATE_LIMIT_MAX_REQUESTS) {
        return `Rate limit exceeded. Please wait before sending another message.`;
    }
    
    return null;
}

client.once("ready", () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
});