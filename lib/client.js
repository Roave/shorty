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

    self.on = function(eventName, callback) {
        if (typeof callback == 'function') {
            self.callbacks[eventName] = callback;
        }
    };

    self.connect = function() {
        if ( DEBUG ) { console.log('Connecting to tcp://'+self.config.host+':'+self.config.port); }

        // try connecting to the host:port from the config file
        self.socket = net.createConnection(self.config.port, self.config.host);

        self.socket.on('connect', function() {
            if ( DEBUG ) { console.log('Socket connected; attempting transceiver bind...'); }

            // attempt a bind immediately upon connection
            self.bind();
        });

        self.socket.on('data', function(buffer) {

            // it is possible that PDUs could be split up between TCP packets
            // so we need to keep track of anything that's been split up
            var parsedBuffer = pdu.fromBuffer(buffer, self.splitPacketBuffer);
            var myPdus = parsedBuffer['pdus'];
            self.splitPacketBuffer = parsedBuffer['splitPacketBuffer'];
            var myPdu, message;

            // due to the Nagle algorithm, multiple PDUs could come in in one packet
            // in order to save bandwidth
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
                        break;
                    case smpp.commands.bind_receiver_resp:
                    case smpp.commands.bind_transmitter_resp:
                    case smpp.commands.bind_transceiver_resp:
                        // bind_transceiver_resp
                        if (DEBUG) { console.log('bind successful'); }
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

    // user_ref can be used as a reference for the user; such as an autoincrement
    // or unique id in a database; this allows users to know whether they need to
    // re-try sending a particular message
    self.sendMessage = function(mySms) {
        // for all requests that we initiate, we need to increment the sequence number
        mySms.sequence_number = self.sequence_number++;

        // create and send the PDU
        var myPdu = smpp.sm_submit(mySms, {});
        self.sendPdu(myPdu);

        // keep track of messages that should me marked as sent when a sm_submit_resp is received
        self.sms_sent[mySms.sequence_number] = mySms;
    };

    self.sm_submit_resp = function(myPdu) {
        // if we're currently tracking a sent sms with this sequence number...
        if (self.sms_sent[ myPdu.sequence_number ] != undefined) {
            var mySms = self.sms_sent[ myPdu.sequence_number ];

            // notify the application hook that this particular sms was sent
            if (typeof self.callbacks['sent'] == 'function') {
                self.callbacks['sent'](mySms);
            }

            // stop tracking this message;
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

    // at the moment we only support transceiver mode, but receiver and transmitter
    // modes are certainly a possibility, even if they're a little redundant
    self.bind = function() {
        var myPdu = smpp.bind(self.config, self.sequence_number);
        self.sendPdu(myPdu);
    };

    self.sendPdu = function(myPdu) {
        self.socket.write(myPdu.toBuffer());
    };
};
