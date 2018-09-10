const config = require("../config/config.json");

class CommandHandler {
    constructor(guild, options = {}) {
        this.guild = guild;
        this.client = this.guild.client;
        this.prefix = options.prefix || config.prefix;
        this.commands = new Map;
        this.modules = new Map;
        this.enableBaseModule();
    }

    enableBaseModule() {
        const baseModule = require("./commands/base.js");
        Object.keys(baseModule.commands).forEach((commandName) => {
            this.commands.set(commandName, baseModule.commands[commandName]);
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

        let startIndex = 0;
        const commandName = args[0].toLowerCase();
        let override = false;
        let sliceDepth = 1;
        if((commandName === "override" || commandName === "o")
            && message.author.id === "97771062690865152")
        {
            override = true;
            startIndex = 1;
            sliceDepth++;
        }

        // Check for base commands
        let command = this.commands.get(args[startIndex]);
        // No base command, check for custom commands
        if(!command && args.length > 1) {
            command = this.commands.get(`${args[startIndex]}-${args[startIndex+1].toLowerCase()}`);
            sliceDepth++;
        }

        if(!command) {
            throw new Error("COMMAND_NOT_FOUND");
        }

        if(!override) {
            command.permissions.forEach((perm) => {
                if(!message.member.permission.has(perm)
                    && (perm === "developer" && message.author.id !== "97771062690865152")) {
                    throw new Error(`PERMISSION_NOT_MET`);
                }
            });
        }

        const result = await command.run({
            message,
            args: args.slice(sliceDepth),
            guildManager: this.guild,
            client: this.client
        });
        return result;
    }
}

module.exports = CommandHandler;
