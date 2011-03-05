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

var net     = require('net'),
    sys     = require('sys'),
    smpp    = require('./../smpp'),
    pdu     = require('./pdu'),
    sms     = require('./sms');

exports.fromSocket = function(socket, server, connectionEndCallback, callbacks) {
    var client = new serverClient(socket, server, connectionEndCallback, callbacks);
    client.init(client.socketDataHandler);
    return client;
}

var serverClient = function(socket, server, closeConnectionServerCallback, callbacks) {
    var self = this;

    self.connection_id = socket.fd;
    self.socket = socket;
    self.sequence_number = 1;
    self.bound = false;
    self.rejected = false;

    self.server = server;
    self.config = server.config;

    /*
     *  Implemented callbacks:
     *      - bindRequest(system_id, password, system_type, bind_type): use this to check the
     *              credentials of an incoming connection; return true to allow bind
     *      - bindSuccess(): called on a successful bind
     *      - receiveOutgoing(sms): called when a mobile-terminated sms is received; return a
     *              unique message id
     *      - deliverySuccess(sms): called when an delievered sms has been accepted by the remote
     *              server -- MESSAGES SHOULD NOT BE MARKED AS SENT UNTIL THIS CALLBACK IS
     *              FIRED!
     */
    self.callbacks = callbacks;

    // server callback for when the connection closes (to clean up the client object)
    self.closeConnectionServerCallback = closeConnectionServerCallback;

    // bind information
    self.system_id = "";
    self.password = "";
    self.system_type = "";
    self.interface_version = "";
    self.addr_ton = "";
    self.addr_npi = "";
    self.addr_range = "";
    self.bind_type = 0;

    // initialize the split packet buffer
    self.splitPacketBuffer = new Buffer(0);

    self.enquire_link_resp_received = 0;

    self.init = function() {
        self.socket.on('data', self.socketDataHandler);
        self.socket.on('end', self.connectionClose);
        self.socket.on('close', self.connectionClose);
        self.socket.on('error', self.socketErrorHandler);
    };

    self.socketDataHandler = function(buffer) {
        if (self.rejected == true) {
            // if we've rejected this client, ignore all incoming data
            return;
        }

        // check for an empty buffer (this would happen if someone ctrl-c'd a
        // shorty client connected to a shorty server
        if (buffer == undefined) {
            if ( DEBUG ) { console.log("Dropped invalid data"); }
            return;
        }

        // parse the current data buffer, passing in any old buffered data from
        // split PDUs
        var parsedBuffer = pdu.fromBuffer(buffer, self.splitPacketBuffer);
        var myPdus = parsedBuffer['pdus'];
        self.splitPacketBuffer = parsedBuffer['splitPacketBuffer'];
        var myPdu;

        // sanity check
        if (myPdus != undefined) {
            for (var i = 0; i < myPdus.length; i++) {
                myPdu = myPdus[i];

                // if the PDU was broken or malformed in some way, just drop it
                if (myPdu == false) {
                    if ( DEBUG ) { console.log("Dropped invalid data"); }
                    continue;
                }

                if ( DEBUG ) { console.log('Incoming PDU : ' + smpp.command_ids[myPdu.command_id]); }

                // don't allow anything but bind requests before the client is bound!
                if (self.bound == false) {
                    if (!(myPdu.command_id == smpp.commands.bind_transceiver
                                || myPdu.command_id == smpp.commands.bind_receiver
                                || myPdu.command_id == smpp.commands.bind_transmitter)) {

                        if ( DEBUG ) { console.log('cannot accept commands before binding'); }
                        continue;
                    }
                }

                switch (myPdu.command_id) {
                    case smpp.commands.bind_receiver:
                    case smpp.commands.bind_transceiver:
                    case smpp.commands.bind_transmitter:
                        // bind_transceiver
                        if (DEBUG) { console.log('transceiver attempting bind'); }
                        self.handleBind(myPdu);
                        break;

                    case smpp.commands.enquire_link:
                        if (DEBUG) { console.log('enquire_link_resp sent; seq: ' + myPdu.sequence_number); }
                        self.handleEnquireLink(myPdu);
                        break;

                    case smpp.commands.enquire_link_resp:
                        // note the time!
                        var d = new Date();
                        self.enquire_link_resp_received = d.getTime();
                        break;

                    case smpp.commands.submit_sm:
                        self.handleSubmitSm(myPdu);
                        break;

                    case smpp.commands.deliver_sm_resp:
                        self.handleDeliverSmResp(myPdu);
                        break;
                    
                    case smpp.commands.unbind:
                        self.sendPdu(smpp.unbind_resp(myPdu.sequence_number));
                        self.socket.end();
                        self.bound = false;
                        break;

                    case smpp.commands.unbind_resp:
                        self.bound = false;
                        self.socket.destroy();
                        break;
                }
            }
        }
    };

    self.deliverMessage = function(sender, recipient, message) {
        if (self.bind_type == smpp.TRANSMITTER) {
            return false;
        }

        var mySms = sms.create(sender, recipient, message);
        return self.deliver_sm(mySms);
    };

    self.handleSubmitSm = function(myPdu) {
        // parse the PDU body into an sms object
        var mySms = sms.fromPdu(myPdu);
        
        if (self.bind_type == smpp.RECEIVER) {
            self.submitResponse(mySms, false);
        }

        // fire the callback
        if (typeof self.callbacks['receiveOutgoing'] == 'function') {
            self.callbacks['receiveOutgoing'](mySms, self, self.submitResponse);
        }
    };
    
    self.unbind = function() {
        var myPdu = smpp.unbind(++self.sequence_number);
        self.sendPdu(myPdu);
    }; 

    self.submitResponse = function(mySms, success) {
        message_id = "";
        if (success == false) {
            var newPdu = smpp.submit_sm_resp(mySms.sequence_number, message_id, false);
        } else {
            var newPdu = smpp.submit_sm_resp(mySms.sequence_number, message_id, true);
        }

        self.sendPdu(newPdu);
    };

    // this is our timeout function; it makes sure the connection
    // is still good and that the client on the other end is okay
    self.enquire_link = function() {
        // increment the sequence number for all outgoing requests
        self.sequence_number++;
        if ( DEBUG ) { console.log('sent enquire_link to connection ' + self.connection_id + '; seq: ' + self.sequence_number); }
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

    self.handleEnquireLink = function(oldPdu) {
        var newPdu = smpp.enquire_link_resp(oldPdu.sequence_number);
        self.sendPdu(newPdu);
    };

    self.deliver_sm = function(mySms) {
        // increment the sequence number for all outgoing requests
        mySms.sequence_number = self.sequence_number++;

        var myPdu = smpp.deliver_sm(mySms);
        self.sendPdu(myPdu);

        return mySms.sequence_number;
    };

    self.handleDeliverSmResp = function(myPdu) {
        // the client accepted the SMS delivery, so we're going to fire the
        // delivery application hook so the application knows it doesn't have
        // to retry
        if (typeof self.callbacks['deliverySuccess'] == 'function') {
            self.callbacks['deliverySuccess'](myPdu.sequence_number);
        }
    };

    self.handleBind = function(myPdu) {
        /*
         *  Parse the PDU body
         */
        var payload = myPdu.pdu_body;
        for (var i = 0; i < 16; i++ ) {
            if (payload.toString('ascii', i, i+1) == "\0") { break; }
            self.system_id += payload.toString('ascii', i, i+1);
        }

        for (i++; i < 25; i++) {
            if (payload.toString('ascii', i, i+1) == "\0") { break; }
            self.password += payload.toString('ascii', i, i+1);
        }

        for (i++; i < 38; i++) {
            if (payload.toString('ascii', i, i+1) == "\0") { break; }
            self.system_type += payload.toString('ascii', i, i+1);
        }

        i++;
        self.interface_version = payload[i];

        i++;
        self.addr_ton = payload[i];

        i++;
        self.addr_npi = payload[i];

        for (i++; i < payload.length; i++) {
            if (payload.toString('ascii', i, i+1) == "\0") { break; }
            self.addr_range += payload.toString('ascii', i, i+1);
        }

        switch (myPdu.command_id) {
            case smpp.commands.bind_receiver:
                self.bind_type = smpp.RECEIVER;
                break;
            case smpp.commands.bind_transceiver:
                self.bind_type = smpp.TRANSCEIVER;
                break;
            case smpp.commands.bind_transmitter:
                self.bind_type = smpp.TRANSMITTER;
                break;
        }

        /*
         *  Ask the callback (if there is one) if the credentials are okay
         */
        if (typeof self.callbacks['bindRequest'] == 'function') {
            self.callbacks['bindRequest'](self, function(bindAllowed) {
                self.bindAuthorizationComplete(myPdu, bindAllowed);
            });
        } else {
            self.bindAuthorizationComplete(myPdu, true);
        }
    };

    self.bindAuthorizationComplete = function(myPdu, bindAllowed) {
        /*
         *  Create a new PDU with our response
         */
        if (bindAllowed) {
            var newPdu = smpp.bind_resp(myPdu.command_id, myPdu.sequence_number, self.config.system_id);
            self.bound = true;
            self.socket.setTimeout(self.config.timeout * 1000);
            self.socket.on('timeout', self.enquire_link);
        } else {
            // for strict compliance with SMPPv3.4, we're supposed to tell clients that their credentials
            // were incorrect (if they were). the Shorty developers think that this is a bad security practice
            // so we offer another option
            if (self.config.strict == 1) {
                var newPdu = smpp.bind_resp(myPdu.command_id, myPdu.sequence_number, self.config.system_id, true);
            } else {

                // outside of strict mode, Shorty will reject this connection, meaning that all incoming data
                // will be completely ignored, and will set a timer to end the connection in 10 seconds.
                // this is designed to slow down would-be attackers attempting to compromise the system

                // TODO: we need some sort of method to really detect attempts to compromise the system

                self.bound = false;
                self.rejected = true;
                // slow down attackers
                setTimeout(self.socket.end, 10000);
                return;
            }
        }

        self.sendPdu(newPdu);

        if (typeof self.callbacks['bindSuccess'] == 'function') {
            self.callbacks['bindSuccess'](self.system_id, self.password, self.system_type, self.bind_type);
        }
    };

    self.sendPdu = function(myPdu) {

        if (self.sequence_number >= 2000000000) {
            self.sequence_number = 1;
        }

        if (self.socket.readyState == 'open') {
            self.socket.write(myPdu.toBuffer());
        } else {
            return false;
        }
    };

    self.destroy = function() {
        self.socket.setTimeout(0);
    };

    self.connectionClose = function() {
        if (typeof self.closeConnectionServerCallback == 'function') {
            self.closeConnectionServerCallback(self.connection_id);
        }

        self.destroy();
    };

    self.socketErrorHandler = function(e) {
        switch(e.errno) {
            case 32:
                // Broken pipe
                if ( DEBUG ) { console.log('unexpected client disconnect'); }
                self.socket.destroy();
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
                if ( DEBUG ) { console.log('unknown socket error; closing socket'); }
                self.socket.destroy();
                break;
        }

        self.destroy();
    };
}
