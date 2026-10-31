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
                        description: "Minecraft username receiving the payment",
                        type: ApplicationCommandOptionType.String,
                        required: true
                    },
                    {
                        name: "amount",
                        description: "Payment amount (e.g. $100)",
                        type: ApplicationCommandOptionType.String,
                        required: true
                    },
                    {
                        name: "reason",
                        description: "Reason for the payment",
                        type: ApplicationCommandOptionType.String,
                        required: true
                    },

                ]
            },

            {
                name: "clan-info",
                description: "Shows all clan members and their roles"
            },

        ];
        
        try {
            for (const command of commands) {
    try {
        await guild.commands.create(command);
        console.log(`Registered: /${command.name}`);
    } catch (error) {
        console.error(`Failed: /${command.name}`);
        console.error(JSON.stringify(error.rawError?.errors, null, 2));
    }
}
            console.log("Slash commands registered successfully");
        } catch (error) {
            console.error("Failed to register slash commands:", error);
        }
    }
});




function extractComponentText(component) {
    if (!component) return "";

    if (typeof component === "string") {
        return component;
    }

    if (Array.isArray(component)) {
        return component.map(extractComponentText).join("");
    }

    if (typeof component !== "object") return "";

    let result = typeof component.text === "string"
        ? component.text
        : "";

    if (Array.isArray(component.extra)) {
        result += component.extra
            .map(extractComponentText)
            .join("");
    }

    return result;
}


function extractRoleNames(text, startRegex, endRegex) {
    const startMatch = startRegex.exec(text);

    if (!startMatch) return [];

    const startIndex = startMatch.index + startMatch[0].length;
    const remaining = text.slice(startIndex);

    const endMatch = endRegex.exec(remaining);

    let section = endMatch
        ? remaining.slice(0, endMatch.index)
        : remaining;

    // Remove the section count, e.g. (12):
    section = section.replace(/^\s*\(\d+\)\s*:\s*/, "");

    // Split players by bullet points
    let names = section.split("•")
        .map(name => name.replace(/\s+/g, " ").trim())
        .filter(Boolean);

    // Leader has no bullet point
    if (names.length === 1 && !section.includes("•")) {
        names = [names[0].split(" ")[0]];
    }

    return names;
}

function parseClanInfo(text) {

    const clan = {
        name: text.match(/Name:\s*(.+)/)?.[1]?.trim() || "Unknown",
        tag: text.match(/Kürzel:\s*(.+)/)?.[1]?.trim() || "Unknown",
        created: text.match(/Erstelldatum:\s*(.+)/)?.[1]?.trim() || "Unknown",
        onlineTime: text.match(/Online-Zeit:\s*(.+)/)?.[1]?.trim() || "Unknown",

        leader: [],
        coLeaders: [],
        moderators: [],
        members: []
    };

    clan.leader = extractRoleNames(
        text,
        /Leader:\s*/,
        /Co-Leader\s*\(\d+\)\s*:/
    );

    clan.coLeaders = extractRoleNames(
        text,
        /Co-Leader\s*\(\d+\)\s*:\s*/,
        /Moderatoren\s*\(\d+\)\s*:/
    );

    clan.moderators = extractRoleNames(
        text,
        /Moderatoren\s*\(\d+\)\s*:\s*/,
        /Mitglieder\s*\(\d+\)\s*:/
    );

    clan.members = extractRoleNames(
        text,
        /Mitglieder\s*\(\d+\)\s*:\s*/,
        /$^/
    );

    return clan;
}

function getClanInfo() {
    return new Promise((resolve, reject) => {

        if (!bot.player) {
            return reject(new Error("Minecraft bot is not connected."));
        }

        let finished = false;
        let responseTimer;
        let timeout;

        function cleanup() {
            clearTimeout(timeout);
            clearTimeout(responseTimer);
            bot.removeListener("message", messageHandler);
        }

        function finish(error, result) {
            if (finished) return;

            finished = true;
            cleanup();

            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        }


        function messageHandler(jsonMsg, position) {
            if (position !== "system") return;

            // Mineflayer liefert bereits ein JSON-Objekt.
            const component = jsonMsg?.json ?? jsonMsg;

            const text = extractComponentText(component)
                || (typeof jsonMsg?.toString === "function"
                    ? jsonMsg.toString()
                    : "");

            if (!text.includes("Clan-Informationen")) return;

            console.log("[CLAN INFO] Clan response received:");
            console.log(text);

            clearTimeout(responseTimer);

            responseTimer = setTimeout(() => {
                try {
                    const clan = parseClanInfo(text);

                    if (!clan.name || clan.name === "Unknown") {
                        return finish(
                            new Error("Could not parse clan name.")
                        );
                    }

                    finish(null, clan);
                } catch (error) {
                    finish(error);
                }
            }, 300);
        }


        bot.on("message", messageHandler);

        timeout = setTimeout(() => {
            finish(new Error("Clan information timed out."));
        }, 10000);

        try {
            console.log("[CLAN INFO] Executing /clan info");
            bot.chat("/clan info");
        } catch (error) {
            finish(error);
        }
    });
}


