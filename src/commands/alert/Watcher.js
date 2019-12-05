class Watcher {
    constructor(guild, interval, time, callback) {
        this.guild = guild;
        this.interval = interval;
        this.time = time;
        this.callback = callback;

        this._intervalID = setInterval(() => {
            this.check();
        }, this.interval);
    }

    check() {
        const alerts = this.guild.state.alert.unresolvedAlerts;
        for(const key of Object.keys(alerts)) {
            const createdAt = Math.floor(key / 4194304) + 1420070400000;
            const now = Date.now();
            if(now - createdAt > this.time) this.callback(this.guild, key);
        }
    }
}

module.exports = Watcher;
