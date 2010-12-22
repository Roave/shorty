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
 * @package    models
 */

var smpp = require('../smpp'),
    pdu  = require('./pdu');

var sms = function(sender, recipient, message, sequence_number, user_ref) {
    var self = this;
    self.sender = sender;
    self.recipient = recipient;
    self.message = message;
    self.sequence_number = sequence_number;
    self.confirmation = false;

    // user_ref is a reference a user can use to identify a particular sms for themselves
    // could be an autoincrement/unique id in a database (or anything really)
    if (user_ref == undefined) {
        self.user_ref = "";
    } else {
        self.user_ref = user_ref;
    }

    self.toPdu = function(command) {
        var payload = pdu.pack(
            'a1cca' + (self.sender.length + 1) + 'cca' + (self.recipient.length + 1) + 'ccca1a1ccccca' + (self.message.length),
            "",     //service_type
            0,      //source_addr_ton
            0,      //source_addr_npi
            self.sender,   //source_addr
            0,      //dest_addr_ton
            0,      //dest_addr_npi
            self.recipient,     //destination_addr
            0,      //esm_class
            0,      //protocol_id
            0,      //priority_flag
            "",     //schedule_delivery_time
            "",     //validity_period
            0,      //registered_delivery
            0,      //replace_if_present_flag
            3,      //data_coding
            0,      //sm_default_msg_id
            self.message.length.toString(),     //message length
            self.message.toString());           //message

        return pdu.createPdu(command, self.sequence_number, payload);
    };

};

exports.fromPdu = function(myPdu) {

    // not really sure whether we'll run into encoding issues by using ascii encoding
    // over utf8, but it works for the moment
    var from = myPdu.pdu_body.toString('ascii', 3, 14);
    var to = myPdu.pdu_body.toString('ascii', 17, 28);
    var length = myPdu.pdu_body[38];
    var message = myPdu.pdu_body.toString('ascii', 39, myPdu.pdu_body.length);
    var sequence_number = myPdu.sequence_number;

    return new sms(from, to, message, sequence_number);
};

exports.create = function(sender, recipient, message, sequence_number, user_ref) {
    return new sms(sender, recipient, message, sequence_number, user_ref);
};
