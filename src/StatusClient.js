const Websocket = require("ws");

class StatusClient {
    constructor(host) {
        this.host = host;
        const { statusToken, statusID } = require("../config/auth.json");
        this.ws = new Websocket(host, { headers: { authorization: statusID + ":" + statusToken }});
        this.ready = true;
        /*
        this.ws.on("error", (error) => {
            console.log(error);
            this.ready = false;
        });
        this.ws.on("message", this.onMessage.bind(this));
        */
    }

    /*
    onMessage(message) {
        console.log(message);
    }
    */
}

module.exports = StatusClient;
