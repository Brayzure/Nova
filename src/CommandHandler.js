const config = require("../config/config.json");

class CommandHandler {
    constructor(guild, options = {}) {
        this.guild = guild;
        this.client = this.guild.client;
        this.prefix = options.state.prefix || config.prefix;
        this.commands = new Map;
        this.modules = new Map;
    }

    async enableCustomModule(moduleName) {
        const customModule = require(`./commands/${moduleName}/index.js`);
        const clientMember = this.guild.cache.members.get(this.guild.client.discordClient.user.id);
        const missingPermissions = [];
        customModule.botPermissions.forEach((perm) => {
            if(!clientMember.permission.has(perm)) {
                missingPermissions.push(perm);
            }
        });
        if(missingPermissions.length) {
            throw new Error(`Can't enable module, missing permissions: ${missingPermissions.join(", ")}`);
        }
        for(const commandName in customModule.commands) {
            const command = customModule.commands[commandName];
            if(command.hoisted) {
                this.enableCommand([], command);
            }
            else {
                this.enableCommand([ moduleName ], command);
            }
        }
        if(!this.commands.has(moduleName)) {
            this.commands.set(moduleName, buildModuleFunction(moduleName, customModule.moduleDescription));
        }
        if(customModule.baseModifiers) {
            Object.keys(customModule.baseModifiers).forEach((baseCommand) => {
                this.enableCommand([ baseCommand ], customModule.baseModifiers[baseCommand]);
            });
        }
        // Ensure state variables exist
        if(customModule.ensureState) {
            Object.keys(customModule.ensureState).forEach(async (prop) => {
                const stateValue = customModule.ensureState[prop];
                await this.guild.stateManager.ensureModuleProperty(moduleName, prop, stateValue);
            });
        }
        // Register event listeners for module
        if(customModule.events) {
            Object.keys(customModule.events).forEach((prop) => {
                const event = customModule.events[prop];
                this.guild.registerListener(prop, event);
            });
        }
        // Check anything else that needs to run on load
        if(customModule.onModuleLoad) {
            customModule.onModuleLoad(this.guild);
        }
        
        this.modules.set(moduleName, customModule);
    }

    async enableCommand(baseCommandArgs, command) {
        const commandArgs = baseCommandArgs.slice();
        commandArgs.push(command.commandName);
        this.commands.set(commandArgs.join("-"), command);
        if(command.subcommands) {
            for(const subcommand of Object.values(command.subcommands)) {
                this.enableCommand(commandArgs, subcommand);
            }
        }
    }

    async disableCommand(baseCommandArgs, command) {
        const commandArgs = baseCommandArgs.slice();
        commandArgs.push(command.commandName);
        this.commands.delete(commandArgs.join("-"));
        if(command.subcommands) {
            for(const subcommand of Object.values(command.subcommands)) {
                this.disableCommand(commandArgs, subcommand);
            }
        }
    }

    disableCustomModule(moduleName) {
        const customModule = this.modules.get(moduleName);
        if(customModule.events) {
            Object.keys(customModule.events).forEach((prop) => {
                const handler = customModule.events[prop];
                this.guild.removeListener(prop, handler);
            });
        }
        if(customModule.baseModifiers) {
            for(const prop in customModule.baseModifiers) {
                const modifier = customModule.baseModifiers[prop];
                this.disableCommand([ prop ], modifier);
            }
        }
        for(const prop in customModule.commands) {
            this.disableCommand([ moduleName ], customModule.commands[prop]);
        }
        this.modules.delete(moduleName);
    }

    async run(message) {
        const messageString = message.content.slice(this.prefix.length);
        const args = messageString.split(" ");
        const commandArgs = args.map(e => e.toLowerCase());
        let startIndex = 0;
        let index = 0;

        const overrideCheck = args[0].toLowerCase();
        let override = false;
        if((overrideCheck === "override" || overrideCheck === "o")
            && message.author.id === "97771062690865152")
        {
            override = true;
            startIndex = 1;
            index = 1;
        }

        while(this.commands.get(commandArgs.slice(startIndex, index + 1).join("-")) && index < commandArgs.length) {
            index++;
        }

        const commandName = commandArgs.slice(startIndex, index).join("-");
        const command = this.commands.get(commandName);

        if(!command) {
            throw new Error("COMMAND_NOT_FOUND");
        }

        if(!override) {
            command.permissions.forEach((perm) => {
                if(!message.member.permission.has(perm)
                    && (perm === "developer" && message.author.id !== "97771062690865152")) {
                    throw new Error("PERMISSION_NOT_MET");
                }
            });
        }

        const result = await command.run({
            message,
            args: args.slice(index),
            guildManager: this.guild,
            client: this.client
        });
        return result;
    }
}

function buildModuleFunction(moduleName, description) {
    return {
        commandName: moduleName,
        descripton: `Shows description for ${moduleName} module`,
        permissions: [],
        run: async function() {
            return description;
        }
    };
}

module.exports = CommandHandler;
