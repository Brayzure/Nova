const add = {
    commandName: "add",
    description: "Adds the phrase to the filter",
    permissions: [ "manageChannels" ],
    run: async function({ message, args, guildManager }) {
        // Parse target channels, if provided
        let targetChannels = [];
        while(args.length && args[0].match(/<#\d{16,20}>/)) {
            targetChannels.push(args[0].replace(/\D/g, ""));
            args.splice(0, 1);
        }

        let phrase = returnStr = "";
        let newAdds = 0
        let oldAdds = 0;
        // Add to channel-specific lists if applicable
        if(targetChannels.length) {
            phrase = args.join(" ");
            for(const channel of targetChannels) {
                if(!guildManager.state.filter.blacklist.hasOwnProperty(channel)) {
                    guildManager.state.filter.blacklist[channel] = [];
                }
                const lowercaseBlacklist = guildManager.state.filter.blacklist[channel].map(e => e.toLowerCase());
                if(lowercaseBlacklist.includes(phrase.toLowerCase())) {
                    oldAdds++;
                    continue;
                }
                newAdds++;
                guildManager.state.filter.blacklist[channel].push(phrase);
            }
            if(newAdds === 0) {
                throw new Error(`You provided ${oldAdds} channel${oldAdds > 1 ? "s" : ""} that **${phrase}** is already on.`);
            }
            returnStr = `Phrase **${phrase}** added to ${newAdds} channel filter${newAdds > 1 ? "s" : ""}.`;
            if(oldAdds > 0) {
                returnStr += ` You provided ${oldAdds} channel${oldAdds > 1 ? "s" : ""} that it is already on.`;
            }
        }
        // Add to global list otherwise
        else {
            const lowercaseBlacklist = guildManager.state.filter.blacklist.global.map(e => e.toLowerCase());
            phrase = args.join(" ");
            if(lowercaseBlacklist.includes(phrase.toLowerCase())) throw new Error(`Phrase **${phrase}** already on blacklist`);
            guildManager.state.filter.blacklist.global.push(phrase);
            returnStr = `Phrase **${phrase}** added to global filter`
        }
        
        await guildManager.stateManager.saveState();
        return returnStr;
    }
};

const remove = {
    commandName: "remove",
    description: "Adds the phrase to the filter",
    permissions: [ "manageChannels" ],
    run: async function({ message, args, guildManager }) {
        // Parse target channels, if provided
        let targetChannels = [];
        while(args.length && args[0].match(/<#\d{16,20}>/)) {
            targetChannels.push(args[0].replace(/\D/g, ""));
            args.splice(0, 1);
        }
        
        const phrase = args.join(" ");
        let newRemovals = 0;
        let returnStr = "";

        if(targetChannels.length) {
            for(const channel of targetChannels) {
                const lowercaseBlacklist = guildManager.state.filter.blacklist[channel].map(e => e.toLowerCase());
                const index = lowercaseBlacklist.indexOf(phrase.toLowerCase());
                if(index === -1) continue;
                guildManager.state.filter.blacklist[channel].splice(index, 1);
                newRemovals++;
            }
            if(newRemovals === 0) throw new Error(`Phrase **${phrase}** not on any provided filter`);
            returnStr = `Phrase **${phrase}** removed from ${newRemovals} filter${newRemovals > 1 ? "s" : ""}`;
        }
        else {
            const lowercaseBlacklist = guildManager.state.filter.blacklist.global.map(e => e.toLowerCase());
            const index = lowercaseBlacklist.indexOf(phrase.toLowerCase());
            if(index === -1) throw new Error(`Phrase **${phrase}** not on the global filter`);
            guildManager.state.filter.blacklist.global.splice(index, 1);
            returnStr = `Phrase **${phrase}** removed from filter`
        }

        await guildManager.stateManager.saveState();
        return returnStr;
    }
};

const show = {
    commandName: "show",
    description: "Shows the words on the blacklist",
    permissions: [ "manageChannels" ],
    run: async function({ message, args, guildManager }) {
        let arr = ["**Global Blacklist**"];
        if(guildManager.state.filter.blacklist.global.length === 0) arr.push("*Nothing*");
        else arr.push(...guildManager.state.filter.blacklist.global.map((e, i) => `[${i+1}] ${e}`));
        let channels = Object.keys(guildManager.state.filter.blacklist);
        channels.splice(channels.indexOf("global"), 1);
        for(const channel of channels) {
            if(guildManager.state.filter.blacklist[channel].length === 0) continue;
            const channelObject = guildManager.cache.channels.get(channel);
            arr.push(`**${channelObject ? channelObject.name : channel}**`);
            arr.push(...guildManager.state.filter.blacklist[channel].map((e, i) => `[${i+1}] ${e}`));
        }
        return arr.join("\n");
    }
};

function onMessage(message) {
    if(!message.member || message.member.permission.has("manageMessages")) return;
    const state =  message.channel.guild.guildManager.state;
    const phrase = checkBlacklist(message);
    if(phrase.length) {
        message.delete();
        if(state.filter.logChannel) {
            const channel = message.channel.guild.channels.get(state.filter.logChannel);
            if(!channel) return;
            let str = `:hammer: <@${message.author.id}> triggered filter on message **${message.id}**`;
            str += `\n**Phrase:** ${phrase}\n**Content:**\n${message.cleanContent.slice(0, 1000)}${message.cleanContent.length > 1000 ? "..." : ""}`;
            channel.createMessage(str);
        }
    }
}

function checkBlacklist(message) {
    const state =  message.channel.guild.guildManager.state;
    const channel = message.channel.id;
    if(state.filter.blacklist.global.length === 0 && (state.filter.blacklist[channel] && state.filter.blacklist[channel].length === 0)) return false;
    const messageContent = message.content.toLowerCase();
    for(const phrase of state.filter.blacklist.global) {
        const toCheck = phrase.toLowerCase();
        if(messageContent.indexOf(toCheck) !== -1) return phrase;
    }
    if(state.filter.blacklist[channel]) {
        for(const phrase of state.filter.blacklist[channel]) {
            const toCheck = phrase.toLowerCase();
            if(messageContent.indexOf(toCheck) !== -1) return phrase;
        }
    }
    return false;
}

module.exports = {
    moduleName: "Filter Manager",
    moduleID: "filter",
    moduleDescription: "Manages the filter system",
    botPermissions: [
        "manageMessages"
    ],
    commands: {
        add,
        remove,
        show
    },
    ensureState: {
        blacklist: {
            global: []
        },
        logChannel: "",
        filterActions: {
            blacklist: "delete"
        }
    },
    events: {
        messageCreate: onMessage
    }
};

