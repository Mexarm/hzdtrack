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

const PROD_ENV = process.env.NODE_ENV === "production";

const CLOUD_FUNCTIONS_DOMAIN = "cloudfunctions.net"
const DEFAULT_REGION = "us-central1"

const CONFIG = {
    project_endpoint: PROD_ENV ? "https://" + process.env.X_GOOGLE_FUNCTION_REGION + "-" + process.env.X_GOOGLE_GCLOUD_PROJECT + "." + CLOUD_FUNCTIONS_DOMAIN :
        "http://localhost:5000/" + process.env.GCLOUD_PROJECT + "/" + DEFAULT_REGION,

    function_timeout_sec: PROD_ENV ? parseInt(process.env.X_GOOGLE_FUNCTION_TIMEOUT_SEC) : 60,
    gcloud_project: PROD_ENV ? process.env.X_GOOGLE_GCLOUD_PROJECT : process.env.GCLOUD_PROJECT,
    function_region: PROD_ENV ? process.env.X_GOOGLE_FUNCTION_REGION : DEFAULT_REGION,
    function_name: PROD_ENV ? process.env.X_GOOGLE_FUNCTION_NAME : process.env.FUNCTION_NAME,
}
/* 
//process.env when deployed:
process.env = 
{
    "X_GOOGLE_FUNCTION_REGION": "us-central1",
    "GCLOUD_PROJECT": "<project name>",
    "FUNCTION_NAME": "api",
    "X_GOOGLE_GCLOUD_PROJECT": "<project name>",
    "FUNCTION_REGION": "us-central1",
    "PWD": "/user_code",
    "FUNCTION_TRIGGER_TYPE": "HTTP_TRIGGER",
    "FUNCTION_TIMEOUT_SEC": "60",
    "X_GOOGLE_FUNCTION_TRIGGER_TYPE": "HTTP_TRIGGER",
    "NODE_ENV": "production",
    "SHLVL": "1",
    "X_GOOGLE_FUNCTION_NAME": "api",
    "X_GOOGLE_ENTRY_POINT": "api",
    "X_GOOGLE_FUNCTION_IDENTITY": "<project name>@appspot.gserviceaccount.com",
    "X_GOOGLE_GCP_PROJECT": "<project name>",
    "X_GOOGLE_FUNCTION_TIMEOUT_SEC": "60",
    "ENTRY_POINT": "api",
    "FIREBASE_CONFIG": "{\"projectId\":\"<project name>\",\"databaseURL\":\"https://<project name>.firebaseio.com\",\"storageBucket\":\"<project name>.appspot.com\"}"
}
*/

// allow only content-type=application/json 
api.use(helpers.validateContentType);

//api.get("/base",(req,res)=> {
//    res.send(CONFIG.baseURL + req.path);
//})

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

    const verifyDnsPath = "/" + CONFIG.function_name + "/host/verifydns/"
    const emulatorPrefix = PROD_ENV ? "" : "/" + CONFIG.gcloud_project + "/" + CONFIG.function_region
    const protocol_ = PROD_ENV ? "https:" : "http:";
    const moduleToUse = PROD_ENV ? https : http;
    const defaultPort = PROD_ENV ? 443 : 80;

    hostDoc
        .then((docRef) => {
            if (docRef) {
                return docRef
            } else {
                throw e.notFound.message
            }
        })
        .then((docRef) => {
            console.log("docref is good");
            return {
                protocol: protocol_,
                hostname: docRef.data().host.split(":")[0],
                port: parseInt(docRef.data().host.split(":")[1]) || defaultPort,
                method: "GET",
                headers: { "content-type": "application/json" },
                path: emulatorPrefix + verifyDnsPath + docRef.data().verification_key
            }
        })
        .then((options) => helpers.makeRequest(moduleToUse, options))
        .then(([response, body]) => {
            console.log(response.statusCode, body)
            return [response, body];
        })
        //.then(([response, body]) => response.statusCode === 200)
        //.then((response) => response.statusCode === 200)
        .then(([response, body]) => response.statusCode === 200 ? res.send(body) : res.status(e.invalidRequest.code).send(e.invalidRequest.error))
        .catch((error) => {

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