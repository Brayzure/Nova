const Eris = require("eris");

const GuildManager = require("./GuildManager.js");
const StatusClient = require("./StatusClient.js");
const config = require("../config/config.json");
const logger = console;

class Client {
    constructor(token, options={}) {
        this.token = token;
        this.options = options;
        this.discordClient = new Eris(token, options);
        this.guilds = new Map;

        if(config.statusHost) {
            this.statusClient = new StatusClient(config.statusHost);
        }

        const handledEvents = [
            "messageCreate",
            "messageReactionAdd",
            "messageDelete",
            "guildMemberAdd"
        ];

        for(const event of handledEvents) {
            this.discordClient.on(event, this.onEvent.bind(this, event));
        }

        this.discordClient.on("ready", this.onReady.bind(this));
        this.discordClient.on("resume", this.onReady.bind(this));
        this.discordClient.on("guildAvailable", this.createGuildManager.bind(this));
        this.discordClient.on("guildCreate", this.onGuildJoin.bind(this));
        this.discordClient.on("error", this.onError.bind(this));
    }

    connect() {
        this.discordClient.connect();
    }

    onReady() {
        logger.log("Ready, initiating guild managers");
        this.discordClient.guilds.forEach((guild) => {
            this.createGuildManager(guild);
        });
        logger.log("All guild managers initialized");
    }

    createGuildManager(guild) {
        this.guilds.set(guild.id, new GuildManager(this, guild));
    }

    onEvent(event, ...args) {
        let guild;
        switch(event) {
            case "messageCreate":
            case "messageDelete":
            case "messageReactionAdd":
                guild = args[0].channel.guild;
                break;
            case "guildMemberAdd":
                guild = args[0];
                break;
        }
        
        // TODO: Handle relevant guild-less events
        if(!guild) {
            return;
        }
        if(!this.guilds.has(guild.id)) {
            this.guilds.set(guild.id, new GuildManager(this, guild));
        }

        const guildManager = this.guilds.get(guild.id);
        guildManager.emit(event, ...args);
    }

    onGuildJoin(guild) {
        if(!this.guilds.has(guild.id)) {
            this.guilds.set(guild.id, new GuildManager(this, guild));
        }
    }

    onError(error) {
        logger.log(error);
    }
}

module.exports = Client;
