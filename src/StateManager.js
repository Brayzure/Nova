const md5 = require("md5");
const fs = require("fs-extra");
const path = require("path");

const BASE_STATE = {
    enabledModules: []
}

class StateManager {
    constructor(guildID) {
        this.guildID = guildID;
        this.hash = md5(this.guildID);
        const level1 = this.hash.slice(0, 2);
        const level2 = this.hash.slice(2, 4);
        this.location = path.join(__dirname, `../data/${level1}/${level2}/${this.hash}.json`);
        this.getState();
    }

    getState() {
        try {
            const data = require(this.location)
            this.state = data;
        }
        catch (err) {
            this.state = BASE_STATE;
        }
    }

    async getStateAsync() {
        try {
            const data = await fs.readJson(this.location);
            if(data) {
                this.state = data;
            }
            else {
                this.state = BASE_STATE;
            }
        }
        catch (err) {
            this.state = BASE_STATE;
        }
    }

    async saveState() {
        await fs.outputFile(this.location, JSON.stringify(this.state, null, 4));
    }

    async ensureProperty(property, defaultValue={}) {
        if(!this.state.hasOwnProperty(property)) {
            this.state[property] = defaultValue;
            await this.saveState();
        }
    }

    async ensureModuleProperty(moduleName, property, defaultValue={}) {
        this.ensureProperty(moduleName);
        const obj = this.state[moduleName];
        if(!obj.hasOwnProperty(property)) {
            this.state[moduleName][property] = defaultValue;
            await this.saveState();
        }
    }
}

module.exports = StateManager;
