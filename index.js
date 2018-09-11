const Client = require("./src/Client.js");

const { token } = require("./config/auth.json");

const client = new Client(token);
client.connect();
