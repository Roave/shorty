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
    events  = require('events'),
    util    = require('util'),
    writer  = require('./pdu-writer'),
    data    = require('./data-handler'),
    smpp;

var serverConnection = function(socket, server, closeConnectionServerCallback, smppDefs) {
    var self = this;

    smpp = smppDefs;
    writer.setSmppDefinitions(smpp);
    data.setSmppDefinitions(smpp);

    self.socket = socket;
    self.sequence_number = 1;
    self.bound = false;

    self.server = server;
    self.config = server.config;

    // server callback for when the connection closes (to clean up the client object)
    self.closeConnectionServerCallback = closeConnectionServerCallback;

    self.bind_type = 0;

    self.pdusReceived = {};
    self.pdusSent = {};
    self.connect_time = new Date();

    // initialize the split packet buffer
    self.splitPacketBuffer = new Buffer(0);

    self.enquire_link_resp_received = 0;

    self.getSeqNum = function() {
        if (self.sequence_number > 0x7FFFFFFF) {
            self.sequence_number = 1;
        }

        return ++self.sequence_number;
    };

    self.init = function() {
        self.socket.on('data', self.socketDataHandler);
        self.socket.on('end', self.connectionClose);
        self.socket.on('close', self.connectionClose);
        self.socket.on('error', self.socketErrorHandler);
    };

    self.socketDataHandler = function(buffer) {
        var parsedBuffer, pdus, pdu, i;

        if (self.rejected === true) {
            self.socket.destroy();
            return;
        }

        // check for an empty buffer (this could happen if someone ctrl-c'd a
        // shorty client connected to a shorty server)
        if (buffer === undefined) {
            self.bound = false;
            self.generic_nack();
            self.socket.destroy();
            return;
        }

        // parse the current data buffer, passing in any old buffered data from
        // split PDUs

        try {
            parsedBuffer = data.fromBuffer(buffer, self.splitPacketBuffer);
        } catch (err) {
            self.generic_nack();
            self.emit('smppError', self, err);
            return;
        }

        // something went wrong very with parsing the data the client sent --
        // best to just scrap it and tell them to reconnect
        if (typeof parsedBuffer !== "object") {
            self.generic_nack();
            self.emit('smppError', self, "bad data from client or something");
            return;
        }

        pdus = parsedBuffer.pdus;
        self.splitPacketBuffer = parsedBuffer.splitPacketBuffer;

        for (i = 0; i < pdus.length; i++) {
            pdu = pdus[i];

            if (pdu === false) {
                self.generic_nack();
                return;
            }

            if (self.pdusReceived[pdu.command_id] === undefined) {
                self.pdusReceived[pdu.command_id] = 1;
            } else {
                self.pdusReceived[pdu.command_id]++;
            }

            // don't allow anything but bind requests before the client is bound!
            if (self.bound === false) {
                if (pdu.command_id !== smpp.commands.bind_transceiver && pdu.command_id !== smpp.commands.bind_receiver && pdu.command_id !== smpp.commands.bind_transmitter) {
                    self.error_response(pdu, "ESME_RINVBNDSTS");
                    continue;
                }
            }

            switch (pdu.command_id) {
                case smpp.commands.bind_receiver:
                case smpp.commands.bind_transceiver:
                case smpp.commands.bind_transmitter:
                    self.handleBind(pdu);
                    break;

                case smpp.commands.enquire_link:
                    self.handleEnquireLink(pdu);
                    break;

                case smpp.commands.enquire_link_resp:
                    self.handleEnquireLinkResp();
                    break;

                case smpp.commands.submit_sm:
                    self.handleSubmitSm(pdu);
                    break;

                case smpp.commands.deliver_sm_resp:
                    self.handleDeliverSmResp(pdu);
                    break;

                case smpp.commands.unbind:
                    self.handleUnbind(pdu);
                    break;

                case smpp.commands.unbind_resp:
                    self.handleUnbindResp();
                    break;
            }
        }
    };

    self.error_response = function(pdu, status) {
        var pdu = {
            command: 0x80000000 & pdu.command,
            command_status: status,
            sequence_number: pdu.sequence_number,
            fields: {}
        };
    };

    self.generic_nack = function() {
        var pdu = {
            command: "generic_nack",
            command_status: "ESME_RINVCMDLEN",
            sequence_number: 0,
            fields: {}
        };

        self.sendPdu(pdu);
        self.unbind();
        self.socket.end();
    };

    self.deliverMessage = function(params, optional) {
        // don't try to deliver messages to transmitters
        if (self.bind_type === smpp.TRANSMITTER) {
            return false;
        }

        var pdu = {
            command: "deliver_sm",
            command_status: "ESME_ROK",
            sequence_number: self.getSeqNum(),
            fields: params,
            optional_params: optional
        };

        if (self.sendPdu(pdu)) {
            return pdu.sequence_number;
        } else {
            return false;
        }
    };

    self.unbind = function() {
        var pdu = {
            command: "unbind",
            command_status: "ESME_ROK",
            sequence_number: self.getSeqNum(),
            fields: {},
            optional_params: {}
        };

        self.sendPdu(pdu);
    }; 

    self.handleSubmitSm = function(pdu) {
        if (self.bind_type === smpp.RECEIVER) {
            // TODO send a submit_sm error
            //self.submitResponse(mySms, false);
        }

        self.emit('submit_sm', self, pdu, function(command_status, message_id) {
            if (message_id === undefined) {
                message_id = "";
            }

            var newPdu = {
                command: "submit_sm_resp",
                command_status: command_status,
                sequence_number: pdu.sequence_number,
                fields: {
                    message_id: message_id
                },
                optional_params: {}
            };

            self.sendPdu(newPdu);
        });
    };
    
    // this is our timeout function; it makes sure the connection
    // is still good and that the client on the other end is okay
    self.enquire_link = function() {
        var pdu = {
            command: "enquire_link",
            command_status: "ESME_ROK",
            sequence_number: self.getSeqNum(),
            fields: {},
            optional_params: {}
        };

        self.sendPdu(pdu);
        setTimeout(self.check_enquire_link_status, 10000); // check for enquire_link_resp in 10 seconds
    };

    // when this function runs, it means we sent an enquire_link request
    // about 10 seconds ago, so we need to make sure we got a response
    // since then
    self.check_enquire_link_status = function() {
        var now = (new Date()).getTime();

        // within 15 seconds is okay to account for network latency and
        // system load spikes that could have the possibility of throwing off
        // timers
        if (now - 15000 >= self.enquire_link_resp_received) {
            // if they didn't respond, destroy the connection
            //if ( DEBUG ) { console.log("connection timed out"); }
            self.emit('timeout', self);
            self.socket.destroy();
        }
    };

    self.handleEnquireLink = function(pdu) {
        var newPdu = {
            command: "enquire_link_resp",
            command_status: "ESME_ROK",
            sequence_number: pdu.sequence_number,
            fields: {},
            optional_params: {}
        };

        self.sendPdu(newPdu);
    };

    self.handleEnquireLinkResp = function(pdu) {
        self.enquire_link_resp_received = (new Date()).getTime();
    };

    self.handleDeliverSmResp = function(pdu) {
        // the client accepted the SMS delivery, so we're going to fire the
        // delivery application hook so the application knows it doesn't have
        // to retry
        self.emit('deliver_sm_resp', self, pdu);
    };
    
    self.handleUnbind = function(pdu) {
        var pdu = {
            command: "unbind_resp",
            command_status: "ESME_ROK",
            sequence_number: pdu.sequence_number,
            fields: {}
        };
        
        self.sendPdu(pdu);

        self.socket.destroy();
        self.bind_type = smpp.UNBOUND;
        self.bound = false;
        
        self.emit('unbind', self, pdu);
    };
    
    self.handleUnbindResp = function(pdu) {
        self.socket.destroy();
        self.bind_type = smpp.UNBOUND;
        self.bound = false;

        self.emit('unbind_resp', self, pdu);
    };

    self.handleBind = function(pdu) {
        switch (pdu.command_id) {
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

        // Ask the callback (if there is one) if the credentials are okay
        if (self.listeners('bind').length > 0) {
            self.emit('bind', self, pdu, function(status) {
                self.bindAuthorization(pdu, status);
            });
        } else {
            self.bindAuthorization(pdu, "ESME_ROK");
        }
    };

    self.bindAuthorization = function(pdu, status) {
        var newPdu, command;

        switch (self.bind_type) {
            case smpp.RECEIVER:
                command = "bind_receiver_resp";
                break;
            case smpp.TRANSMITTER:
                command = "bind_transmitter_resp";
                break;
            case smpp.TRANSCEIVER:
                command = "bind_transceiver_resp";
                break;
        }

        newPdu = {
            command: command,
            command_status: status,
            sequence_number: pdu.sequence_number,
            fields: {
                system_id: self.config.system_id
            },
            optional_params: {}
        };

        // Create a new PDU with our response
        if (status === "ESME_ROK") {
            self.system_id = pdu.system_id.toString('ascii');
            self.bound = true;
            self.socket.setTimeout(self.config.timeout * 1000);
            self.socket.on('timeout', self.enquire_link);
        } else {
            self.bound = false;
            self.bind_type = smpp.UNBOUND;
        }

        self.sendPdu(newPdu);

        self.emit('bindSuccess', self, pdu);
    };

    self.sendPdu = function(pdu) {
        if (self.pdusSent[pdu.command_id] === undefined) {
            self.pdusSent[pdu.command_id] = 1;
        } else {
            self.pdusSent[pdu.command_id]++;
        }

        if (self.socket.readyState === 'open') {
            self.socket.write(writer.write(pdu));
            return true;
        } else {
            self.socket.destroy();
            return false;
        }
    };

    self.destroy = function() {
        self.socket.setTimeout(0);
    };

    self.connectionClose = function() {
        if (typeof self.closeConnectionServerCallback === 'function') {
            self.closeConnectionServerCallback(self.connection_id);
        }

        self.emit('disconnect', self);
        self.destroy();
    };

    self.socketErrorHandler = function(e) {
        switch(e.errno) {
            case 32:
                // Broken pipe
                //if ( DEBUG ) { console.log('unexpected client disconnect'); }
                self.socket.destroy();
                break;
            case 104:
                //if (DEBUG) { console.log('SOCKET ERROR (104): connection reset'); }
                self.socket.end();
                break;
            case 111:
                //if (DEBUG) { console.log('SOCKET ERROR (111): connection refused'); }
                self.socket.end();
                break;
            default:
                //if ( DEBUG ) { console.log('unknown socket error; closing socket'); }
                self.socket.destroy();
                break;
        }

        self.destroy();
        self.emit('smppError', self, e);
    };
};

util.inherits(serverConnection, events.EventEmitter);

exports.fromSocket = function(socket, server, connectionEndCallback, smppDefs) {
    var client = new serverConnection(socket, server, connectionEndCallback, smppDefs);
    client.init(client.socketDataHandler);
    return client;
};

