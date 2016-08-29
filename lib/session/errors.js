'use strict';

class SmppSessionError extends Error {
    constructor(sessionId, message) {
        super(message);
        Object.defineProperty(this, 'name', {
            enumerable: false,
            value: this.constructor.name,
        });
        Error.captureStackTrace(this, this.constructor);
        this.sessionId = sessionId;
    }
}
exports.SmppSessionError = SmppSessionError;

class SmppSessionResponseFailure extends SmppSessionError {
    constructor(sessionId, pdu, respPdu) {
        super(
            sessionId,
            `Command ${pdu.command}#${pdu.sequence_number} got response with status code ${respPdu.status_code}`
        );
        this.statusCode = respPdu.status_code;
        this.pdu = pdu;
        this.respPdu = pdu;
    }
}
exports.SmppSessionResponseFailure = SmppSessionResponseFailure;

class SmppSessionResponseTimeout extends SmppSessionError {
    constructor(sessionId, pdu) {
        super(
            sessionId,
            `Timeout reached while waiting for response for command ${pdu.command}#${pdu.sequence_number}`
        );
        this.pdu = pdu;
    }
}
exports.SmppSessionResponseTimeout = SmppSessionResponseTimeout;

class SmppSessionStateError extends SmppSessionError {
    constructor(sessionId, message, state) {
        super(sessionId, `State ${state}: ${message}`);
        this.sessionState = state;
    }
}
exports.SmppSessionStateError = SmppSessionStateError;
