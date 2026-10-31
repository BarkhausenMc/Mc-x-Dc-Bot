const { Client, GatewayIntentBits, ApplicationCommandOptionType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors } = require("discord.js");
const mineflayer = require("mineflayer");
require("dotenv").config();

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const AUTHORIZED_USER_IDS = (process.env.AUTHORIZED_USER_IDS || "").split(",").filter(id => id.trim());
const CLAN_ROLE_ID = process.env.CLAN_ROLE_ID; 
const pendingPayRequests = new Map();
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

            //==================
            // Generell
            //==================

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

            //==================
            // Clan 
            //==================

            {
                name: "clan-chat",
                description: "Send a message to the Clan chat",
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
            },

            {
                name: "clan-invite",
                description: "Invits a Player into the Clan",
                options: [
                    {
                        name: "player",
                        description: "Player is getting invited into the Clan",
                        type: ApplicationCommandOptionType.String,
                        required: true
                    }
                ]
            },

            //==================
            // Payments
            //==================

            {
                name: "pay",
                description: "Pays someone Money Ingame",
                options: [
                    {
                        name: "player",
                        description: "Minecraft username of the recipient",
                        type: ApplicationCommandOptionType.String,
                        required: true
                    },
                    {
                        name: "amount",
                        description: "A pay out for Clan Duels or Spawner",
                        type: ApplicationCommandOptionType.String,
                        required: true
                    }
                ]
            },
    
            {
                name: "pay-request",
                description: "Send a payment request for clan review",
                options: [
                    {
                        name: "amount",
                        description: "Payment amount on HugoSMP",
                        type: ApplicationCommandOptionType.Integer,
                        required: true
                    },
                    {
                        name: "reason",
                        description: "Reason for the payment",
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
    
            //==================
            // Generell
            //==================

    if (interaction.commandName === "msg") {
        if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
            await interaction.reply({ 
                content: "You are not authorized to use this command.", 
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        const playerName = interaction.options.getString("player");
        const messageContent = interaction.options.getString("nachricht");
        
        const validationError = validateRequest(playerName, messageContent, interaction.user.id);
        if (validationError) {
            await interaction.reply({ 
                content: validationError, 
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        messageHistory.set(interaction.user.id, Date.now());
        
        try {
            bot.chat(`/msg ${playerName} ${messageContent}`);
            
            await interaction.reply({ 
                content: `Message sent to ${playerName}: "${messageContent}"`, 
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            await interaction.reply({ 
                content: "Failed to send message. Bot may be disconnected.", 
                flags: MessageFlags.Ephemeral
            });
        }
    }
    
    if (interaction.commandName === "chat") {
        if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
            await interaction.reply({ 
                content: "You are not authorized to use this command.", 
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        const text = interaction.options.getString("text");
        
        const validationError = validateChatRequest(text, interaction.user.id);
        if (validationError) {
            await interaction.reply({ 
                content: validationError, 
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        messageHistory.set(interaction.user.id, Date.now());
        
        try {
            bot.chat(text);
            
            await interaction.reply({ 
                content: `Message sent to Minecraft chat: "${text}"`, 
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            await interaction.reply({ 
                content: "Failed to send message. Bot may be disconnected.", 
                flags: MessageFlags.Ephemeral
            });
        }
    }

            //==================
            // Clan 
            //==================

    if (interaction.commandName === "clan-chat") {
        if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
            await interaction.reply({ 
                content: "You are not authorized to use this command.", 
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        const text = interaction.options.getString("text");
        
        const validationError = validateChatRequest(text, interaction.user.id);
        if (validationError) {
            await interaction.reply({ 
                content: validationError, 
                flags: MessageFlags.Ephemeral
            });
            return;
        }
        
        messageHistory.set(interaction.user.id, Date.now());
        
        try {
            bot.chat(`/c ${text}`);
            
            await interaction.reply({ 
                content: `Message sent to Minecraft chat: "${text}"`, 
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            await interaction.reply({ 
                content: "Failed to send message. Bot may be disconnected.", 
                flags: MessageFlags.Ephemeral
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

        const validationError = validateChatRequest(playerName, interaction.user.id);
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

            setTimeout(() => {
                bot.chat(`/clan kick ${playerName} confirm`);
            }, 1100);

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

    if (interaction.commandName === "clan-invite") {
        if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
            await interaction.reply({
                content: "You are not authorized to use this command.",
                ephemeral: true
            });
            return;
        }

        const playerName = interaction.options.getString("player");

        const validationError = validateChatRequest(playerName, interaction.user.id);
        if (validationError) {
            await interaction.reply({
                content: validationError,
                ephemeral: true
            });
            return;
        }

        messageHistory.set(interaction.user.id, Date.now());

        try {
            bot.chat(`/clan invite ${playerName}`);

            await interaction.reply({
                content: `Player ${playerName} got invitet in to the Clan`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({
                content: "Failed to send message. Bot may be disconnected.",
                ephemeral: true
            });
        }
    }

            //==================
            // Payments
            //==================
    
    if (interaction.commandName === "pay") {
        if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
            await interaction.reply({
                content: "You are not authorized to use this command.",
                ephemeral: true
            });
            return;
        }

        const amount = interaction.options.getString("amount");
        const playerName = interaction.options.getString("player");

        const validationError = validateChatRequest(amount, playerName, interaction.user.id);
        if (validationError) {
            await interaction.reply({
                content: validationError,
                ephemeral: true
            });
            return;
        }

        messageHistory.set(interaction.user.id, Date.now());

        try {
            bot.chat(`/pay ${playerName} ${amount}`);

            await interaction.reply({
                content: `Player ${playerName} got ${amount} payed`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({
                content: "Failed to send message. Bot may be disconnected.",
                ephemeral: true
            });
        }
    }   
    
    if (interaction.commandName === "pay-request") {
        const member = await interaction.guild.members.fetch(interaction.user.id);
        if (!member.roles.cache.has(CLAN_ROLE_ID)) {
            await interaction.reply({
                content: "Only clan members can use this command.",
                ephemeral: true
            });
            return;
        }

        const amount = interaction.options.getInteger("amount");
        const reason = interaction.options.getString("reason");

        if (amount <= 0 || amount > 1000000) {
            await interaction.reply({
                content: "Amount must be between 1 and 1,000,000 MC coins.",
                ephemeral: true
            });
            return;
        }

        const requestId = `${interaction.user.id}-${Date.now()}`;
        pendingPayRequests.set(requestId, {
            userId: interaction.user.id,
            userName: interaction.user.tag,
            amount,
            reason,
            createdAt: Date.now(),
            expiresAt: Date.now() + 300000
        });

        const embed = new discord.EmbedBuilder()
            .setTitle("Payment Request Confirmation")
            .setDescription(`**Amount:** ${amount} MC coins\n**Reason:** ${reason}`)
            .setColor(discord.Colors.Purple)
            .setFooter({ text: `Request ID: ${requestId.substring(0, 12)}` })
            .setTimestamp();

        const components = new discord.ActionRowBuilder()
            .addComponents(
                new discord.ButtonBuilder()
                    .setCustomId(`confirm_${requestId}`)
                    .setLabel("Confirm Payment")
                    .setStyle(discord.ButtonStyle.Success)
                    .setEmoji("✅"),
                new discord.ButtonBuilder()
                    .setCustomId(`deny_${requestId}`)
                    .setLabel("Deny")
                    .setStyle(discord.ButtonStyle.Danger)
                    .setEmoji("❌")
            );

        try {
            await interaction.user.send({
                embeds: [embed],
                components: [components]
            });

            await interaction.reply({
                content: `Payment request sent! Check your DMs for confirmation.`,
                ephemeral: true
            });
        } catch (error) {
            await interaction.reply({
                content: "Could not send DM. Make sure DMs are enabled.",
                ephemeral: true
            });
        }

        setTimeout(() => {
            if (pendingPayRequests.has(requestId)) {
                pendingPayRequests.delete(requestId);
                console.log(`Pay request ${requestId} expired`);
            }
        }, 300000);

            if (interaction.isButton()) {
        const [action, requestId] = interaction.customId.split("_");
        const requestData = pendingPayRequests.get(requestId);

        if (!requestData) {
            await interaction.reply({
                content: "This payment request has expired or is invalid.",
                ephemeral: true
            });
            return;
        }

        if (action === "confirm") {
            pendingPayRequests.delete(requestId);

            await interaction.update({
                embeds: [],
                components: [],
                content: `✅ Payment request confirmed by **${interaction.user.tag}**.\n**Recipient:** ${requestData.userName}\n**Amount:** ${requestData.amount} MC coins\n**Reason:** ${requestData.reason}`
            });
        }

        if (action === "deny") {
            pendingPayRequests.delete(requestId);

            await interaction.update({
                embeds: [],
                components: [],
                content: `❌ Payment request denied by **${interaction.user.tag}**.`,
                ephemeral: true
            });
        }
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

client.on("clientReady", (clientInstance) => {
    console.log(`Discord bot logged in as ${clientInstance.user.tag}`);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
});