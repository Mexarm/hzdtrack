/*
 *
 * 
 *  helper functions
 * 
 * 
 */

const helpers = {};

//middleware: this api only accepts content-type = application/json
helpers.validateContentType = function (req, res, next) {
    if (['POST', 'PUT'].indexOf(req.method) !== -1) {
        if (req.is('application/json')) {
            return next();
        } else {
            return res.status(400).send({ "error": "please use content-type=\"application/json\"" });
        }
    } else {
        return next();
    }
};

helpers.getRandomString = function (iters) {
    key = "";
    for (var i = 0; i < iters; i++) key += Math.random().toString(36).substring(2, 15);
    return key;
};

helpers.makeRequest = (httpModule, options) => {
    return new Promise((resolve, reject) => {
        var req = httpModule.request(options, (res)=>{
            // reject on bad status
            if (res.statusCode < 200 || res.statusCode >= 300) {
                reject(new Error('statusCode=' + res.statusCode));
            }
            // cumulate data
            var body = [];
            res.on('data', (chunk) =>{
                body.push(chunk);
            });
            // resolve on end
            res.on('end', () => {
                try {
                    //body = JSON.parse(Buffer.concat(body).toString());
                    body = Buffer.concat(body).toString();
                } catch(e) {
                    reject(e);
                }
                resolve([res,body]);
            });
        });
        // reject on request error
        req.on('error', (err) => {
            // This is not a "Second reject", just a different sort of failure
            reject(err);
        });
        // IMPORTANT
        req.end();
    });
}
module.exports = helpers;

