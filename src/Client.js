const Eris = require("eris");

const GuildManager = require("./GuildManager.js");
const logger = console;

class Client {
    constructor(token, options={}) {
        this.token = token;
        this.options = options;
        this.discordClient = new Eris(token, options);
        this.guilds = new Map;

        this.discordClient.on("ready", this.onReady.bind(this));
        this.discordClient.on("messageCreate", this.onMessage.bind(this));
        this.discordClient.on("guildCreate", this.onGuildJoin.bind(this));
    }

    connect() {
        this.discordClient.connect();
    }

    onReady() {
        logger.log("Ready, initiating guild managers");
        this.discordClient.guilds.forEach((guild) => {
            this.guilds.set(guild.id, new GuildManager(this, guild));
        });
        logger.log("All guild managers initialized");
    }

    onMessage(message) {
        if(!this.guilds.has(message.channel.guild.id)) {
            this.guilds.set(message.channel.guild.id, new GuildManager(message.channel.guild));
        }

        const guildManager = this.guilds.get(message.channel.guild.id);
        guildManager.emit("messageCreate", message);
    }

    onGuildJoin(guild) {
        if(!this.guilds.has(guild.id)) {
            this.guilds.set(guild.id, new GuildManager(this, guild));
        }
    }
}

module.exports = Client;
