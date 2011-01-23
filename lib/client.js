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

    self.splitPacketBuffer = new Buffer(0);

    /*
     *  Current callbacks:
     *      - bindSuccess: fired on a successful bind
     *      - incoming: fired on an incoming SMS
     *      - sendSuccess: fired when a submit_sm_resp is received for a message
     *      - sendFailure: fired when a submit_sm_resp is not received within 20 seconds
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
                        if (typeof self.callbacks['incomingMessage'] == 'function') {
                            self.callbacks['incomingMessage'](message);
                        }
                        break;
                    case smpp.commands.enquire_link:
                        // enquire_link
                        if (DEBUG) { console.log('enquire_link_resp sent; seq: ' + myPdu.sequence_number); }
                        self.handleEnquireLinkResp(myPdu);
                        break;
                    case smpp.commands.enquire_link_resp:
                        // note the time!
                        var d = new Date();
                        self.enquire_link_resp_received = d.getTime();
                        break;
                    case smpp.commands.submit_sm_resp:
                        // submit_sm_resp
                        self.handleSubmitSmResp(myPdu);
                        break;
                    case smpp.commands.bind_receiver_resp:
                    case smpp.commands.bind_transmitter_resp:
                    case smpp.commands.bind_transceiver_resp:
                        // bind_transceiver_resp
                        if (DEBUG) { console.log('bind successful'); }
                        self.bound = true;
                        self.sequence_number++;
                        if (typeof self.callbacks['bindSuccess'] == 'function') {
                            self.callbacks['bindSuccess']();
                        }

                        if (self.config.client_keepalive != undefined && self.config.client_keepalive == true) {
                            self.socket.setTimeout(self.config.timeout * 1000);
                            self.socket.on('timeout', self.enquire_link);
                        }

                        return;
                    default:
                        break;
                }
            }
        });
    };

    /*
     * The return value of this method is the submit_sm's SMPP sequence number
     * it can be used by the user implementation to track responses; potential
     * use is up to the user, and it's not necessary if it doesn't matter
     * whether messages were sent without error
     */
    self.sendMessage = function(mySms) {
        // for all requests that we initiate, we need to increment the sequence number
        self.sequence_number++;
        mySms.sequence_number = self.sequence_number;

        // create and send the PDU
        var myPdu = smpp.submit_sm(mySms, {});
        self.sendPdu(myPdu);

        return mySms.sequence_number;
    };

    self.handleSubmitSmResp = function(myPdu) {
        if (myPdu.command_status == 0x0) {
            // notify the application hook that this particular sms was sent
            if (typeof self.callbacks['sendSuccess'] == 'function') {
                self.callbacks['sendSuccess'](myPdu.sequence_number);
            }
        } else {
            if (typeof self.callbacks['sendFailure'] == 'function') {
                self.callbacks['sendFailure'](myPdu.sequence_number);
            }
        }
    };

    self.deliver_sm_resp = function(myPdu) {
        var mySms = sms.fromPdu(myPdu);

        // The body must be set to NULL per SMPPv3.4
        var newPdu = smpp.deliver_sm_resp(mySms.sequence_number);
        self.sendPdu(newPdu);

        return mySms;
    };

    self.handleEnquireLinkResp = function(oldPdu) {
        var newPdu = smpp.enquire_link_resp(oldPdu.sequence_number);
        self.sendPdu(newPdu);
    };

    // this is our timeout function; it makes sure the connection
    // is still good and that the client on the other end is okay
    self.enquire_link = function() {
        // increment the sequence number for all outgoing requests
        self.sequence_number++;
        if ( DEBUG ) { console.log('sent enquire_link; seq: ' + self.sequence_number); }
        var myPdu = smpp.enquire_link(self.sequence_number);
        self.sendPdu(myPdu);
        setTimeout(self.check_enquire_link_status, 10 * 1000); // check for enquire_link_resp within 10 seconds
    };

    // when this function runs, it means we sent an enquire_link request
    // about 10 seconds ago, so we need to make sure we got a response
    // since then
    self.check_enquire_link_status = function() {
        var d = new Date();
        var now = d.getTime();

        // within 15 seconds is okay to account for network latency and
        // system load spikes that could have the possibility of throwing off
        // timers
        if (now - 15000 >= self.enquire_link_resp_received) {
            // if they didn't respond, destroy the connection
            if ( DEBUG ) { console.log("connection timed out"); }
            self.socket.destroy();
        }
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
