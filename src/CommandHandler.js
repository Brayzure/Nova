const config = require("../config/config.json");

class CommandHandler {
    constructor(guild, options = {}) {
        this.guild = guild;
        this.client = this.guild.client;
        this.prefix = options.state.prefix || config.prefix;
        this.commands = new Map;
        this.modules = new Map;
        this.enableBaseModule();
    }

    enableBaseModule() {
        const baseModule = require("./commands/base.js");
        Object.values(baseModule.commands).forEach((command) => {
            this.enableCommand([], command);
            this.commands.set(command.commandName, command);
        });
        this.modules.set("base", baseModule);
    }

    async enableCustomModule(moduleName) {
        const customModule = require(`./commands/${moduleName}.js`);
        const clientMember = this.guild.cache.members.get(this.guild.client.discordClient.user.id);
        customModule.botPermissions.forEach((perm) => {
            if(!clientMember.permission.has(perm)) {
                throw new Error(`Can't enable module, missing permission: ${perm}`);
            }
        });
        Object.keys(customModule.commands).forEach((commandName) => {
            const command = customModule.commands[commandName];
            this.enableCommand([ moduleName ], command);
            this.commands.set(`${moduleName}-${command.commandName}`, customModule.commands[commandName]);
        });
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
        
        this.modules.set(moduleName, customModule);
    }

    async enableCommand(baseCommandArgs, command) {
        baseCommandArgs.push(command.commandName);
        this.commands.set(baseCommandArgs.join("-"), command);
        if(command.subcommands) {
            Object.values(command.subcommands).forEach((subcommand) => {
                this.enableCommand(baseCommandArgs, subcommand);
            });
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
        for(const key of this.commands.keys()) {
            if(key.startsWith(`${moduleName}-`)) {
                this.commands.delete(key);
            }
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

module.exports = CommandHandler;
