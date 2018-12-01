const fs = require("fs-extra");
const path = require("path");

const ping = {
    commandName: "ping",
    description: "Pings the bot",
    permissions: [],
    hoisted: true,
    run: async function({ message }) {
        const shard = message.channel.guild.shard;
        return `Pong! (Latency: ${shard.latency}ms | Shard ${shard.id})`;
    }
};

const enable = {
    commandName: "enable",
    description: "Enables a module",
    permissions: [ "manageGuild" ],
    hoisted: true,
    run: async function({ args, guildManager }) {
        const moduleName = args[0].toLowerCase();
        if(guildManager.state.enabledModules.includes(moduleName)) {
            throw new Error("Module is already enabled!");
        }
        const moduleLocation = path.join(__dirname, `../${moduleName}/index.js`);
        const moduleExists = await fs.pathExists(moduleLocation);
        if(!moduleExists) {
            throw new Error("Module does not exist!");
        }
        await guildManager.commandHandler.enableCustomModule(moduleName);
        guildManager.state.enabledModules.push(moduleName);
        await guildManager.stateManager.saveState();
        return `Successfully enabled the ${moduleName} module`;
    }
};

const disable = {
    commandName: "disable",
    description: "Disables a module",
    permissions: [ "manageGuild" ],
    hoisted: true,
    run: async function({ args, guildManager }) {
        const moduleName = args[0].toLowerCase();
        if(moduleName === "base") {
            throw new Error("Can't disable the base module, otherwise you can't re-enable it!");
        }
        if(!guildManager.state.enabledModules.includes(moduleName)) {
            throw new Error("Module is not enabled!");
        }
        guildManager.commandHandler.disableCustomModule(moduleName);
        const moduleIndex = guildManager.state.enabledModules.indexOf(moduleName);
        guildManager.state.enabledModules.splice(moduleIndex, 1);
        await guildManager.stateManager.saveState();
        return `Successfully disabled the ${moduleName} module`;
    }
};

const help = {
    commandName: "help",
    description: "Displays help for a module or command",
    permissions: [],
    hoisted: true,
    run: async function({ message, args, guildManager }) {
        let embed = {};
        if(args.length === 2) {
            args[0] = args[0].toLowerCase();
            args[1] = args[1].toLowerCase();
            let loaded = true;
            const internalCommandName = `${args[0]}-${args[1]}`;
            const commandName = args[1];
            let command = guildManager.commandHandler.commands.get(internalCommandName);
            let commandModule;
            if(!command) {
                loaded = false;
                const moduleName = args[0];
                try {
                    const tempModule = require(path.join(__dirname, `./${moduleName}.js`));
                    if(tempModule.commands[commandName]) {
                        command = tempModule.commands[commandName];
                        commandModule = tempModule;
                    }
                    else {
                        throw new Error(`Command ${commandName} doesn't exist in module ${moduleName}`);
                    }
                }
                catch (err) {
                    throw new Error("Can't find module " + moduleName);
                }
            }
            else {
                commandModule = guildManager.commandHandler.modules.get(args[0]);
            }
            embed = commandSummaryEmbed(command, commandModule, loaded);
            message.channel.createMessage({ embed });
        }
        // either a module or a base command
        else if(args.length === 1) {
            args[0] = args[0].toLowerCase();
            // Base command?
            let embed;
            const command = guildManager.commandHandler.commands.get(args[0]);
            if(command) {
                embed = commandSummaryEmbed(command);
            }
            else {
                let loaded = true;
                let tempModule = guildManager.commandHandler.modules.get(args[0]);
                if(!tempModule) {
                    loaded = false;
                    tempModule = require(path.join(__dirname, `./${args[0]}.js`));
                }
                if(!tempModule) {
                    throw new Error(`Module ${args[0]} doesn't exist`);
                }
                embed = moduleSummaryEmbed(tempModule, loaded);
            }
            message.channel.createMessage({ embed });
        }
        else {
            throw new Error("Improper arguments, do `help [module] [command]` or `help [module]`");
        }
    }
};

