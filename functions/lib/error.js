/*
 *
 * error definition
 * 
 */

const error = {};

error.invalidRequiredParams = {
    "code": 400,
    "error": {
        "error_code": "invalid_required_params",
        "message": "invalid required parameters"
    }
}

error.invalidRequest = {
    "code" : 400,
    "error": {
        "error_code": "invalid_request",
        "message": "invalid request"
    }
}

error.alreadyExists = {
    "code": 400,
    "error": {
        "error_code": "already_exists",
        "message": "already exists"
    }
}

// error.internalErrorWritingToDB = {
//     "code": 500,
//     "error": {
//         "error_code" : "internal_error",
//         "message" : "internal error writing to database"
//     }
// }

// error.internalErrorReadingFromDB = {
//     "code": 500,
//     "error": {
//         "error_code" : "internal_error",
//         "message" : "internal error reading database"
//     }
// }

error.internalDBError = {
    "code": 500,
    "error": {
        "error_code": "internal_DB_error",
        "message": "Internal Database Error"
    }
}

error.notFound = {
    "code": 404,
    "error": {
        "error_code": "not_found",
        "error_message": "not found"
    }
}

error.verificationError = {
    code: 404,
    "error": {
        "error_code": "verification_error",
        "error_message" : "verification error"
    }
}

module.exports = error;