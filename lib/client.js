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
    events  = require('events'),
    util    = require('util'),
    writer  = require('./pdu-writer'),
    smpp    = require('./smpp-definitions'),
    data    = require('./data-handler')
    common  = require('./common');

exports.client = function(config) {
    var self = this;
    self.config = config;
    self.socket = {};
    self.sequence_number = 1;
    self.bound = false;
    self.bind_type = 0;
    self.connect_time;
    self.start_time = new Date();
    self.shouldReconnect = true;

    self.reconnectTimer = false;

    self.splitPacketBuffer = new Buffer(0);

    self.setupReconnect = function() {
        self.sequence_number = 1;
        self.bound = false;
        self.bind_type = 0;
        self.splitPacketBuffer = new Buffer(0);

        self.connect();
    };

    self.reconnect = function() {
        var reconnect;

        if (self.shouldReconnect && self.reconnectTimer === false) {
            if (config.client_reconnect_interval !== undefined) {
                reconnect = parseInt(config.client_reconnect_interval);
            } else {
                reconnect = 2500;
            }

            self.reconnectTimer = setInterval(self.setupReconnect, reconnect);
        }
    };

    self.getSeqNum = function() {
        if (self.sequence_number > 0x7FFFFFFF) {
            self.sequence_number = 1;
        }

        return ++self.sequence_number;
    };

    self.connect = function() {
        // try connecting to the host:port from the config file
        self.socket = net.createConnection(self.config.port, self.config.host);
        self.socket.on('end', self.connectionClose);
        self.socket.on('close', self.connectionClose);
        self.socket.on('error', self.socketErrorHandler);

        self.socket.on('connect', function() {
            self.connect_time = new Date();

            clearInterval(self.reconnectTimer);
            self.reconnectTimer = false;

            // attempt a bind immediately upon connection
            self.bind();
        });

        self.socket.on('data', function(buffer) {
            var parsedBuffer, pdus, pdu, i;

            // it is possible that PDUs could be split up between TCP packets
            // so we need to keep track of anything that's been split up
            try {
                parsedBuffer = data.fromBuffer(buffer, self.splitPacketBuffer);
            } catch (ex) {
                self.emit('error', ex);
            }

            pdus = parsedBuffer.pdus;
            self.splitPacketBuffer = parsedBuffer.splitPacketBuffer;

            // handle each PDU separately
            for (i = 0; i < pdus.length; i++) {
                pdu = pdus[i];

                switch (pdu.command_id) {
                    case smpp.commands.deliver_sm:
                        self.handleDeliverSm(pdu);
                        break;
                    case smpp.commands.enquire_link:
                        self.handleEnquireLink(pdu);
                        break;
                    case smpp.commands.enquire_link_resp:
                        self.handleEnquireLinkResp(pdu);
                        break;
                    case smpp.commands.submit_sm_resp:
                        self.handleSubmitSmResp(pdu);
                        break;
                    case smpp.commands.bind_receiver_resp:
                    case smpp.commands.bind_transmitter_resp:
                    case smpp.commands.bind_transceiver_resp:
                        self.handleBindResp(pdu);
                        break;
                    case smpp.commands.unbind:
                        self.handleUnbind(pdu);
                        break;
                    case smpp.commands.unbind_resp:
                        self.handleUnbindResp(pdu);
                        break;
                    default:
                        break;
                }
            }
        });
    };

    /**
     * We received a deliver_sm PDU from the SMSC. We need to send a
     * deliver_sm_resp to the SMSC and emit an event notifying the application
     * code that a message was delivered.
     */
    self.handleDeliverSm = function(pdu) {
        self.emit('deliver_sm', pdu);
        
        var newPdu = {
            command: "deliver_sm_resp",
            command_status: "ESME_ROK",
            sequence_number: pdu.sequence_number,
            fields: {
                message_id: ""
            },
            optional_params: {}
        };

        self.sendPdu(newPdu);
    };

    self.handleEnquireLink = function(pdu) {
        // TODO update to work with new code
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
        d = new Date();
        self.enquire_link_resp_received = d.getTime();
    };

    self.handleSubmitSmResp = function(pdu) {
        self.emit('submit_sm_resp', pdu);
    };

    self.handleBindResp = function(pdu) {
        // If the bind was successful (no error code)
        if (pdu.command_status === smpp.command_status.ESME_ROK.value) {
            self.bound = true;

            // determine the bind type
            switch(pdu.command_id) {
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

            self.emit('bindSuccess', pdu);

            if (self.config.client_keepalive !== undefined && self.config.client_keepalive === true) {
                self.socket.setTimeout(self.config.timeout * 1000);
                self.socket.on('timeout', self.enquire_link);
            }
        } else {
            self.bound = false;
            self.bind_type = smpp.UNBOUND;

            self.emit('bindFailure', pdu);

            self.socket.destroy();
        }
    };

    /**
     * We are being asked to unbind. Tasks: send an unbind_resp PDU, close the
     * socket, reset some states, and notify the application code.
     */
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
        
        self.emit('unbind', pdu);
    };

    /**
     * Our unbind notification was successful. Tasks: close the socket, notify
     * the application code
     */
    self.handleUnbindResp = function(pdu) {
        self.socket.destroy();
        self.bind_type = smpp.UNBOUND;
        self.bound = false;

        self.emit('unbind_resp', pdu);
    };

    /*
     * The return value of this method is the submit_sm's SMPP sequence number
     * it can be used by the user implementation to track responses; potential
     * use is up to the user, and it's not necessary if it doesn't matter
     * whether messages were sent without error
     */
    self.sendMessage = function(params, optional) {
        var pdu, success;

        if (self.bind_type === smpp.RECEIVER || self.bind_type === smpp.UNBOUND) {
            return false;
        }

        if (params.sm_length === undefined) {
            if (params.short_message !== undefined) {
                if (Buffer.isBuffer(params.short_message)) {
                    params.sm_length = params.short_message.length;
                } else {
                    params.sm_length = Buffer.byteLength(params.short_message);
                }
            }
        }

        pdu = {
            command: "submit_sm",
            command_status: "ESME_ROK",
            sequence_number: self.getSeqNum(),
            fields: params,
            optional_params: optional
        };

        success = self.sendPdu(pdu);

        if (success === false) {
            return false;
        }

        return pdu.sequence_number;
    };

    // this is our timeout function; it makes sure the connection
    // is still good and that the client on the other end is okay
    self.enquire_link = function() {
        // increment the sequence number for all outgoing requests
        var pdu = {
            command: "enquire_link",
            command_status: "ESME_ROK",
            sequence_number: self.getSeqNum(),
            fields: {},
            optional_params: {}
        };

        self.sendPdu(pdu);
        setTimeout(self.check_enquire_link_status, 10000); // check for enquire_link_resp within 10 seconds
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
            self.socket.destroy();
        }
    };

    self.bind = function() {
        var command, pdu;

        if (self.config.mode === "receiver") {
            command = "bind_receiver";
        } else if (self.config.mode === "transmitter") {
            command = "bind_transmitter";
        } else {
            command = "bind_transceiver";
        }

        pdu = {
            command: command,
            command_status: "ESME_ROK",
            sequence_number: self.getSeqNum(),
            fields: {
                system_id: self.config.system_id,
                password: self.config.password,
                system_type: self.config.system_type,
                interface_version: 0x34,
                addr_ton: 0,
                addr_npi: 1,
                address_range: ""
            },
            optional_params: {}
        };

        self.sendPdu(pdu);
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

    self.sendPdu = function(pdu) {
        if (self.socket.readyState === 'open') {
            self.socket.write(writer.write(pdu));
            return true;
        } else {
            self.socket.destroy();
            return false;
        }
    };

    self.connectionClose = function(e) {
        self.emit('disconnect');

        self.bind_type = smpp.UNBOUND;
        self.bound = false;

        self.reconnect();
    };

    self.socketErrorHandler = function(e) {
        self.emit('socketError', e);
        self.socket.destroy();
    };
};

util.inherits(exports.client, events.EventEmitter);
