/*
 * 
 * 
 * api endpoint 
 * 
 * 
 */

const admin = require('firebase-admin');
const express = require('express');
const axios = require('axios');
const helpers = require('./helpers');
const e = require("./error");

admin.initializeApp();
const api = express();
const db = admin.firestore();

hostRef = db.collection('host');

// allow only content-type=application/json 
//api.use(helpers.validateContentType);

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
        hostRef.where("host", "==", host).get()
            .then((snap) =>
                snap.empty && hostRef.add({
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
api.get("/host/:host", (req, res) => {
    const host = req.params.host;
    const isId = host.indexOf(".") === -1 ? true : false; // is a document ID ? 
    const querySnapshot = isId ? hostRef.get(host) : hostRef.where("host", "==", host).get()
    querySnapshot.then((snap) =>
        snap.empty ?
            res.status(e.notFound.code).send(e.notFound.error) :
            res.send({ "id": snap.docs[0].id, "data": snap.docs[0].data() })
    )
        .catch((reason) => {
            console.log("DB ERROR:", reason);
            res.status(e.internalDBError.code).send(e.internalDBError.error);
        });
});

// update host
// method: PUT
// parameters : settings :
//              click_tracking 
//              open_tracking,
//              unsubscribes
api.put("/host/:host", (req, res) => {
    const host = req.params.host;
    const settings_ = typeof req.body.data === "object" && typeof req.body.data.settings === "object" ?
        req.body.data.settings : {};
    const settings = {};
    if (typeof settings_.click_tracking === 'boolean') settings.click_tracking = settings_.click_tracking;
    if (typeof settings_.open_tracking === 'boolean') settings.open_tracking = settings_.open_tracking;
    if (typeof settings_.unsubscribes === 'boolean') settings.unsubscribes = settings_.unsubscribes;

    const isId = host.indexOf(".") === -1 ? true : false; // is a document ID ? 
    const querySnapshot = isId ? hostRef.get(host) : hostRef.where("host", "==", host).get()
    querySnapshot
        .then((snap) => snap.empty ? false : snap.docs[0].ref)
        .then((ref) => ref ? ref.set({ settings }, { merge: true }) : false
        )
        .then((result) =>
            result ? res.send({ "message": "host settings updated" }) :
                res.status(e.notFound.code).send(e.notFound.error)
        )
        .catch((reason) => {
            console.log("DB ERROR:", reason);
            return res.status(e.internalDBError.code).send(e.internalDBError.error);
        })
});

// delete host
// method: DELETE
// parameters : host to delete as a parameter
// example:  /host/<host.to.delete> or /host/<host_id>
api.delete("/host/:host", (req, res) => {
    const host = req.params.host;
    const isId = host.indexOf(".") === -1 ? true : false; // is a document ID ? 
    const querySnapshot = isId ? hostRef.get(host) : hostRef.where("host", "==", host).get()
    querySnapshot
        .then((snap) => snap.empty ? false : snap.docs[0].ref)
        .then((ref) => ref ? ref.delete() : false
        )
        .then((result) =>
            result ? res.send({ "message": "host sucessfully deleted" }) :
                res.status(e.notFound.code).send(e.notFound.error)
        )
        .catch((reason) => {
            console.log("DB ERROR:", reason);
            return res.status(e.internalDBError.code).send(e.internalDBError.error);
        })
});

module.exports = api;