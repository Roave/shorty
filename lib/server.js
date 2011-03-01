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
 * @package    server
 */

var net     = require('net'),
    sys     = require('sys'),
    smpp    = require('./smpp'),
    pdu     = require('./models/pdu'),
    sms     = require('./models/sms'),
    client  = require('./models/serverClient');

exports.server = function(config) {
    var self = this;

    // save the config, create objects
    self.config = config;
    self.server = {};
    self.clients = [];
    self.started = false;

    // this callback object will be passed into each client when it connects
    // it shouldn't be modified after we begin accepting connections, as it
    // will not retroactively apply to already-connected clients
    self.clientCallbacks = {};
    self.clientOn = function(eventName, callback) {
        if (self.started) { throw "cannot add client callback after launching server"; }
        if (typeof callback == 'function') {
            self.clientCallbacks[eventName] = callback;
        }
    };

    self.start = function() {
        // create the server object with a method that listens for incoming connections
        self.server = net.createServer(self.connectionListener);

        // start listening on the config port/host; the callback here is just called when
        // the server is bound
        self.server.listen(self.config.port, self.config.host, function() {
            if ( DEBUG ) { console.log('listening on ' + self.config.host + ':' + self.config.port); }
        });

        // handle errors
        self.server.on('error', self.serverErrorHandler);

        // we know we've started; don't remember what this was used for
        self.started = true;
    };

    self.stop = function() {
        for (var key in self.clients) {
            if (self.clients[key] != undefined) {
                self.clients[key].unbind();
            }
        }
    };

    /*
     *  Used as a hook to deliver inbound messages to a client
     */
    self.deliverMessage = function(system_id, sender, recipient, message) {
        for (var key in self.clients) {
            // IMPORTANT: if two clients are connected with the same system id, the message
            // will TYPICALLY be delivered to the least-recently connected (but not always!)
            if (self.clients[key].system_id == system_id) {
                return self.clients[key].deliverMessage(sender, recipient, message);
            }
        }

        return false;
    };

    self.connectionListener = function(incomingSocket) {
        if ( DEBUG ) { console.log('incoming connection!'); }

        // add a client and keep track of it
        var myClient = client.fromSocket(incomingSocket, self, self.clientCloseHandler, self.clientCallbacks);
        self.clients[ myClient.connection_id ] = myClient;

        if ( DEBUG ) { console.log(sys.inspect(self.clients)) };
    };

    self.serverErrorHandler = function(e) {
        if ( DEBUG ) { console.log(sys.inspect(e)); }
    };

    self.clientCloseHandler = function(id) {
        if (DEBUG) { console.log('connection closed'); }
        var myClient = self.clients[ id ];
        delete self.clients[ id ];
        //myClient.socket.destroy();
    };

};
