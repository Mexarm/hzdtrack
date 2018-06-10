const functions = require('firebase-functions');

const api = require('./lib/api');

module.exports = {
    api : functions.https.onRequest(api)
}



