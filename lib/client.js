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
    self.bind_type = 0;
    self.shouldReconnect = true;
    
    self.reconnectTimer = false;

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
    
    self.setupReconnect = function() {
    	self.sequence_number = 1;
    	self.bound = false;
    	self.bind_type = 0;
    	self.splitPacketBuffer = new Buffer(0);
    	
    	self.connect();
    };
    
    self.reconnect = function() {
    	if (self.shouldReconnect && self.reconnectTimer == false) {
            if (config.client_reconnect_interval != undefined) {
                var reconnect = config.client_reconnect_interval;
            } else {
                var reconnect = 2500;
            }

    		self.reconnectTimer = setInterval(self.setupReconnect, reconnect);
    	}
    };

    self.connect = function() {
        if ( DEBUG ) { console.log('Connecting to tcp://'+self.config.host+':'+self.config.port); }

        // try connecting to the host:port from the config file
        self.socket = net.createConnection(self.config.port, self.config.host);
        self.socket.on('end', self.connectionClose);
        self.socket.on('error', self.socketErrorHandler);

        self.socket.on('connect', function() {
            if ( DEBUG ) { console.log('Socket connected; attempting bind...'); }
            clearInterval(self.reconnectTimer);
            self.reconnectTimer = false;
            
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
                            self.callbacks['incomingMessage'](message.sender, message.recipient, message.message);
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
                        self.bindResponse(myPdu);
                        break;
                    case smpp.commands.unbind:
                    	self.shouldReconnect = false;
                        self.sendPdu(smpp.unbind_resp(myPdu.sequence_number));
                        self.socket.end();
                        self.bind_type = smpp.UNBOUND;
                        self.bound = false;
                        break;
                    case smpp.commands.unbind_resp:
                        self.bound = false;
                        self.socket.end();
                        break;
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
    self.sendMessage = function(sender, recipient, message) {
        if (self.bind_type == smpp.RECEIVER || self.bind_type == 0) {
            return false;
        }

        var mySms = sms.create(sender, recipient, message);

        // for all requests that we initiate, we need to increment the sequence number
        self.sequence_number++;
        mySms.sequence_number = self.sequence_number;

        // create and send the PDU
        var myPdu = smpp.submit_sm(mySms, {});
        var success = self.sendPdu(myPdu);

        if (success == false) {
            return false;
        }

        return mySms.sequence_number;
    };

    self.handleSubmitSmResp = function(myPdu) {
        if (myPdu.command_status == 0x0) {
            // notify the application hook that this particular sms was sent
            if (typeof self.callbacks['sendSuccess'] == 'function') {
                self.callbacks['sendSuccess'](myPdu.sequence_number, myPdu.pdu_body.toString('ascii'));
            }
        } else {
            if (typeof self.callbacks['sendFailure'] == 'function') {
                self.callbacks['sendFailure'](myPdu.sequence_number, myPdu.pdu_body.toString('ascii'));
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
            self.socket.end();
        }
    };

    self.bind = function() {
        var myPdu = smpp.bind(self.config, self.sequence_number);
        self.sendPdu(myPdu);
    };

    self.bindResponse = function(myPdu) {
        // bind_transceiver_resp

        if (myPdu.command_status == 0x0) {
            if (DEBUG) { console.log('bind successful'); }
            self.bound = true;

            switch(myPdu.command_id) {
                case smpp.commands.bind_receiver_resp:
                    self.bind_type = smpp.RECEIVER;
                    break;
                case smpp.commands.bind_transceiver_resp:
                    self.bind_type = smpp.TRANSCEIVER;
                    break;
                case smpp.commands.bind_transmitter_resp:
                    self.bind_type = smpp.TRANSMITTER;
                    break;
            }

            self.sequence_number++;
            if (typeof self.callbacks['bindSuccess'] == 'function') {
                self.callbacks['bindSuccess']();
            }

            if (self.config.client_keepalive != undefined && self.config.client_keepalive == true) {
                self.socket.setTimeout(self.config.timeout * 1000);
                self.socket.on('timeout', self.enquire_link);
            }
        } else {
            if (DEBUG) { console.log('bind failed'); }
            self.bound = false;
            self.bind_type = smpp.UNBOUND;

            if (typeof self.callbacks['bindFailure'] == 'function') {
                self.callbacks['bindFailure']();
            }

            self.socket.end();
        }
    };

    self.unbind = function() {
        var myPdu = smpp.unbind(++self.sequence_number);
        self.sendPdu(myPdu);
    };

    self.sendPdu = function(myPdu) {
        if (self.sequence_number >= 2000000000) {
            self.sequence_number = 1;
        }

        if (self.socket.readyState == 'open') {
            self.socket.write(myPdu.toBuffer());
            return true;
        } else {
            self.connectionClose();
            return false;
        }
    };

    self.connectionClose = function(e) {
        if (typeof self.callbacks['disconnect'] == 'function') {
            self.callbacks['disconnect']();
        }

        self.bind_type = 0;
        self.bound = false;
        
        self.reconnect();
    };

    self.socketErrorHandler = function(e) {
        switch(e.errno) {
            case 32:
                // Broken pipe
                if (DEBUG) { console.log('SOCKET ERROR (32): broken pipe'); }
                self.socket.end();
                break;
            case 104:
                if (DEBUG) { console.log('SOCKET ERROR (104): connection reset'); }
                self.socket.end();
                break;
            case 111:
                if (DEBUG) { console.log('SOCKET ERROR (111): connection refused'); }
                self.socket.end();
                break;
            default:
                if (DEBUG) { console.log('SOCKET ERROR: ' + sys.inspect(e)); }
                self.socket.end();
                break;
        }
        
        if (typeof self.callbacks['disconnect'] == 'function') {
        	self.callbacks['disconnect']();
        }
        
        self.reconnect();
    };
};
