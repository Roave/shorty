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
 * @package    client
 */
var net     = require('net'),
    sys     = require('sys'),
    smpp    = require('./smpp'),
    pdu     = require('./models/pdu');

exports.client = function(config) {
    var self = this;
    self.config = config;
    self.socket = {};
    self.sequence_number = 1;
    self.bound = false;

    self.callbacks = {};

    self.on = function(eventName, callback) {
        if (typeof callback == 'function') {
            self.callbacks[eventName] = callback;
        }
    }

    self.connect = function() {
        if ( DEBUG ) { console.log('Connecting to tcp://'+self.config.host+':'+self.config.port); }
        self.socket = net.createConnection(self.config.port, self.config.host);

        self.socket.on('connect', function() {
            if ( DEBUG ) { console.log('Socket connected... Attempting bind...'); }
            self.bind();
        });
        self.socket.on('data', function(buffer) {
            myPdu = pdu.fromBuffer(buffer);
            if ( DEBUG ) { console.log('Incoming PDU: ' + smpp.command_ids[myPdu.command_id]); }

            switch (myPdu.command_id) {
                case 0x0000005:
                    if (DEBUG) { console.log('deliver_sm received; processing message'); }
                    message = self.deliver_sm_resp(myPdu);
                    if (DEBUG) { console.log(sys.inspect(message)); }
                    if (typeof self.callbacks['incoming'] == 'function') {
                        self.callbacks['incoming'](message);
                    }
                    break;
                case 0x00000015:
                    if (DEBUG) { console.log('enquire_link_resp sent; seq: ' + myPdu.sequence_number); }
                    self.enquire_link_resp(myPdu);
                    break;
                case 0x80000009:
                    if (DEBUG) { console.log('bind_transceiver successful'); }
                    self.bound = true;
                    self.sequence_number++;
                    if (typeof self.callbacks['bind_success'] == 'function') {
                        self.callbacks['bind_success']();
                    }
                    return;
                default:
                    break;
            }
        });
    };

    self.sendMessage = function(from, to, message) {
        seqn = self.sequence_number++;
        var myPdu = smpp.sm_submit(from, to, message, self.sequence_number, {});
        self.sendPdu(myPdu);

        return seqn;
    }

    self.deliver_sm_resp = function(myPdu) {
        body = {};
        body['from'] = myPdu.pdu_body.toString('ascii', 3, 14);
        body['to'] = myPdu.pdu_body.toString('ascii', 17, 28);
        body['length'] = myPdu.pdu_body[38];
        body['message'] = myPdu.pdu_body.toString('ascii', 39, myPdu.pdu_bdy.length);
        body['sequence_number'] = myPdu.sequence_number;

        // The body must be set to NULL per SMPPv3.4
        myPdu = smpp.deliver_sm_resp(body['sequence_number']);
        self.sendPdu(myPdu);

        return body;
    }

    self.enquire_link_resp = function(oldPdu) {
        newPdu = smpp.enquire_link_resp(oldPdu.sequence_number);
        self.sendPdu(newPdu);
    };

    self.bind = function() {
        myPdu = smpp.bind_transceiver(self.config, self.sequence_number);
        self.sendPdu(myPdu);
    };

    self.sendPdu = function(myPdu) {
        self.socket.write(myPdu.toBuffer());
    };
};
