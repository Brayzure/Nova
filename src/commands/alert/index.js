const Eris = require("eris");
const moment = require("moment");

const REACTIONS = {
    DELETE: "🗑",
    CLEAR: "✅"
};

const RESOLUTION_ACTIONS = {
    DELETE: "Message was deleted",
    CLEAR: "Message was ignored"
};

const COLORS = {
    INFO: 0x6666ff,
    RESOLVED: 0x00ff00,
    DELETE: 0xff0000,
    ALERT: 0xffff00
};

const MEMBER_WINDOW_WIDTH = 20;
const CRITICAL_MEMBER_DELAY = 45 * 1000;
const MEMBER_ALERT_COOLDOWN = 60 * 60 * 1000;

const NEW_MEMBER_DURATION = 7 * 24 * 60 * 60 * 1000;

// Session variables
const memberJoinDelays = [];
let lastJoin, lastAlert;

const setalert = {
    commandName: "alert",
    description: "Sets the current channel as the alerts channel",
    permissions: [ "manageGuild" ],
    run: async function({ message, guildManager }) {
        guildManager.state.alert.alertChannel = message.channel.id;
        await guildManager.stateManager.saveState();
        return "Set the current channel as the alerts channel.";
    }
};

const watch = {
    commandName: "watch",
    description: "Watches for a term or phrase.",
    permissions: [ "manageGuild" ],
    run: async function({ args, guildManager }) {
        const term = args.join(" ").toLowerCase();
        guildManager.state.alert.watchlist.push(term);
        await guildManager.stateManager.saveState();
        return `Added ${term} to the watchlist.`;
    }
};

const unwatch = {
    commandName: "unwatch",
    description: "Removes a term from the watchlist.",
    permissions: [ "manageGuild" ],
    run: async function({ args, guildManager }) {
        const term = args.join(" ").toLowerCase();
        const index = guildManager.state.alert.watchlist.indexOf(term);
        if(index !== -1) {
            guildManager.state.alert.watchlist.splice(index, 1);
            await guildManager.stateManager.saveState();
            return `Removed ${term} from the watchlist.`;
        }
        return `Couldn't find ${term} in the watchlist.`;
    }
};

const enable = {
    commandName: "enable",
    descripton: "Enables a watchlist alert for the server.",
    permissions: [ "manageGuild" ],
    run: async function({ args, guildManager }) {
        const alert = args[0].toLowerCase();
        if(!alertFunctionMap[alert]) {
            throw new Error(`Alert **${alert}** not found.`);
        }
        const enabledAlerts = guildManager.state.alert.enabledAlerts;
        if(enabledAlerts.includes(alert)) {
            throw new Error("Alert is already enabled!");
        }
        enabledAlerts.push(alert);
        await guildManager.stateManager.saveState();
        return `Successfully enabled **${alert}** alert!`;
    }
};

const disable = {
    commandName: "disable",
    descripton: "Disables a watchlist alert for the server.",
    permissions: [ "manageGuild" ],
    run: async function({ args, guildManager }) {
        const alert = args[0].toLowerCase();
        if(!alertFunctionMap[alert]) {
            throw new Error(`Alert **${alert}** not found.`);
        }
        const enabledAlerts = guildManager.state.alert.enabledAlerts;
        if(!enabledAlerts.includes(alert)) {
            throw new Error("Alert is already disabled!");
        }
        const alertIndex = enabledAlerts.indexOf(alert);
        enabledAlerts.splice(alertIndex, 1);
        await guildManager.stateManager.saveState();
        return `Successfully disabled **${alert}** alert!`;
    }
};

const watchlist = {
    commandName: "watchlist",
    description: "Lists every word currently on the watchlist",
    permissions: [ "manageMessages" ],
    run: async function({ guildManager }) {
        const list = guildManager.state.alert.watchlist;
        let str = "**Current Watchlist**\n";
        if(list.length) {
            str += list.join("\n");
        }
        else {
            str += "*Nothing*";
        }
        return str;
    }
};

