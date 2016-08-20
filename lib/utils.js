'use strict';

/**
 * Utility method to check if PDU is allowed in current SMPP session state.
 * Response is always allowed as long as session state permits sending any PDUs
 *
 * @param smppDef SMPP definitions
 * @param {string} sessionState
 * @param {string} command
 * @param {boolean} |server=false| Whether to check for server or client side of the session
 * @returns {boolean}
 */
function isPduAllowedForSessionState(smppDef, command, sessionState, server) {
    if (exports.isResponsePdu(smppDef, command)) {
        return true;
    }
    const cformat = smppDef.command_formats[command];
    return (
        cformat
        && cformat.allowedStates.indexOf(sessionState) !== -1
        && (server ? cformat.serverCanSend : cformat.clientCanSend)
    );
}
exports.isPduAllowedForSessionState = isPduAllowedForSessionState;

/**
 * Checks if command is response PDU by testing command id for response bit
 *
 * @param smppDef
 * @param {string} command
 * @returns {boolean}
 * @throws {RangeError} if command is not defined
 */
function isResponsePdu(smppDefs, command) {
    if (!smppDefs.commands[command]) {
        throw new RangeError(`Command ${command} is not defined`);
    }
    return !!(smppDefs.commands[command] & 0x80000000);
}
exports.isResponsePdu = isResponsePdu;
