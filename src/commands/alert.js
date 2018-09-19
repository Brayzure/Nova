const Eris = require("eris");

const REACTIONS = {
    DELETE: "🗑",
    CLEAR: "✅"
};

const setalert = {
    commandName: "setalert",
    description: "Sets the current channel as the alerts channel",
    permissions: [ "manageGuild" ],
    run: async function({ message, guildManager }) {
        guildManager.state.alert.alertChannel = message.channel.id;
        await guildManager.stateManager.saveState();
        return "Set the current channel as the alerts channel."
    }
}

const watch = {
    commandName: "watch",
    description: "Watches for a term or phrase.",
    permissions: [ "manageGuild" ],
    run: async function({ message, args, guildManager }) {
        const term = args.join(" ").toLowerCase();
        guildManager.state.alert.watchlist.push(term);
        await guildManager.stateManager.saveState();
        return `Added ${term} to the watchlist.`;
    }
}

const unwatch = {
    commandName: "unwatch",
    description: "Removes a term from the watchlist.",
    permissions: [ "manageGuild" ],
    run: async function({ message, args, guildManager }) {
        const term = args.join(" ").toLowerCase();
        const index = guildManager.state.alert.watchlist.indexOf(term);
        if(index !== -1) {
            guildManager.state.alert.watchlist.splice(index, 1);
            await guildManager.stateManager.saveState();
            return `Removed ${term} from the watchlist.`;
        }
        return `Couldn't find ${term} in the watchlist.`;
    }
}

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
}

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
}

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
}

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
        case REACTIONS.DELETE:
            const metadata = guildManager.state.alert.unresolvedAlerts[message.id];
            if(!metadata) {
                return;
            }
            const targetChannel = guild.channels.get(metadata.channel);
            if(!targetChannel) {
                return;
            }
            await clearAlert(guildManager, message.id);
            await targetChannel.deleteMessage(metadata.id);
            await message.delete();
            break;
        case REACTIONS.CLEAR:
            await clearAlert(guildManager, message.id);
            await message.delete();
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
    enabledAlerts.forEach((alert) => {
        const triggered = alertFunctionMap[alert](message);
        if(triggered) triggeredAlerts.push(alert);
    });

    if(triggeredAlerts.length) {
        const jumpLinkArgs = [
            "https://discordapp.com/channels",
            message.channel.guild.id,
            message.channel.id,
            message.id
        ]
        const jumpLink = jumpLinkArgs.join("/");
        const description = "**Text:** " + message.cleanContent
            + "\n**Jump Link:** " + jumpLink;
        const authorFullInfo = message.author.username + "#"
            + message.author.discriminator + " (ID: "
            + message.author.id + ")";
        const embed = {
            title: (triggeredAlerts.length === 1 ? "Alert" : "Alerts") + " Triggered",
            description,
            color: 0xffa500,
            fields: [{
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
        }
        const newMessage = await alertChannel.createMessage({ embed });
        message.channel.guild.guildManager.state.alert.unresolvedAlerts[newMessage.id] = {
            channel: message.channel.id,
            id: message.id
        }
        await message.channel.guild.guildManager.stateManager.saveState();
        for(reaction of Object.values(REACTIONS)) {
            newMessage.addReaction(reaction);
        }
    }
}

async function clearAlert(guildManager, alertID) {
    if(guildManager.state.alert.unresolvedAlerts[alertID]) {
        delete guildManager.state.alert.unresolvedAlerts[alertID];
        await guildManager.stateManager.saveState();
    }
}

function checkWatchlist(message) {
    const watchlist = message.channel.guild.guildManager.state.alert.watchlist;
    return watchlist.some((term) => {
        return message.content.toLowerCase().includes(term);
    });
}

const alertFunctionMap = {
    watchlist: checkWatchlist
};

module.exports = {
    moduleName: "Alerts Manager",
    moduleID: "alert",
    moduleDescription: "Manages configurable alerts and"
        + " and dispatches them to the specified channel",
    botPermissions: [ "manageMessages" ],
    commands: {
        setalert,
        watch,
        unwatch,
        enable,
        disable,
        watchlist
    },
    ensureState: {
        enabledAlerts: [ "watchlist" ],
        alertChannel: "",
        watchlist: [],
        unresolvedAlerts: {}
    },
    events: {
        messageCreate: onMessage,
        messageReactionAdd: onReaction
    }
}
