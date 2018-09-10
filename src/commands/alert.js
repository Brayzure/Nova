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

function onMessage(message) {
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
                text: `Timestamp: ${(new Date().toUTCString())}`
            }
        }
        alertChannel.createMessage({ embed });
    }
}

function checkCondition(message, condition) {
    switch(condition) {
        case "watchlist":
            return checkWatchlist(message);
            break;
    }
    return false;
}

function checkWatchlist(message) {
    const watchlist = message.channel.guild.guildManager.state.alert.watchlist;
    return watchlist.some((term) => {
        return message.content.toLowerCase().includes(term);
    });
}

const alertFunctionMap = {
    watchlist: checkWatchlist
}

module.exports = {
    moduleName: "Alerts Manager",
    moduleID: "alert",
    moduleDescription: "Manages configurable alerts and"
        + " and dispatches them to the specified channel",
    botPermissions: [ "manageMessages" ],
    commands: {
        setalert,
        watch,
        unwatch
    },
    ensureState: {
        enabledAlerts: [ "watchlist" ],
        alertChannel: "",
        watchlist: []
    },
    events: {
        messageCreate: onMessage
    }
}
