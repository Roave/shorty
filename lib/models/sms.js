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
    pdu  = require('./pdu'),
    pack = require('./utils/pack');

var sms = function(sender, recipient, message, sequence_number) {
    var self = this;
    self.sender = sender;
    self.recipient = recipient;
    self.message = message;
    if (sequence_number === undefined) {
        self.sequence_number = 0;
    } else {
        self.sequence_number = sequence_number;
    }
    self.confirmation = false;
    self.failureTimeout = null;

    self.toPdu = function(command) {
        var payload = pack.pack(
            'a1cca' + (self.sender.length + 1) + 'cca' + (self.recipient.length + 1) + 'ccca1a1cccccU' + (Buffer.byteLength(self.message, 'utf8')),
            "",     //service_type
            0x00,      //source_addr_ton
            0x00,      //source_addr_npi
            self.sender,   //source_addr
            0x00,      //dest_addr_ton
            0x00,      //dest_addr_npi
            self.recipient,     //destination_addr
            0x00,      //esm_class
            0x00,      //protocol_id
            0x00,      //priority_flag
            "",     //schedule_delivery_time
            "",     //validity_period
            0x00,      //a couple fields,
            0x00,
            0x03,
            0x00,
            Buffer.byteLength(self.message),     //message length
            self.message);           //message

        return pdu.createPdu(command, self.sequence_number, payload);
    };

};

exports.fromPdu = function(myPdu) {

    var i, from, to, length, message, sequence_number, start, end, data_coding;

    // not really sure whether we'll run into encoding issues by using ascii encoding
    // over utf8, but it works for the moment
    
    for (i = 0; i < 6; i++) {
        if (myPdu.pdu_body[i] === 0x0) {
            break;
        }
    }

    i += 3;

    start = i;
    for (i; i <= start + 21; i++) {
        if (myPdu.pdu_body[i] === 0x0) {
            end = i; break;
        }
    }

    from = myPdu.pdu_body.toString('ascii', start, end);

    i += 3;

    start = i;
    for (i; i <= start + 21; i++) {
        if (myPdu.pdu_body[i] === 0x0) {
            end = i; break;
        }
    }

    to = myPdu.pdu_body.toString('ascii', start, end);

    i += 4;

    if (myPdu.pdu_body[i] === 0x0) {
        i++;
    } else {
        i += 17;
    }
    
    if (myPdu.pdu_body[i] === 0x0) {
        i++;
    } else {
        i += 17;
    }

    i += 2;
    data_coding = myPdu.pdu_body[i];

    i += 2;
    length = myPdu.pdu_body[i];

    i++;

    if (data_coding == 0x08) {
        message = myPdu.pdu_body.toString('ucs2', i, i + length);
    } else {
        message = myPdu.pdu_body.toString('utf8', i, i + length);
    }

    sequence_number = myPdu.sequence_number;

    return new sms(from, to, message, sequence_number);
};

exports.create = function(sender, recipient, message, sequence_number) {
    return new sms(sender, recipient, message, sequence_number);
};
