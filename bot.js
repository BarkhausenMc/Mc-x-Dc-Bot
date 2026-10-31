const { 
    Client, 
    GatewayIntentBits, 
    ApplicationCommandOptionType, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder
} = require("discord.js");
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
                        name: "player",
                        description: "Minecraft username of the recipient",
                        type: ApplicationCommandOptionType.String,
                        required: true
                    },
                    {
                        name: "amount",
                        description: "Payment amount in MC coins",
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
                flags: discord.MessageFlags.Ephemeral
            });
            return;
        }
        
        const playerName = interaction.options.getString("player");
        const messageContent = interaction.options.getString("nachricht");
        
        const validationError = validateRequest(playerName, messageContent, interaction.user.id);
        if (validationError) {
            await interaction.reply({ 
                content: validationError, 
                flags: discord.MessageFlags.Ephemeral
            });
            return;
        }
        
        messageHistory.set(interaction.user.id, Date.now());
        
        try {
            bot.chat(`/msg ${playerName} ${messageContent}`);
            
            await interaction.reply({ 
                content: `Message sent to ${playerName}: "${messageContent}"`, 
                flags: discord.MessageFlags.Ephemeral
            });
        } catch (error) {
            await interaction.reply({ 
                content: "Failed to send message. Bot may be disconnected.", 
                flags: discord.MessageFlags.Ephemeral
            });
        }
    }
    
    if (interaction.commandName === "chat") {
        if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
            await interaction.reply({ 
                content: "You are not authorized to use this command.", 
                flags: discord.MessageFlags.Ephemeral
            });
            return;
        }
        
        const text = interaction.options.getString("text");
        
        const validationError = validateChatRequest(text, interaction.user.id);
        if (validationError) {
            await interaction.reply({ 
                content: validationError, 
                flags: discord.MessageFlags.Ephemeral
            });
            return;
        }
        
        messageHistory.set(interaction.user.id, Date.now());
        
        try {
            bot.chat(text);
            
            await interaction.reply({ 
                content: `Message sent to Minecraft chat: "${text}"`, 
                flags: discord.MessageFlags.Ephemeral
            });
        } catch (error) {
            await interaction.reply({ 
                content: "Failed to send message. Bot may be disconnected.", 
                flags: discord.MessageFlags.Ephemeral
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
                flags: discord.MessageFlags.Ephemeral
            });
            return;
        }
        
        const text = interaction.options.getString("text");
        
        const validationError = validateChatRequest(text, interaction.user.id);
        if (validationError) {
            await interaction.reply({ 
                content: validationError, 
                flags: discord.MessageFlags.Ephemeral
            });
            return;
        }
        
        messageHistory.set(interaction.user.id, Date.now());
        
        try {
            bot.chat(`/c ${text}`);
            
            await interaction.reply({ 
                content: `Message sent to Minecraft chat: "${text}"`, 
                flags: discord.MessageFlags.Ephemeral
            });
        } catch (error) {
            await interaction.reply({ 
                content: "Failed to send message. Bot may be disconnected.", 
                flags: discord.MessageFlags.Ephemeral
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
    
    


client.on("interactionCreate", async (interaction) => {

    if (!interaction.isChatInputCommand() && !interaction.isButton()) return;

    // =================================
    // PAY REQUEST
    // =================================

    if (interaction.isChatInputCommand() && interaction.commandName === "pay-request") {

        // Sofort antworten, damit Discord keinen Timeout meldet
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral
        });

        try {
            // Clan-Rolle überprüfen
            const member = await interaction.guild.members.fetch(interaction.user.id);

            if (!member.roles.cache.has(CLAN_ROLE_ID)) {
                return interaction.editReply(
                    "Du musst Clan-Mitglied sein, um eine Zahlung anzufordern."
                );
            }

            // Eingaben
            const player = interaction.options.getString("player");
            const amount = interaction.options.getInteger("amount");
            const reason = interaction.options.getString("reason");

            // Validierung
            if (!/^[a-zA-Z0-9_]{3,16}$/.test(player)) {
                return interaction.editReply("Ungültiger Minecraft-Spielername.");
            }

            if (amount <= 0 || amount > 1000000) {
                return interaction.editReply(
                    "Der Betrag muss zwischen 1 und 1.000.000 MC Coins liegen."
                );
            }

            if (!reason || reason.length > 200) {
                return interaction.editReply("Der Grund darf maximal 200 Zeichen lang sein.");
            }

            const requestId = `${interaction.user.id}-${Date.now()}`;

            pendingPayRequests.set(requestId, {
                userId: interaction.user.id,
                userName: interaction.user.tag,
                player,
                amount,
                reason
            });

            // Admin-DM
            const admin = await client.users.fetch(AUTHORIZED_USER_IDS[0]);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# 💰 Minecraft Payment Request\n\n` +
                        `**Angefordert von:** ${interaction.user.tag}\n\n` +
                        `**Empfänger:** ${player}\n` +
                        `**Betrag:** ${amount.toLocaleString("de-DE")} MC Coins\n` +
                        `**Grund:** ${reason}\n\n` +
                        `**Minecraft-Befehl:**\n` +
                        `\`/pay ${player} ${amount}\`\n\n` +
                        `Möchtest du diese Zahlung ausführen?`
                    )
                )
                .addSeparatorComponents(
                    new SeparatorBuilder()
                )
                .addActionRowComponents(
                    new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`confirm_${requestId}`)
                            .setLabel("Bestätigen & Pay")
                            .setStyle(ButtonStyle.Success),

                        new ButtonBuilder()
                            .setCustomId(`deny_${requestId}`)
                            .setLabel("Ablehnen")
                            .setStyle(ButtonStyle.Danger)
                    )
                );

            await admin.send({
                flags: MessageFlags.IsComponentsV2,
                components: [container]
            });

            await interaction.editReply(
                `Deine Zahlungsanfrage für ${player} über ${amount.toLocaleString("de-DE")} MC Coins wurde an den Admin gesendet.`
            );

            // Nach 5 Minuten ablaufen lassen
            setTimeout(() => {
                pendingPayRequests.delete(requestId);
            }, 300000);

        } catch (error) {
            console.error("Pay Request Error:", error);

            await interaction.editReply(
                "Fehler beim Erstellen der Zahlungsanfrage. Bitte versuche es erneut."
            ).catch(console.error);
        }
    }


    // =================================
    // PAYMENT BUTTONS
    // =================================

    if (interaction.isButton()) {

        const [action, ...idParts] = interaction.customId.split("_");
        const requestId = idParts.join("_");

        const requestData = pendingPayRequests.get(requestId);

        if (!requestData) {
            return interaction.reply({
                content: "Diese Zahlungsanfrage ist abgelaufen oder ungültig.",
                flags: MessageFlags.Ephemeral
            });
        }

        // Nur autorisierte Admins
        if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
            return interaction.reply({
                content: "Du bist nicht berechtigt, diese Zahlung zu bearbeiten.",
                flags: MessageFlags.Ephemeral
            });
        }

        // =================================
        // CONFIRM PAYMENT
        // =================================

        if (action === "confirm") {

            try {
                // Prüfen, ob Minecraft-Bot verbunden ist
                if (!bot.player) {
                    return interaction.reply({
                        content: "Der Minecraft-Bot ist momentan nicht verbunden.",
                        flags: MessageFlags.Ephemeral
                    });
                }

                // Minecraft-Payment ausführen
                bot.chat(`/pay ${requestData.player} ${requestData.amount}`);

                pendingPayRequests.delete(requestId);

                const result = new ContainerBuilder()
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            `# ✅ Payment-Befehl gesendet\n\n` +
                            `**Admin:** ${interaction.user.tag}\n` +
                            `**Angefordert von:** ${requestData.userName}\n\n` +
                            `**Empfänger:** ${requestData.player}\n` +
                            `**Betrag:** ${requestData.amount.toLocaleString("de-DE")} MC Coins\n` +
                            `**Grund:** ${requestData.reason}\n\n` +
                            `Der Minecraft-Befehl wurde an den Server gesendet.`
                        )
                    );

                await interaction.update({
                    components: [result]
                });

            } catch (error) {
                console.error("Payment Error:", error);

                await interaction.reply({
                    content: "Fehler beim Senden des Minecraft-Payments.",
                    flags: MessageFlags.Ephemeral
                });
            }
        }

        // =================================
        // DENY PAYMENT
        // =================================

        else if (action === "deny") {

            pendingPayRequests.delete(requestId);

            const result = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# ❌ Payment abgelehnt\n\n` +
                        `**Admin:** ${interaction.user.tag}\n` +
                        `**Angefordert von:** ${requestData.userName}\n\n` +
                        `**Empfänger:** ${requestData.player}\n` +
                        `**Betrag:** ${requestData.amount.toLocaleString("de-DE")} MC Coins\n` +
                        `**Grund:** ${requestData.reason}\n\n` +
                        `Es wurde kein Minecraft-Befehl ausgeführt.`
                    )
                );

            await interaction.update({
                components: [result]
            });
        }
    }
});

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