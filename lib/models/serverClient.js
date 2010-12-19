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

exports.fromSocket = function(socket, connectionEndCallback) {
    client = new serverClient(socket);
    client.init(client.socketDataHandler, connectionEndCallback);
    return client;
}

var serverClient = function(socket) {
    var self = this;

    self.connection_id = socket.fd;
    self.socket = socket;
    self.sequence_number = 0;
    self.bound = false;

    self.init = function(connectionEndCallback) {
        self.socket.on('data', self.socketDataHandler);
        if (typeof connectionEndCallback == 'function') {
            self.socket.on('end', connectionEndCallback);
        }
    };

    self.socketDataHandler = function(buffer) {
        myPdu = pdu.fromBuffer(buffer);
        if ( DEBUG ) { console.log('Incoming PDU : ' + smpp.command_ids[myPdu.command_id]); }
        sys.puts(sys.inspect(buffer));

        switch (myPdu.command_id) {
            case 0x00000009:
                // bind_transceiver
                if (DEBUG) { console.log('transceiver attempting bind'); }
                self.bind_transceiver_resp(myPdu);
                break;
        }
        console.log(buffer.toString());
    };

    self.bind_transceiver_resp = function(myPdu) {

    }
}
