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
    pdu     = require('./models/pdu'),
    sms     = require('./models/sms');

exports.client = function(config) {
    var self = this;
    self.config = config;
    self.socket = {};
    self.sequence_number = 1;
    self.bound = false;

    /*
     *  This contains sms objects that have been sent via
     *  sm_submit that are awaiting a corresponding sm_submit_resp
     */
    self.sms_sent = {};
    self.splitPacketBuffer = new Buffer(0);

    /*
     *  Current callbacks:
     *      - bind: fired on a successful bind
     *      - incoming: fired on an incoming SMS
     *      - sent: fired when a sm_submit_resp is received for a message
     */
    self.callbacks = {};
    self.x = 0;

    self.on = function(eventName, callback) {
        if (typeof callback == 'function') {
            self.callbacks[eventName] = callback;
        }
    };

    self.connect = function() {
        if ( DEBUG ) { console.log('Connecting to tcp://'+self.config.host+':'+self.config.port); }
        self.socket = net.createConnection(self.config.port, self.config.host);

        self.socket.on('connect', function() {
            if ( DEBUG ) { console.log('Socket connected... Attempting bind...'); }
            self.bind();
        });
        self.socket.on('data', function(buffer) {
            var parsedBuffer = pdu.fromBuffer(buffer, self.splitPacketBuffer);
            var myPdus = parsedBuffer['pdus'];
            self.splitPacketBuffer = parsedBuffer['splitPacketBuffer'];
            var myPdu, message;

            for (var i = 0; i < myPdus.length; i++) {
                myPdu = myPdus[i];
                if ( DEBUG ) { console.log('Incoming PDU: ' + smpp.command_ids[myPdu.command_id]); }

                switch (myPdu.command_id) {
                    case smpp.commands.deliver_sm:
                        // deliver_sm
                        if (DEBUG) { console.log('deliver_sm received; processing message'); }
                        var message = self.deliver_sm_resp(myPdu);
                        if (DEBUG) { console.log(sys.inspect(message)); }
                        if (typeof self.callbacks['incoming'] == 'function') {
                            self.callbacks['incoming'](message);
                        }
                        break;
                    case smpp.commands.enquire_link:
                        // enquire_link
                        if (DEBUG) { console.log('enquire_link_resp sent; seq: ' + myPdu.sequence_number); }
                        self.enquire_link_resp(myPdu);
                        break;
                    case smpp.commands.submit_sm_resp:
                        // submit_sm_resp
                        self.sm_submit_resp(myPdu);
                        self.x++;
                        break;
                    case smpp.commands.bind_transceiver_resp:
                        // bind_transceiver_resp
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
            }
        });
    };

    self.sendMessage = function(from, to, message, user_ref) {
        var seqn = self.sequence_number++;

        var mySms = sms.create(from, to, message, self.sequence_number, user_ref);

        var myPdu = smpp.sm_submit(mySms, {});
        self.sendPdu(myPdu);

        self.sms_sent[mySms.sequence_number] = mySms;

        return 1;
    };

    self.sm_submit_resp = function(myPdu) {
        if (self.sms_sent[ myPdu.sequence_number ] != undefined) {
            var mySms = self.sms_sent[ myPdu.sequence_number ];

            if (typeof self.callbacks['sent'] == 'function') {
                self.callbacks['sent'](mySms);
            }

            delete self.sms_sent[ myPdu.sequence_number ];
        }
    };

    self.deliver_sm_resp = function(myPdu) {
        var mySms = sms.fromPdu(myPdu);

        // The body must be set to NULL per SMPPv3.4
        var newPdu = smpp.deliver_sm_resp(mySms.sequence_number);
        self.sendPdu(newPdu);

        return mySms;
    };

    self.enquire_link_resp = function(oldPdu) {
        var newPdu = smpp.enquire_link_resp(oldPdu.sequence_number);
        self.sendPdu(newPdu);
    };

    self.bind = function() {
        var myPdu = smpp.bind_transceiver(self.config, self.sequence_number);
        self.sendPdu(myPdu);
    };

    self.sendPdu = function(myPdu) {
        self.socket.write(myPdu.toBuffer());
    };
};
