/**
 * This file is part of Shorty.
 *
 * Shorty is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; version 3 of the License.
 *
 * Shorty is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with Shorty.  If not, see <http://www.gnu.org/licenses/>.
 *
 * @category   shorty
 * @license    http://www.gnu.org/licenses/gpl-3.0.txt GPL
 * @copyright  Copyright 2010 Evan Coury (http://www.Evan.pro/)
 * @package    smpp
 */

var pdu  = require('./models/pdu'),
    smpp = exports;                                  // Just for convenience

exports.commands = {};                               // Use commands to look up by command name
exports.command_ids = {                              // Use command_ids to look up by ID
    0x80000000: 'generic_nack',
    0x00000001: 'bind_receiver',
    0x80000001: 'bind_receiver_resp',
    0x00000002: 'bind_transmitter',
    0x80000002: 'bind_transmitter_resp',
    0x00000003: 'query_sm',
    0x80000003: 'query_sm_resp',
    0x00000004: 'submit_sm',
    0x80000004: 'submit_sm_resp',
    0x00000005: 'deliver_sm',
    0x80000005: 'deliver_sm_resp',
    0x00000006: 'unbind',
    0x80000006: 'unbind_resp',
    0x00000007: 'replace_sm',
    0x80000007: 'replace_sm_resp',
    0x00000008: 'cancel_sm',
    0x80000008: 'cancel_sm_resp',
    0x00000009: 'bind_transceiver',
    0x80000009: 'bind_transceiver_resp',
    0x0000000B: 'outbind',
    0x00000015: 'enquire_link',
    0x80000015: 'enquire_link_resp',
    0x00000021: 'submit_multi',
    0x80000021: 'submit_multi_resp',
    0x00000102: 'alert_notification',
    0x00000103: 'data_sm',
    0x80000103: 'data_sm_resp'
};

// Reverse coomand_ids into commands so we can have easy lookup either way!
for (var command_id in exports.command_ids) {
    exports.commands[ exports.command_ids[command_id] ] = parseInt(command_id);
}

/*
 *  These methods implement the SMPP protocol commands of the same name
 *  see the SMPPv3.4 protocol documentation for more information.
 *
 *  All methods below return a PDU as a Buffer object ready to be
 *  written to a socket.
 */

/************************************************
 *
 *            SERVER-SIDE COMMANDS
 *
 ************************************************/

/*
 *  TODO: we need to somehow support messages and message id's so that we
 *  can support query_sm, replace_sm, and cancel_sm; for the sake of getting
 *  things done, I'm not going to implement it right now. -- Ben
 */
exports.submit_sm_resp = function(myPdu, message_id, cmd_status) {
    if (cmd_status == undefined) {
        cmd_status = 0x0;
    } else if (cmd_status == "failure") {
        cmd_status = 0x00000045;
    }

    if (message_id == undefined) {
        message_id = "";
    }

    var payload = pdu.pack('a' + (message_id.length + 1), message_id);
    return pdu.createPdu(exports.commands.submit_sm_resp, myPdu.sequence_number, payload, cmd_status);
};

exports.bind_resp = function(bind_type, sequence_number, system_id, error_status) {
    // IMPORTANT: note the parentheses around (system_id.length + 1)
    // This is absolutely essential and will totally screw up your PDU
    // if you omit them.
    var payload = pdu.pack('a' + (system_id.length + 1), system_id);

    // For bind_transceiver, there can be an error status if the provided
    // credentials were incorrect
    if (error_status != undefined && error_status == true) {

        // This is the invalid password error code -- SMPPv3.4 says to differentiate
        // between system_id and password errors, but since system_id is frequently
        // used as a username (and since both are very limited in length), this seems
        // to introduce a security hole that can be patched by not specifying which
        // credential is incorrect
        var cmd_status = 0x0000000E;
    } else {
        var cmd_status = 0x0;
    }

    var command_id = 0x80000000 | bind_type;
    return pdu.createPdu(command_id, sequence_number, payload, cmd_status);
};

exports.enquire_link = function(sequence_number) {
    // enquire_link is just an SMPP header; no PDU body
    return pdu.createPdu(smpp.commands.enquire_link, sequence_number);
};

/**
 * @todo handle messages > 160 chars
 * @todo handle optional params
 *
 * from and to should typically be valid phone numbers
 * message should be a string with (for now) length <= 160
 * optional params should be an object of the form { param: value }
 */
exports.deliver_sm = function(mySms, optional_params) {
    if (optional_params != undefined) {}
    return mySms.toPdu(smpp.commands.deliver_sm);
};


/************************************************
 *
 *            CLIENT-SIDE COMMANDS
 *
 ************************************************/

/*
 *  Since most of the parameters required for this method are in
 *  the config file, just pass in the config object (or a subset)
 */
exports.bind = function(config, sequence_number) {
    var payload = pdu.pack(
                'a' + (config.system_id.length + 1) +
                'a' + (config.password.length + 1) +
                'a' + (config.system_type.length + 1) +
                'CCCa' + (config.addr_range.length + 1),
                config.system_id, config.password, config.system_type,
                config.version, config.addr_ton, config.addr_npi,
                config.addr_range);

    var command;
    switch (config.mode) {
        case 'transceiver':
            command = smpp.commands.bind_transceiver;
            break;
        case 'receiver':
            command = smpp.commands.bind_receiver;
            break;
        case 'transmitter':
            command = smpp.commands.bind_transmitter;
            break;
        default:
            throw('invalid client mode specified in config');
            break;
    }

    return pdu.createPdu(command, sequence_number, payload);
};

/*
 *  The parameter here is the sequence number from the enquire_link
 *  command previously received
 */
exports.enquire_link_resp = function(sequence_number) {
    return pdu.createPdu(smpp.commands.enquire_link_resp, sequence_number);
};

exports.deliver_sm_resp = function(sequence_number) {
    // The protocol is weird. This field is always null, but is required.
    // Is it possible that it is so that the command is similar in format
    // to submit_sm_resp?
    var payload = pdu.pack('C', "\0");
    return pdu.createPdu(smpp.commands.deliver_sm_resp, sequence_number, payload);
};

/**
 * @todo handle messages > 160 chars
 * @todo handle optional params
 *
 * from and to should typically be valid phone numbers
 * message should be a string with (for now) length <= 160
 * optional params should be an object of the form { param: value }
 */
exports.sm_submit = function(mySms, optional_params) {
    if (optional_params != undefined) {}
    return mySms.toPdu(smpp.commands.submit_sm);
};
