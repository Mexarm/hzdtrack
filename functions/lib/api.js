/*
 * 
 * 
 * api endpoint 
 * 
 * 
 */

const admin = require('firebase-admin');
const express = require('express');
const https = require('https');
const http = require('http');
const helpers = require('./helpers');
const e = require("./error");

admin.initializeApp();
const api = express();
const db = admin.firestore();

const hostRef = db.collection('host');
const getHostDocById = (hostId) => hostRef.doc(hostId).get().then((snap) => snap.exists ? snap : false)
const getHostDocByName = (host) => hostRef.where("host", "==", host).get().then((snap) => snap.empty ? false : snap.docs[0])

// allow only content-type=application/json 
api.use(helpers.validateContentType);

// /host : TRACKING HOST ENDPOINT

// create a tracking host
// method: POST
// required params:
// host : hostname
// settings : object with properties 
//              click_tracking : true or false, (track clicks, replacing the original href attribute with a new url )
//              open_tracking : true or false, (track mail open, when the mail client request a 1px by 1px image)
//              unsubscribes : true or false, (replaces the text: 
//                              %unsubscribe_url% -- with a link to unsubscribe recipient from all messages sent by given host
//                              %tag_unsubscribe_url% -- with link to unsubscribe from all tags provided in the message
//         (not implemented>>)  %mailing_list_unsubscribe_url% -- link to unsubscribe from future messages sent to a mailing list
api.post("/host", (req, res) => {
    var host = typeof req.body.host === "string" && req.body.host.length > 0 ? req.body.host : false;
    if (host) {
        const settings = typeof req.body.settings === "object" ? req.body.settings : {};
        const click_tracking = typeof settings.click_tracking === "boolean" ? settings.click_tracking : false;
        const open_tracking = typeof settings.open_tracking === "boolean" ? settings.open_tracking : false;
        const unsubscribes = typeof settings.unsubscribes === "boolean" ? settings.unsubscribes : false;
        const settings_ = {
            click_tracking,
            open_tracking,
            unsubscribes
        };
        getHostDocByName(host)
            .then((doc) =>
                doc ? false : hostRef.add({
                    host,
                    settings: settings_,
                    dns_entry_verified: false,
                    verification_key: helpers.getRandomString(5)
                }))
            .then((result) =>
                result ?
                    res.send({ "host_id": result.id }) :
                    res.status(e.alreadyExists.code).send(e.alreadyExists.error))
            .catch((reason) => {
                console.log("DB ERROR:", reason);
                return res.status(e.internalDBError.code).send(e.internalDBError.error);
            })
    } else {
        res.status(e.invalidRequiredParams.code).send(e.invalidRequiredParams.error);
    }
})

// return host object
// method: GET
const processHostGETRequest = (res, hostDoc) => {
    hostDoc
        .then((docRef) =>
            docRef ?
                res.send({ "id": docRef.id, "data": docRef.data() }) :
                res.status(e.notFound.code).send(e.notFound.error)
        )
        .catch((reason) => {
            console.log("DB ERROR:", reason);
            res.status(e.internalDBError.code).send(e.internalDBError.error);
        })
}
api.get("/host/:host", (req, res) => processHostGETRequest(res, getHostDocByName(req.params.host)));
api.get("/host/id/:host_id", (req, res) => processHostGETRequest(res, getHostDocById(req.params.host_id)));

// verify a dns configuration of a host
// method: GET
// params: the verification key 
api.get("/host/verifydns/:verification_key", (req, res) => {
    const verification_key = req.params.verification_key;
    const host = req.get("host");
    getHostDocByName(host)
        .then((docRef) => docRef && Promise.all([docRef, docRef.data().verification_key === verification_key])) //@@TODO check if new is required
        .then((values) => values[1] && values[0].ref.set({ dns_entry_verified: true }, { merge: true }))
        .then((result) => result ? res.send({ "message": "domain successfully verified" }) :
            res.status(e.invalidRequest.code).send(e.invalidRequest.error))
        .catch((reason) => {
            console.log("DB ERROR:", reason);
            res.status(e.internalDBError.code).send(e.internalDBError.error);
        })
});