const count = {
    commandName: "count",
    description: "Posts how many unresolved alerts there are",
    permissions: [ "manageMessages" ],
    run: async function({ guildManager }) {
        const alerts = guildManager.state.alert.unresolvedAlerts;
        return `There are currently **${Object.keys(alerts).length}** unresolved alerts.`;
    }
};

const list = {
    commandName: "list",
    description: "Lists current unresolved alerts",
    permissions: [ "manageMessages" ],
    run: async function({ args, guildManager }) {
        const alerts = guildManager.state.alert.unresolvedAlerts;
        const guildID = guildManager.cache.id;
        const channelID = guildManager.state.alert.alertChannel;
        const alertList = [];
        for(const messageID of Object.keys(alerts)) {
            alertList.push(`Link: <https://discordapp.com/channels/${guildID}/${channelID}/${messageID}>`);
        }

        let num = alertList.length;
        if(args.length > 0 && !isNaN(args[0]) && +args[0] > 0) {
            num = Math.floor(+args[0]);
        }
        const str = alertList.length ? "**Unresolved Alerts** (oldest listed first)\n" + alertList.slice(0, num).join("\n") : "*No alerts currently*";
        return str;
    }
};

async function onReaction(message, reaction, userID) {
    const guildManager = message.channel.guild.guildManager;
    if(!Object.values(REACTIONS).includes(reaction.name)
        || !guildManager.state.alert.unresolvedAlerts[message.id]) {
        return;
    }
    const guild = message.channel.guild;
    const member = guild.members.get(userID);
    if(!member.permission.has("manageMessages")) {
        return;
    }
    if(!(message instanceof Eris.Message)) {
        message = await message.channel.getMessage(message.id);
    }
    if(!message || !message.embeds.length || !message.embeds[0].description
        || message.author.id === userID)
    {
        return;
    }
    switch(reaction.name) {
        case REACTIONS.DELETE: {
            const metadata = guildManager.state.alert.unresolvedAlerts[message.id];
            if(!metadata) {
                return;
            }
            const targetChannel = guild.channels.get(metadata.channel);
            if(!targetChannel) {
                return;
            }
            await clearAlert(guildManager, message.id);
            // Message may already be deleted, we don't care if this fails
            // TODO: Don't proceed if message deletion failed for other reasons (like of permissions)
            try {
                await targetChannel.deleteMessage(metadata.id);
            }
            catch (err) {
                // No errors please!
            }
            await resolveAlert(message, RESOLUTION_ACTIONS.DELETE);
            break;
        }
        case REACTIONS.CLEAR:
            await clearAlert(guildManager, message.id);
            await resolveAlert(message, RESOLUTION_ACTIONS.CLEAR);
            break;
        default:
            throw new Error(`Reaction ${reaction.name} present in object, but not handled.`);
    }
}

