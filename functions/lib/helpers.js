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

module.exports = helpers;

