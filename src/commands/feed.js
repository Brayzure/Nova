const create = {
    commandName: "create",
    description: "Creates a new feed role",
    permissions: [ "manageGuild" ],
    run: async function({ message, args, guildManager }) {
        const guild = message.channel.guild;
        const roleName = args[0];
        guild.roles.forEach((role) => {
            if(role.name.toLowerCase() === roleName.toLowerCase()) {
                throw new Error(`Role name ${roleName} is too similar to existing role ${role.name} (${role.id})`);
            }
        });
        const role = await guild.createRole({
            name: roleName,
            permissions: 0,
            hoist: false,
            mentionable: false
        });
        guildManager.state.feed.roleNameMap[roleName.toLowerCase()] = role.id;
        guildManager.state.feed.roleChannelMap[roleName.toLowerCase()] = message.channel.id;
        await guildManager.stateManager.saveState();
        return `Created new feed role **${role.name}**, you may edit the new role freely.`;
    }
};

const remove = {
    commandName: "remove",
    description: "Removes a feed without deleting the role",
    permissions: [ "manageGuild" ],
    run: async function({ args, guildManager }) {
        const roleNameMap = guildManager.state.feed.roleNameMap;
        const roleChannelMap = guildManager.state.feed.roleChannelMap;
        const roleName = args[0].toLowerCase();
        if(roleNameMap[roleName]) {
            delete roleNameMap[roleName];
            delete roleChannelMap[roleName];
            await guildManager.stateManager.saveState();
            return `Removed feed **${roleName}**.`;
        }
        else {
            throw new Error("Feed not found");
        }
    }
};

const deleteRole = {
    commandName: "delete",
    description: "Deletes a feed role",
    permissions: [ "manageGuild" ],
    run: async function({ message, args, guildManager }) {
        const guild = message.channel.guild;
        const roleNameMap = guildManager.state.feed.roleNameMap;
        const roleChannelMap = guildManager.state.feed.roleChannelMap;
        const roleName = args[0].toLowerCase();
        if(roleNameMap[roleName]) {
            const role = guild.roles.get(roleNameMap[roleName]);
            if(role) {
                try {
                    await guild.deleteRole(role.id);
                }
                catch (err) {
                    throw new Error("Unable to delete feed role, I might be missing permissions, or it may be listed above my role in the role list.");
                }
            }
            delete roleNameMap[roleName];
            delete roleChannelMap[roleName];
            await guildManager.stateManager.saveState();
            return `Deleted feed role **${roleName}**.`;
        }
        else {
            throw new Error("Role not found");
        }
    }
};

const list = {
    commandName: "list",
    description: "Lists all current feed roles",
    permissions: [ "manageGuild" ],
    run: async function({ message, guildManager }) {
        const guild = guildManager.cache;
        const output = [];
        const roleNameMap = guildManager.state.feed.roleNameMap;
        const roleChannelMap = guildManager.state.feed.roleChannelMap;
        Object.keys(roleNameMap).forEach((roleName) => {
            const role = guild.roles.get(roleNameMap[roleName]);
            const channel = guild.channels.get(roleChannelMap[roleName]);
            const roleNameLine = `__**${roleName}**__`;
            const roleLine = "Role: " + (role ? `${role.name} (ID: ${role.id})` : "No role assigned");
            const channelLine = "    Channel: " + (channel ? `${channel.name} (ID: ${channel.id})` : "No channel set");
            output.push(roleNameLine, roleLine, channelLine);
        });
        const embed = {
            title: "Feed Roles",
            color: 0xaaaaff,
            description: output.length ? output.join("\n") : "None"
        };
        message.channel.createMessage({ embed });
    }
};

const publish = {
    commandName: "publish",
    description: "Publishes an announcement to the feed",
    permissions: [ "manageMessages" ],
    run: async function({ args, guildManager }) {
        if(args.length < 2) {
            throw new Error("Not enough information, please provide a feed name and a message to send.");
        }
        const roleName = args[0].toLowerCase();
        const message = args.slice(1).join(" ");
        const roleID = guildManager.state.feed.roleNameMap[roleName];
        const role = guildManager.cache.roles.get(roleID);
        if(!role) {
            throw new Error("Role assigned to that feed can't be found, it was probably deleted. Please delete the feed and recreate it.");
        }
        const channelID = guildManager.state.feed.roleChannelMap[roleName];
        const channel = guildManager.cache.channels.get(channelID);
        if(!channel) {
            throw new Error("Channel assigned to that feed can't be found, it was probably deleted. Please delete the feed and recreate it.");
        }
        await role.edit({mentionable: true});
        await channel.createMessage(`${role.mention}: ${message}`);
        await role.edit({mentionable: false});
        return "Sent message to feed channel successfully.";
    }
};

const move = {
    commandName: "move",
    description: "Moves a feed's announcement channel to the current channel",
    permissions: [ "manageGuild" ],
    run: async function({ message, args, guildManager }) {
        const roleName = args[0];
        const roleChannelMap = guildManager.state.feed.roleChannelMap;
        if(!roleChannelMap[roleName]) {
            throw new Error("Feed role doesn't appear to exist, try creating it.");
        }
        roleChannelMap[roleName] = message.channel.id;
        guildManager.stateManager.saveState();
        return "Set feed announcement channel to this channel.";
    }
};

const sub = {
    commandName: "sub",
    description: "Subscribes to a feed",
    permissions: [],
    run: async function({ message, args, guildManager }) {
        if(args.length < 1) {
            throw new Error("Please specify a feed!");
        }
        const roleName = args[0].toLowerCase();
        const roleID = guildManager.state.feed.roleNameMap[roleName];
        if(!roleID) {
            throw new Error("Feed doesn't exist!");
        }
        const role = guildManager.cache.roles.get(roleID);
        if(!role) {
            throw new Error("Feed is not configured properly, the assigned role doesn't exist.");
        }
        await message.member.addRole(role.id);
        return "Successfully assigned feed role, you can remove it with `unsub`.";
    }
};

const unsub = {
    commandName: "unsub",
    description: "Unsubscribes from a feed",
    permissions: [],
    run: async function({ message, args, guildManager }) {
        if(args.length < 1) {
            throw new Error("Please specify a feed!");
        }
        const roleName = args[0].toLowerCase();
        const roleID = guildManager.state.feed.roleNameMap[roleName];
        if(!roleID) {
            throw new Error("Feed doesn't exist!");
        }
        if(!message.member.roles.includes(roleID)) {
            throw new Error("You aren't subscribed to that feed!");
        }
        await message.member.removeRole(roleID);
        return "Successfully remove feed role.";
    }
};

module.exports = {
    moduleName: "Feed Roles Manager",
    moduleID: "feed",
    moduleDescription: "Manages the creation of assignable roles"
        + " used for announcements that aren't relevant for the"
        + " entire server.",
    botPermissions: [ "manageRoles" ],
    commands: {
        create,
        remove,
        deleteRole,
        list,
        publish,
        move,
        sub,
        unsub
    },
    ensureState: {
        roleNameMap: {},
        roleChannelMap: {}
    }
};