client.on("interactionCreate", async (interaction) => {

    // ==========================
    // PAYMENT REQUEST BUTTONS
    // ==========================

    if (interaction.isButton()) {

    const [action, requestId] = interaction.customId.split("_");

    if (action !== "confirm" && action !== "deny") return;

    // Only authorized admins
    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
        await interaction.reply({
            content: "You are not authorized to review payment requests.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const requestData = pendingPayRequests.get(requestId);

    if (!requestData || Date.now() > requestData.expiresAt) {
        pendingPayRequests.delete(requestId);

        await interaction.reply({
            content: "This payment request has expired or is invalid.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (action === "confirm") {

        try {
            // Execute Minecraft payment
            if (!bot.player) {
                throw new Error("Minecraft bot is not connected.");
            }

            bot.chat(`/pay ${requestData.player} ${requestData.amount}`);

            pendingPayRequests.delete(requestId);

            const container = new ContainerBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `# ✅ Payment Confirmed & Sent\n\n` +
                        `**Confirmed by:** ${interaction.user.tag}\n\n` +
                        `**Requested by:** ${requestData.userName}\n\n` +
                        `**Recipient:** ${requestData.player}\n\n` +
                        `**Amount:** $${requestData.amount}\n\n` +
                        `**Reason:** ${requestData.reason}\n\n` +
                        `**Minecraft Command:**\n` +
                        `\`/pay ${requestData.player} ${requestData.amount}\``
                    )
                );

            await interaction.update({
                components: [container]
            });

        } catch (error) {

            console.error("Payment execution failed:", error);

            await interaction.reply({
                content: "Payment failed. Minecraft bot may be disconnected.",
                flags: MessageFlags.Ephemeral
            });
        }

    } else if (action === "deny") {

        pendingPayRequests.delete(requestId);

        const container = new ContainerBuilder()
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    `# ❌ Payment Request Denied\n\n` +
                    `**Denied by:** ${interaction.user.tag}\n\n` +
                    `**Requested by:** ${requestData.userName}\n\n` +
                    `**Recipient:** ${requestData.player}\n\n` +
                    `**Amount:** $${requestData.amount}\n\n` +
                    `**Reason:** ${requestData.reason}\n\n` +
                    `No Minecraft payment was executed.`
                )
            );

        await interaction.update({
            components: [container]
        });
    }

    return;
}

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
    

if (interaction.commandName === "pay-request") {

    // Check clan role
    const member = await interaction.guild.members.fetch(interaction.user.id);

    if (!member.roles.cache.has(CLAN_ROLE_ID)) {
        await interaction.reply({
            content: "Only clan members can use this command.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const player = interaction.options.getString("player");
    const rawAmount = interaction.options.getString("amount");
    const reason = interaction.options.getString("reason");

    // Validate Minecraft username
    if (!/^[a-zA-Z0-9_]{3,16}$/.test(player)) {
        await interaction.reply({
            content: "Invalid Minecraft username.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Remove $ and validate amount
    const amountString = rawAmount.replace(/^\$/, "");

    if (!/^\d+$/.test(amountString)) {
        await interaction.reply({
            content: "Invalid amount. Example: $100",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const amount = Number(amountString);

    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 1000000) {
        await interaction.reply({
            content: "Amount must be between $1 and $1,000,000.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    if (!reason || reason.trim().length === 0) {
        await interaction.reply({
            content: "Please provide a reason.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    const requestId = `${interaction.user.id}-${Date.now()}`;

    pendingPayRequests.set(requestId, {
        userId: interaction.user.id,
        userName: interaction.user.tag,
        player,
        amount,
        reason,
        createdAt: Date.now(),
        expiresAt: Date.now() + 300000
    });

    // Components V2 Buttons
    const buttonRow = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId(`confirm_${requestId}`)
                .setLabel("Confirm Payment")
                .setStyle(ButtonStyle.Success),

            new ButtonBuilder()
                .setCustomId(`deny_${requestId}`)
                .setLabel("Deny")
                .setStyle(ButtonStyle.Danger)
        );

    // Components V2 Container
    const container = new ContainerBuilder()
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                `# 💰 New Payment Request\n\n` +
                `**Requested by:** ${interaction.user.tag}\n\n` +
                `**Recipient:** ${player}\n\n` +
                `**Amount:** $${amount.toLocaleString("en-US")}\n\n` +
                `**Reason:** ${reason}\n\n` +
                `**Status:** ⏳ Waiting for admin approval\n\n` +
                `**Minecraft Command:**\n` +
                `\`/pay ${player} ${amount}\`\n\n` +
                `A reviewer must confirm or deny this payment.`
            )
        )
        .addActionRowComponents(buttonRow);

    let delivered = 0;

    // Send DM to authorized admins
    for (const adminId of AUTHORIZED_USER_IDS) {

        try {
            const admin = await client.users.fetch(adminId);

            await admin.send({
                components: [container],
                flags: MessageFlags.IsComponentsV2
            });

            delivered++;

        } catch (error) {
            console.error(`Could not DM ${adminId}:`, error);
        }
    }

    if (delivered === 0) {

        pendingPayRequests.delete(requestId);

        await interaction.reply({
            content: "Could not reach any reviewer via DM.",
            flags: MessageFlags.Ephemeral
        });

        return;
    }

    await interaction.reply({
        content: `Payment request sent to ${delivered} reviewer(s).`,
        flags: MessageFlags.Ephemeral
    });

    // Expire after 5 minutes
    setTimeout(() => {

        if (pendingPayRequests.has(requestId)) {
            pendingPayRequests.delete(requestId);
            console.log(`Pay request ${requestId} expired`);
        }

    }, 300000);
}

            //==================
            // Clan
            //==================


function createClanInfoContainer(clan) {
    const totalMembers =
        clan.leader.length +
        clan.coLeaders.length +
        clan.moderators.length +
        clan.members.length;

    const formatPlayers = (players) => {
        if (!players.length) return "- Keine";

        return players
            .map(player => `• ${player}`)
            .join("\n");
    };

    const container = new ContainerBuilder()
    .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# ⚔️ Clan Information\n` +
            `### 🏷️ ${clan.name} [${clan.tag}]\n` +
            `Welcome to the clan overview!`
        )
    )
    .addSeparatorComponents(
        new SeparatorBuilder()
    )
    .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `**📅 Created:** \`${clan.created}\`\n` +
            `**⏱️ Online Time:** \`${clan.onlineTime}\`\n` +
            `**👥 Total Members:** \`${totalMembers}\``
        )
    )
    .addSeparatorComponents(
        new SeparatorBuilder()
    )
    .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 👑 Leader (${clan.leader.length})\n` +
            `${formatPlayers(clan.leader)}`
        )
    )
    .addSeparatorComponents(
        new SeparatorBuilder()
    )
    .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 🛡️ Co-Leaders (${clan.coLeaders.length})\n` +
            `${formatPlayers(clan.coLeaders)}`
        )
    )
    .addSeparatorComponents(
        new SeparatorBuilder()
    )
    .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## 🔨 Moderators (${clan.moderators.length})\n` +
            `${formatPlayers(clan.moderators)}`
        )
    )
    .addSeparatorComponents(
        new SeparatorBuilder()
    )
    .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `## ⚔️ Members (${clan.members.length})\n` +
            `${formatPlayers(clan.members)}`
        )
    )
    .addSeparatorComponents(
        new SeparatorBuilder()
    )
    .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `-# Trading Clan • \`[TRADE]\``
        )
    );

    return container;
}

    await interaction.editReply({
    components: [container],
    flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
});