async function onMessage(message) {
    if(message.member.permission.has("manageMessages")) {
        return;
    }
    const alertChannelID = message.channel.guild.guildManager.state.alert.alertChannel;
    const alertChannel = message.channel.guild.channels.get(alertChannelID);
    if(!alertChannel) {
        return;
    }
    const enabledAlerts = message.channel.guild.guildManager.state.alert.enabledAlerts;
    const triggeredAlerts = [];
    const terms = [];
    for(const alert of enabledAlerts) {
        const alertObject = alertFunctionMap[alert];
        if(alertObject.event === "message") {
            const triggered = alertObject.func(message);
            if(triggered) {
                triggeredAlerts.push(alert);
                if(typeof triggered !== "boolean") {
                    terms.push(triggered);
                }
            }
        }
    }

    if(triggeredAlerts.length) {
        const jumpLinkArgs = [
            "https://discordapp.com/channels",
            message.channel.guild.id,
            message.channel.id,
            message.id
        ];
        const jumpLink = jumpLinkArgs.join("/");
        const description = "**Text:** " + message.cleanContent;
        const authorFullInfo = message.author.username + "#"
            + message.author.discriminator + " (ID: "
            + message.author.id + ")";
        const embed = {
            title: (triggeredAlerts.length === 1 ? "Alert" : "Alerts") + " Triggered",
            description,
            color: COLORS.ALERT,
            fields: [{
                name: "Channel",
                value: message.channel.name,
                inline: true
            },
            {
                name: "Jump Link",
                value: jumpLink,
                inline: false
            },{
                name: "Author",
                value: authorFullInfo,
                inline: true
            },
            {
                name: "Triggered " + (triggeredAlerts.length === 1 ? "Alert" : "Alerts"),
                value: triggeredAlerts.join(", "),
                inline: true
            }],
            footer: {
                text: "Timestamp: " + (new Date()).toUTCString()
            }
        };

        if(terms) {
            embed.fields.push({
                name: "Blocked Terms Found",
                value: terms.join(", "),
                inline: true
            });
        }
        const newMessage = await alertChannel.createMessage({ embed });
        message.channel.guild.guildManager.state.alert.unresolvedAlerts[newMessage.id] = {
            channel: message.channel.id,
            id: message.id
        };
        message.channel.guild.guildManager.state.alert.messageAlertMap[message.id] = newMessage.id;
        await message.channel.guild.guildManager.stateManager.saveState();
        for(const reaction of Object.values(REACTIONS)) {
            newMessage.addReaction(reaction);
        }
    }
}

async function onMessageDelete(message) {
    const guildManager = message.channel.guild.guildManager;
    const alertState = guildManager.state.alert;
    if(!alertState.messageAlertMap[message.id]) {
        return;
    }
    const alertMessage = await findAlertMessage(alertState.messageAlertMap[message.id], message.channel.guild);
    if(!alertMessage) {
        return;
    }
    const alertID = alertState.messageAlertMap[message.id];
    await clearAlert(guildManager, alertID);
    await resolveAlert(alertMessage, RESOLUTION_ACTIONS.DELETE);
}

async function clearAlert(guildManager, alertID) {
    if(guildManager.state.alert.unresolvedAlerts[alertID]) {
        const alert = guildManager.state.alert.unresolvedAlerts[alertID];
        delete guildManager.state.alert.messageAlertMap[alert.id];
        delete guildManager.state.alert.unresolvedAlerts[alertID];
        await guildManager.stateManager.saveState();
    }
}

async function resolveAlert(message, actionTaken) {
    const embed = message.embeds[0];
    if(actionTaken === RESOLUTION_ACTIONS.DELETE) {
        embed.color = COLORS.DELETE;
    }
    else if(actionTaken === RESOLUTION_ACTIONS.CLEAR) {
        embed.color = COLORS.RESOLVED;
    }
    const resolutionField = {
        name: "Action Taken",
        value: actionTaken,
        inline: true
    };
    embed.fields.push(resolutionField);
    embed.title = embed.title.replace("Triggered", "Resolved");
    await message.edit({ embed });
}

async function onGuildMemberAdd(guild, member) {
    const alertChannelID = guild.guildManager.state.alert.alertChannel;
    const alertChannel = guild.channels.get(alertChannelID);
    if(!alertChannel) {
        return;
    }
    const enabledAlerts = guild.guildManager.state.alert.enabledAlerts;
    const triggeredAlerts = [];
    const messages = [];
    for(const alert of enabledAlerts) {
        const alertObject = alertFunctionMap[alert];
        if(alertObject.event === "member") {
            const triggered = await alertObject.func(guild, member);
            if(triggered) {
                triggeredAlerts.push(alert);
                if(typeof triggered !== "boolean") {
                    messages.push(`${alert}: ${triggered}`);
                }
            }
        }
    }

    if(triggeredAlerts.length) {
        const description = `
            **User**: ${member.user.username}#${member.user.discriminator} (ID: ${member.user.id})
            ${messages.length ? "**Alert Details**:\n" + messages.join("\n") : ""}
        `;
        const embed = {
            title: "Member Alert",
            description,
            color: COLORS.INFO,
            fields: [
                {
                    name: `Triggered Alert${triggeredAlerts.length > 1 ? "s" : ""}`,
                    value: triggeredAlerts.join(", "),
                    inline: true
                }
            ]
        };
        await alertChannel.createMessage({ embed });
    }
}

