const EventEmitter = require("events");

const CommandHandler = require("./CommandHandler.js");
const StateManager = require("./StateManager.js");

class GuildManager extends EventEmitter {
    constructor(client, guild) {
        super();

        this.cache = guild;
        this.cache.guildManager = this;
        this.client = client;
        this.stateManager = new StateManager(guild.id);
        this.commandHandler = new CommandHandler(this, { state: this.state });

        this.handlers = {};

        for(const moduleName of this.state.enabledModules) {
            this.commandHandler.enableCustomModule(moduleName);
        }

        this.on("messageCreate", this.onMessage.bind(this));
    }

    get state() {
        return this.stateManager.state;
    }

    async onMessage(message) {
        if(message.content.startsWith(this.commandHandler.prefix)
            && message.content.length > this.commandHandler.prefix.length)
        {
            const embed = {
                color: 0x00ff00
            }
            try {
                const commandResult = await this.commandHandler.run(message);
                embed.description = commandResult
            }
            catch (err) {
                if(err.message !== "COMMAND_NOT_FOUND"
                    && err.message !== "PERMISSION_NOT_MET") {
                    embed.color = 0xff0000;
                    embed.description = err.message
                }
            }
            if(embed.description) {
                message.channel.createMessage({ embed });
            }
        }
    }

    registerListener(event, handler) {
        if(!this.handlers[event]) {
            this.handlers[event] = [];
            this.on(event, this.handleEvents(event).bind(this));
        }

        this.handlers[event].push(handler);
    }

    removeListener(event, handler) {
        const handlerIndex = this.handlers[event].indexOf(handler);
        if(handlerIndex !== -1) {
            this.handlers[event].splice(handlerIndex, 1);
        }
    }

    handleEvents(event) {
        return function handle(...args) {
            const handlers = this.handlers[event];
            handlers.forEach((handler) => {
                handler(...args);
            });
        }
    }
}

module.exports = GuildManager;