if (interaction.commandName === "clan-info") {

    if (!AUTHORIZED_USER_IDS.includes(interaction.user.id)) {
        await interaction.reply({
            content: "You are not authorized to use this command.",
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Components V2 Flag (32768)
    const V2_FLAG = MessageFlags.IsComponentsV2 ?? 32768;

    await interaction.deferReply({
        flags: V2_FLAG
    });

    try {
        const clan = await getClanInfo();

        const formatPlayers = (players) =>
            players.length
                ? players.map(p => `• ${p}`).join("\n")
                : "None";

        const content =
            `# ⚔️ ${clan.name}\n` +
            `**Clan Information**\n\n` +
            `**Tag:** ${clan.tag}\n` +
            `**Created:** ${clan.created}\n` +
            `**Online Time:** ${clan.onlineTime}\n\n` +
            `## 👑 Leader (${clan.leader.length})\n` +
            `${formatPlayers(clan.leader)}\n\n` +
            `## 🛡️ Co-Leaders (${clan.coLeaders.length})\n` +
            `${formatPlayers(clan.coLeaders)}\n\n` +
            `## 🔨 Moderators (${clan.moderators.length})\n` +
            `${formatPlayers(clan.moderators)}\n\n` +
            `## ⚔️ Members (${clan.members.length})\n` +
            `${formatPlayers(clan.members)}\n\n` +
            `-# Total Members: ${
                clan.leader.length +
                clan.coLeaders.length +
                clan.moderators.length +
                clan.members.length
            }`;

        const container = new ContainerBuilder()
            .setAccentColor(0x5865F2)
            .addTextDisplayComponents(
                new TextDisplayBuilder().setContent(content)
            );

        console.log("[V2 DEBUG]", {
            flag: V2_FLAG,
            containerType: container.toJSON().type,
            components: container.toJSON().components.length
        });

        await interaction.editReply({
            flags: MessageFlags.IsComponentsV2,
            components: [container]
        });

        console.log("[CLAN INFO] Successfully displayed in Discord.");

    } catch (error) {
        console.error("[CLAN INFO ERROR]", error);

        // Fallback: normal text, not another invalid container
        const errorContainer = new ContainerBuilder()
    .setAccentColor(0xED4245)
    .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
            `# ❌ Clan Information Error\n\n` +
            `Could not retrieve clan information from Minecraft.\n\n` +
            `**Error:** \`${error.message}\``
        )
    );

await interaction.editReply({
    flags: MessageFlags.IsComponentsV2,
    components: [errorContainer]
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

client.on("clientReady", (clientInstance) => {
    console.log(`Discord bot logged in as ${clientInstance.user.tag}`);
});

process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
});