function checkWatchlist(message) {
    const watchlist = message.channel.guild.guildManager.state.alert.watchlist;
    for(const term of watchlist) {
        if(message.content.toLowerCase().includes(term)) {
            return term;
        }
    }
    return false;
}

async function checkMassJoin(guild) {
    const now = Date.now();
    if(!lastJoin) {
        lastJoin = now;
    }
    else {
        const delay = now - lastJoin;
        memberJoinDelays.push(delay);
        lastJoin = now;
    }
    if(memberJoinDelays.length < MEMBER_WINDOW_WIDTH / 2) {
        return;
    }

    const sample = memberJoinDelays.slice(-1 * MEMBER_WINDOW_WIDTH);
    const cappedSample = capArrayByMedian(sample, 1.5);
    const meanDelay = mean(cappedSample);
    if(meanDelay < CRITICAL_MEMBER_DELAY) {
        if(!lastAlert || now - lastAlert > MEMBER_ALERT_COOLDOWN) {
            const alertState = guild.guildManager.state.alert;
            const alertChannelID = alertState.alertChannel;
            const alertChannel = guild.channels.get(alertChannelID);
            if(!alertChannel) {
                return;
            }
            lastAlert = now;
            const embed = {
                title: "Mass Join Alert",
                description: `Average of most recent ${MEMBER_WINDOW_WIDTH} delays is ${Math.floor(meanDelay)}ms per join`,
                color: COLORS.INFO
            };
            await alertChannel.createMessage({ embed });
            return false;
        }
    }
    return false;
}

function checkNewAccount(guild, member) {
    const now = Date.now();
    const accountAge = now - member.createdAt;
    if(accountAge < NEW_MEMBER_DURATION) {
        return `Account is ${moment.duration(accountAge).humanize()} old`;
    }
    return false;
}

async function findAlertMessage(id, guild) {
    let message;
    const alertState = guild.guildManager.state.alert;
    const alert = alertState.unresolvedAlerts[id];
    if(!alert) {
        return message;
    }
    const channel = guild.channels.get(alertState.alertChannel);
    if(!channel) {
        return message;
    }
    try {
        message = await channel.getMessage(id);
    }
    catch(err) {
        // Don't care what the error is, important part is message var isn't modified
    }
    return message;
}

const alertFunctionMap = {
    watchlist: {
        event: "message",
        func: checkWatchlist
    },
    massjoin: {
        event: "member",
        func: checkMassJoin
    },
    newaccount: {
        event: "member",
        func: checkNewAccount
    }
};

module.exports = {
    moduleName: "Alerts Manager",
    moduleID: "alert",
    moduleDescription: "Manages configurable alerts and"
        + " dispatches them to the specified channel",
    botPermissions: [ "manageMessages" ],
    commands: {
        watch,
        unwatch,
        enable,
        disable,
        watchlist,
        count,
        list
    },
    baseModifiers: {
        set: setalert
    },
    ensureState: {
        enabledAlerts: [ "watchlist" ],
        alertChannel: "",
        watchlist: [],
        unresolvedAlerts: {},
        messageAlertMap: {}
    },
    events: {
        messageCreate: onMessage,
        messageReactionAdd: onReaction,
        messageDelete: onMessageDelete,
        guildMemberAdd: onGuildMemberAdd
    }
};

function capArrayByMedian(array, multiplier = 1) {
    const medianValue = median(array);
    return array.map(e => Math.min(e, medianValue * multiplier));
}

function median(array) {
    const arr = array.slice(0);
    arr.sort((a, b) => b - a);
    const middleIndex = (array.length - 1) / 2;
    if(middleIndex === Math.floor(middleIndex)) {
        return arr[middleIndex];
    }
    else {
        return mean(arr.slice(middleIndex - 0.5, middleIndex + 0.5));
    }
}

function mean(array) {
    return array.reduce((a, b) => a + b, 0) / array.length;
}