// trigger a host verification process
// method: POST
// params : hostname or host id
const processDNSVerification = (req, res, hostDoc) => {
    const baseURL = "/hzdtrack/us-central1";
    const protocol_ = req.secure ? "https:" : "http:";
    const moduleToUse = req.secure ? https : http;
    const defaultPort = req.secure ? 443 : 80;
    hostDoc
        .then((docRef) => {
            if (docRef) {

                var details = {
                    protocol: protocol_,
                    hostname: docRef.data().host.split(":")[0],
                    port: parseInt(docRef.data().host.split(":")[1]) || defaultPort,
                    method: "GET",
                    headers: { "content-type": "application/json" },
                    path: baseURL + "/api/host/verifydns/" + docRef.data().verification_key
                }
                return new Promise((resolve, reject) => {
                    moduleToUse.request(details, (response) => {
                        var dataPromise = new Promise((resolve1, reject1) => response.on("data", resolve1).on("error", reject1)); //@@TODO collect all data chunks correctly
                        resolve(Promise.all([response, dataPromise]))
                    }).on("error", reject).end()
                })
            }
            else {
                return false;
            }
        })
        .then(([response, data]) => response)
        .then((response) => response.statusCode === 200)
        .then((ok) => ok ? res.send({ "message": "host dns settings are valid" }) : res.status(e.invalidRequest.code).send(e.invalidRequest.error))
        .catch((error) => {
            console.log(JSON.stringify(error));
            res.status(404).send(error);
        })
}

api.post("/host/:host/doverifydns", (req, res) => processDNSVerification(req, res, getHostDocByName(req.params.host)))
api.post("/host/id/:host_id/doverifydns", (req, res) => processDNSVerification(req, res, getHostDocById(req.params.host_id)))

// update host
// method: PUT
// parameters : settings :
//              click_tracking 
//              open_tracking,
//              unsubscribes
const processHostPUTRequest = (req, res, hostDoc) => {
    const settings_ = typeof req.body.data === "object" && typeof req.body.data.settings === "object" ?
        req.body.data.settings : {};
    const settings = {};
    if (typeof settings_.click_tracking === 'boolean') settings.click_tracking = settings_.click_tracking;
    if (typeof settings_.open_tracking === 'boolean') settings.open_tracking = settings_.open_tracking;
    if (typeof settings_.unsubscribes === 'boolean') settings.unsubscribes = settings_.unsubscribes;

    hostDoc
        .then((doc) => doc && doc.ref)
        .then((ref) => ref && ref.set({ settings }, { merge: true }))
        .then((result) =>
            result ? res.send({ "message": "host settings updated" }) :
                res.status(e.notFound.code).send(e.notFound.error)
        )
        .catch((reason) => {
            console.log("DB ERROR:", reason);
            return res.status(e.internalDBError.code).send(e.internalDBError.error);
        })
};

api.put("/host/:host", (req, res) => processHostPUTRequest(req, res, getHostDocByName(req.params.host)));
api.put("/host/id/:host_id", (req, res) => processHostPUTRequest(req, res, getHostDocById(req.params.host_id)));

// delete host
// method: DELETE
// parameters : host to delete as a parameter
// example:  /host/<host.to.delete> or /host/<host_id>

const processHostDELETERequest = (res, hostDoc) => {
    hostDoc
        .then((doc) => doc && doc.ref.delete())
        .then((result) =>
            result ? res.send({ "message": "host sucessfully deleted" }) :
                res.status(e.notFound.code).send(e.notFound.error)
        )
        .catch((reason) => {
            console.log("DB ERROR:", reason);
            return res.status(e.internalDBError.code).send(e.internalDBError.error);
        })
}
api.delete("/host/:host", (req, res) => processHostDELETERequest(res, getHostDocByName(req.params.host)));
api.delete("/host/id/:host_id", (req, res) => processHostDELETERequest(res, getHostDocById(req.params.host_id)));

module.exports = api;