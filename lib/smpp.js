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

exports.bind_transceiver_resp = function(sequence_number, system_id) {
    // IMPORTANT: note the parentheses around (system_id.length + 1)
    // This is absolutely essential and will totally screw up your PDU
    // if you omit them.
    payload = pdu.pack('a' + (system_id.length + 1), system_id);

    return pdu.createPdu(exports.commands.bind_transceiver_resp, sequence_number, payload);
};

exports.enquire_link = function(sequence_number) {
    return pdu.createPdu(smpp.commands.enquire_link, sequence_number);
}

/*
 *  It is acceptable to pass in the config object from config.json for this
 *  method's only parameter
 */
exports.bind_transceiver = function(config, sequence_number) {
    payload = pdu.pack(
                'a' + (config.system_id.length + 1) +
                'a' + (config.password.length + 1) +
                'a' + (config.system_type.length + 1) +
                'CCCa' + (config.addr_range.length + 1),
                config.system_id, config.password, config.system_type,
                config.version, config.addr_ton, config.addr_npi,
                config.addr_range);

    return pdu.createPdu(smpp.commands.bind_transceiver, sequence_number, payload);
}

/*
 *  The parameter here is the sequence number from the enquire_link
 *  command previously received
 */
exports.enquire_link_resp = function(sequence_number) {
    return pdu.createPdu(smpp.commands.enquire_link_resp, sequence_number);
}

exports.deliver_sm_resp = function(sequence_number) {
    // The protocol is weird. This field is always null, but is required.
    // Is it possible that it is so that the command is similar in format
    // to submit_sm_resp?
    payload = pdu.pack('C', "\0");
    return pdu.createPdu(smpp.commands.deliver_sm_resp, sequence_number, payload);
}

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

    payload = pdu.pack(
        'a1cca' + (mySms.sender.length + 1) + 'cca' + (mySms.recipient.length + 1) + 'ccca1a1ccccca' + (mySms.message.length),
        "",     //service_type
        0,      //source_addr_ton
        0,      //source_addr_npi
        mySms.sender,   //source_addr
        0,      //dest_addr_ton
        0,      //dest_addr_npi
        mySms.recipient,     //destination_addr
        0,      //esm_class
        0,      //protocol_id
        0,      //priority_flag
        "",     //schedule_delivery_time
        "",     //validity_period
        0,      //registered_delivery
        0,      //replace_if_present_flag
        3,      //data_coding
        0,      //sm_default_msg_id
        mySms.message.length.toString(),
        mySms.message.toString());

    return pdu.createPdu(smpp.commands.submit_sm, mySms.sequence_number, payload);
}