const clear = {
    commandName: "clear",
    description: "Clears internal module cache",
    permissions: [ "developer" ],
    hoisted: true,
    run: async function({ args, guildManager }) {
        if(!args[0]) {
            throw new Error("Please specify a module.");
        }

        const moduleName = args[0].toLowerCase();
        const location = path.join(__dirname, `../${moduleName}/index.js`);
        delete require.cache[require.resolve(location)];
        if(guildManager.state.enabledModules.includes(moduleName)) {
            await guildManager.commandHandler.disableCustomModule(moduleName);
            await guildManager.commandHandler.enableCustomModule(moduleName);
        }
        return `Cleared cache for ${moduleName}.`;
    }
};

const setPrefix = {
    commandName: "prefix",
    description: "Sets the guild's prefix",
    permissions: [ "manageGuild" ],
    hoisted: true,
    run: async function({ args, guildManager }) {
        if(!args[0]) {
            throw new Error("Invalid prefix, make sure you don't have extra spaces!");
        }
        guildManager.state.prefix = args[0];
        await guildManager.stateManager.saveState();
        guildManager.commandHandler.prefix = args[0];
        return `Set prefix to **${args[0]}**!`;
    }
};

const set = {
    commandName: "set",
    description: "Modifies internal settings",
    permissions: [ "manageGuild" ],
    hoisted: true,
    run: async function({ args }) {
        if(args.length < 2) {
            throw new Error("Improper arguments, do `set [setting] [value]`");
        }
    },
    subcommands: {
        prefix: setPrefix
    }
};

const evalCommand = {
    commandName: "eval",
    description: "Runs arbitrary code for debugging (developer only)",
    permissions: [ "developer" ],
    hoisted: true,
    run: async function({ args, message, guildManager, client }) { // eslint-disable-line no-unused-vars
        const expression = args.join(" ");
        let msg, output;
        try {
            output = eval(expression);
            if(output instanceof Promise) {
                const now = Date.now();
                try {
                    const result = await output;
                    msg = `\`\`\`js\nIn:\n${expression}\nResolved in ${Date.now() - now}ms\nOut:\n${result}\`\`\``;
                }
                catch (err) {
                    msg = `\`\`\`diff\nIn:\n${expression}\nRejected in ${Date.now() - now}ms\nOut:\n-${err.toString()}\`\`\``;
                }
            }
            else {
                msg = `\`\`\`js\nIn:\n${expression}\nOut:\n${output}\`\`\``;
            }
        }
        catch (err) {
            msg = `\`\`\`diff\nIn:\n${expression}\nOut:\n-${err.toString()}\`\`\``;
        }
        return msg;
    }
};

function moduleSummaryEmbed(tempModule, loaded) {
    let embed = {
        color: 0xaaaaff,
        title: tempModule.moduleName + " Module",
        description: tempModule.moduleDescription,
        fields: [
            {
                name: "Commands",
                value: Object.keys(tempModule.commands).join(", "),
                inline: true
            },
            {
                name: "Required Bot Permissions",
                value: tempModule.botPermissions.length ? tempModule.botPermissions.join(", ") : "None",
                inline: true
            },
            {
                name: "Currently Loaded",
                value: loaded.toString(),
                inline: true
            }
        ]
    };
    return embed;
}

function commandSummaryEmbed(command, commandModule, loaded=true) {
    let embed = {
        color: 0xaaaaff,
        title: command.commandName + " Command",
        description: command.description,
        fields: [
            {
                name: "Module",
                value: commandModule ? `${commandModule.moduleName} (ID: ${commandModule.moduleID})` : "Base Commands (base)",
                inline: true
            },
            {
                name: "Permissions Required",
                value: command.permissions.length ? command.permissions.join(", ") : "None",
                inline: true
            },
            {
                name: "Currently Enabled",
                value: loaded.toString(),
                inline: true
            }
        ]
    };
    return embed;
}

module.exports = {
    moduleName: "Base Commands",
    moduleID: "base",
    moduleDescription: "Base commands for the bot",
    botPermissions: [],
    commands: {
        help,
        ping,
        enable,
        disable,
        clear,
        set,
        eval: evalCommand
    },
    ensureState: {}
};
